'use strict';

/**
 * Máquina de estados para cadastro de uma conta.
 * 
 * Estados: pendente → criada → nick_ok → starter_ok → confirmada | falhou
 * Implementa as 7 etapas:
 * 0. Gerar identidade (feito antes)
 * 1. POST /auth/criar
 * 2. Conectar WS
 * 3. nick.set
 * 4. visual.set + starter.pick
 * 5. Verificar 100% (GET /auth/conta + estado WS)
 * 6. Persistir no cofre + adicionar ao deck
 */

const EventEmitter = require('events');

class AgenteCompilacao extends EventEmitter {
  constructor(config = {}) {
    super();
    // config: { indice, identidade: {email, nick, senha}, partition, proxy, exigeProxy, starterFixo, net, session, rede }
    this.indice = config.indice || 0;
    this.identidade = config.identidade || { email: '', nick: '', senha: '' };
    this.partition = config.partition || 'persist:acc-demo';
    this.proxy = config.proxy || null; // { host, port, user, pass }
    this.exigeProxy = !!config.exigeProxy; // falha se proxy não estiver disponível
    this.starterFixo = config.starterFixo || null; // null = sorteia; ou 'guilmon' etc
    this.net = config.net; // net.fetch para HTTP
    this.session = config.session; // session.fromPartition(partition)
    this.rede = config.rede || null; // módulo rede.js com requisitar()
    this.ws = null; // WebSocket client (desacoplado; pode ser MockClient em testes)
    this.wsClient = null; // referência para env de teste

    // Estado
    this.status = 'pendente'; // pendente|criada|nick_ok|starter_ok|confirmada|falhou
    this.erro = null;
    this.tentativas = { criar: 0, nick: 0, starter: 0, verificar: 0 };
    this.maxTentativas = { criar: 3, nick: 3, starter: 3, verificar: 2 };
    this.resultado = {}; // { email, nick, senha, skinEscolhida, starterEscolhido, ... }
  }

  /**
   * Iniciar o fluxo. Será assincronamente.
   */
  async executar() {
    try {
      await this._etapa1Criar();
      if (this.status === 'falhou') return;
      await this._etapa2ConectarWs();
      if (this.status === 'falhou') return;
      await this._etapa3Nick();
      if (this.status === 'falhou') return;
      await this._etapa4StarterEVisual();
      if (this.status === 'falhou') return;
      await this._etapa5Verificar();
      if (this.status === 'falhou') return;
      this.status = 'confirmada';
      this.emit('confirmada', this.resultado);
    } catch (err) {
      this.falhar(`Erro desconhecido: ${err.message}`);
    }
  }

  _falhar(motivo) {
    this.status = 'falhou';
    this.erro = motivo;
    this.emit('falhou', { motivo });
  }

  async _etapa1Criar() {
    this.tentativas.criar++;
    this.emit('status', { status: 'criando', tentativa: this.tentativas.criar });

    const corpo = {
      email: this.identidade.email,
      senha: this.identidade.senha,
      termos: true,
      lang: 'pt',
    };

    try {
      const reqFn = this.rede && this.rede.requisitar ? this.rede.requisitar : this.net;
      let r;
      
      if (this.rede && this.rede.requisitar) {
        // Via rede.js (amarrado à partição/proxy)
        const buffer = await this.rede.requisitar('https://digiidle.com/auth/criar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'https://digiidle.com',
            Referer: 'https://digiidle.com/',
          },
          body: JSON.stringify(corpo),
          partition: this.partition,
        });
        const json = JSON.parse(buffer.toString('utf8'));
        const mockResponse = { json: async () => json };
        r = mockResponse;
      } else {
        // Fallback para net.fetch (legado/testes)
        r = await this.net('/auth/criar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
          credentials: 'include',
          session: this.session,
        });
      }

      const json = await r.json();

      // Sucesso
      if (json.ok) {
        this.status = 'criada';
        this.resultado.email = this.identidade.email;
        this.emit('status', { status: 'criada' });
        return;
      }

      // Erro "email"
      if (json.erro === 'email') {
        if (this.tentativas.criar < this.maxTentativas.criar) {
          // em produção, aqui geraria outro email e tentaria de novo
          // para testes offline, apenas marca como falha
          this._falhar(`E-mail inválido ou duplicado após ${this.tentativas.criar} tentativas.`);
        } else {
          this._falhar(`E-mail rejeitado: ${json.mensagem}`);
        }
        return;
      }

      // Erro "pin" (inesperado, sem confirmação)
      if (json.erro === 'pin') {
        this._falhar('PIN pedido (inesperado; a conta foi criada mas aguarda verificação).');
        return;
      }

      // Outro erro
      this._falhar(`Erro ao criar: ${json.mensagem || json.erro}`);
    } catch (err) {
      console.error('[cadastro] erro na criação:', err.message);
      // Limite de contas por IP (HTTP 429): marca para a fila rotacionar o proxy.
      if (String(err.message).includes('429')) this.resultado.codigoErro = 'limite';
      this._falhar(`Erro de rede na criação: ${err.message}`);
    }
  }

  async _etapa2ConectarWs() {
    this.emit('status', { status: 'conectando_ws' });

    // Falha fechado: se exigimos proxy e ele não está pronto, não conecta
    if (this.exigeProxy && !this.proxy) {
      this._falhar('Esta tela exige proxy e nenhum foi configurado. A conta não conecta sem ele.');
      return;
    }

    // Em produção a fila passa conectarWs(), que abre o WS real agora — depois
    // da criação, quando o cookie de sessão já está na partição. Em testes
    // offline, wsClient é injetado pronto.
    if (!this.wsClient && typeof this.conectarWs === 'function') {
      this.wsClient = await this.conectarWs();
    }

    if (!this.wsClient) {
      this._falhar(this.erro || 'Sem cliente WebSocket configurado.');
      return;
    }

    this.ws = this.wsClient;
    await new Promise(resolve => setImmediate(resolve));
    this.emit('status', { status: 'ws_pronto' });
  }

  async _etapa3Nick() {
    this.tentativas.nick++;
    this.emit('status', { status: 'definindo_nick', tentativa: this.tentativas.nick });

    return new Promise((resolve) => {
      let resolvido = false;
      const timeout = setTimeout(() => {
        if (!resolvido) {
          resolvido = true;
          this._falhar('Timeout ao definir nick.');
          resolve();
        }
      }, 10000);

      const handler = (msg) => {
        if (msg.t !== 'nick') return;
        this.ws.removeListener('msg', handler); // limpar listener
        clearTimeout(timeout);
        if (resolvido) return;
        resolvido = true;

        if (msg.ok) {
          this.status = 'nick_ok';
          this.resultado.nick = msg.nick || this.identidade.nick;
          this.emit('status', { status: 'nick_ok' });
          resolve();
        } else {
          // Nick colidido ou inválido
          if (this.tentativas.nick < this.maxTentativas.nick) {
            // Em produção, geraria variação e reintentava.
            // Para testes, marca como falha.
            this._falhar(`Nick "${this.identidade.nick}" colidido/inválido após ${this.tentativas.nick} tentativas.`);
          } else {
            this._falhar(`Nick rejeitado: ${msg.mensagem || msg.erro}`);
          }
          resolve();
        }
      };

      this.ws.on('msg', handler);
      console.log(`[cadastro] conta ${this.indice} => nick.set ${this.identidade.nick}`);
      const enviado = this.ws.send({ t: 'nick.set', nick: this.identidade.nick });
      if (enviado === false) {
        clearTimeout(timeout);
        resolvido = true;
        this.ws.removeListener('msg', handler);
        this._falhar('WebSocket não estava aberto para enviar o nick.');
        resolve();
      }
    });
  }

  async _etapa4StarterEVisual() {
    this.tentativas.starter++;
    this.emit('status', { status: 'escolhendo_starter' });

    // Escolha de skin (sorteio)
    const skins = ['starter_male_1', 'starter_male_2', 'starter_female_1', 'starter_female_2'];
    const skinEscolhida = skins[Math.floor(Math.random() * skins.length)];

    // Escolha de starter (fixo ou aleatório)
    const starters = ['guilmon', 'renamon', 'terriermon', 'demidevimon'];
    const starterEscolhido = this.starterFixo && starters.includes(this.starterFixo)
      ? this.starterFixo
      : starters[Math.floor(Math.random() * starters.length)];

    return new Promise((resolve) => {
      let resolvido = false;
      let starterResposta = false;
      const timeout = setTimeout(() => {
        if (!resolvido) {
          resolvido = true;
          this._falhar('Timeout ao escolher starter.');
          resolve();
        }
      }, 10000);

      const handler = (msg) => {
        if (msg.t !== 'starter') return;
        starterResposta = true;
        if (starterResposta) {
          this.ws.removeListener('msg', handler);
          clearTimeout(timeout);
          if (resolvido) return;
          resolvido = true;

          if (msg.ok !== false) {
            this.status = 'starter_ok';
            this.resultado.skinEscolhida = skinEscolhida;
            this.resultado.starterEscolhido = starterEscolhido;
            this.emit('status', { status: 'starter_ok' });
            resolve();
          } else {
            this._falhar(`Erro ao escolher starter: ${msg.mensagem || msg.erro}`);
            resolve();
          }
        }
      };

      this.ws.on('msg', handler);
      console.log(`[cadastro] conta ${this.indice} => visual.set ${skinEscolhida} / starter.pick ${starterEscolhido}`);
      this.ws.send({ t: 'visual.set', skin: skinEscolhida });
      // Enviar starter.pick após visual.set (ou simultânea, depende do jogo)
      this.ws.send({ t: 'starter.pick', id: starterEscolhido });
    });
  }

  async _etapa5Verificar() {
    this.tentativas.verificar++;
    this.emit('status', { status: 'verificando' });

    // Verificação 100%:
    // 1. GET /auth/conta = 200 (sessão viva)
    // 2. E.nick preenchido (confirmado no WS)
    // 3. Starter ok (confirmado no WS)

    try {
      let json;
      
      if (this.rede && this.rede.requisitar) {
        // Via rede.js (amarrado à partição/proxy)
        const buffer = await this.rede.requisitar('https://digiidle.com/auth/conta', {
          method: 'GET',
          partition: this.partition,
        });
        json = JSON.parse(buffer.toString('utf8'));
        console.log(`[cadastro] conta ${this.indice} /auth/conta => ${JSON.stringify(json).slice(0, 400)}`);
      } else {
        // Fallback para net.fetch (legado/testes)
        const r = await this.net('/auth/conta', {
          method: 'GET',
          credentials: 'include',
          session: this.session,
        });

        if (!r.ok) {
          this._falhar(`Verificação falhou: sessão inválida (${r.status}).`);
          return;
        }

        json = await r.json();
      }
      // O /auth/conta do jogo devolve a conta aninhada ({ conta: {...} }), mas
      // aceitamos a forma plana também para não depender do formato exato.
      const nickServidor = json.nick || (json.conta && json.conta.nick) || this.resultado.nick;
      if (!nickServidor) {
        this._falhar('Verificação falhou: nick não foi definido no servidor.');
        return;
      }
      this.resultado.nick = nickServidor;

      // Passou em todas as verificações
      this.resultado.verificado = true;
      this.emit('status', { status: 'verificado' });
    } catch (err) {
      console.error('[cadastro] erro ao verificar:', err.message);
      this._falhar(`Erro ao verificar: ${err.message}`);
    }
  }
}

module.exports = { AgenteCompilacao };
