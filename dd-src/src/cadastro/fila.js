'use strict';

/**
 * Fila de lote (10 contas) com re-tentativa, cooldown e relatório.
 * - Processa 10 contas em sequência (com intervalo configurável).
 * - Se falhar, re-tenta com nova identidade (novo email/nick).
 * - Relatório de progresso e resultado final.
 */

const EventEmitter = require('events');
const { Gerador } = require('./gerador');
const { session } = require('electron');
const { randomUUID } = require('crypto');

class FilaCadastro extends EventEmitter {
  constructor(config = {}) {
    super();
    // config: { base, preset, customNicks, senha, starterFixo, ritmo, tamanho, listaProxys, net, session, rede, proxyGuard, ctx }
    this.base = config.base || 'tamer';
    // Uma base por tela (bloco de 4). O nome da tela no deck sai daqui.
    this.bases = Array.isArray(config.bases) && config.bases.length ? config.bases : [this.base];
    this.preset = config.preset || 'numeros';
    this.customNicks = config.customNicks || null;
    this.senha = config.senha || '';
    this.starterFixo = config.starterFixo || null;
    this.ritmo = config.ritmo || { entre: 5000, cooldown: 2000 }; // ms
    // Lista completa de proxies salvos; a distribuição entre telas é automática
    // (não é mais um proxy por tela escolhido na mão).
    this.listaProxys = config.listaProxys || config.proxys || [];
    this.net = config.net;
    this.session = config.session;
    this.rede = config.rede || null; // módulo rede.js
    this.proxyGuard = config.proxyGuard || null; // módulo proxy-guard.js
    this.ctx = config.ctx || null; // { state, salvar, novoGroupId }

    this.tamanho = config.tamanho || 10;
    // Distribuição automática por tela: tela -> proxy atribuído
    this.atribuidos = {};
    // Chaves "host:port" descartadas por limite 429 durante este lote
    this.descartados = new Set();
    this.contas = []; // array de { status, resultado, agente, identidade, tela }
    this.gerador = new Gerador({
      base: this.base,
      bases: this.bases,
      preset: this.preset,
      customNicks: this.customNicks,
      senha: this.senha,
    });
    this.emCurso = false;
  }

  /**
   * Iniciar o lote.
   */
  async processar() {
    if (this.emCurso) return;
    this.emCurso = true;

    // Validação prévia: precisa de pelo menos um proxy por tela, todos distintos
    const telasNecessarias = Math.ceil(this.tamanho / 4);
    if (this.listaProxys.length > 0 && this.listaProxys.length < telasNecessarias) {
      this.emCurso = false;
      this.emit('erro', `Faltam proxies: são ${telasNecessarias} telas para ${this.tamanho} contas, mas só há ${this.listaProxys.length} proxies.`);
      return;
    }
    const chaves = new Set();
    for (const p of this.listaProxys) {
      const chave = `${p.host}:${p.port}`;
      if (chaves.has(chave)) {
        this.emCurso = false;
        this.emit('erro', 'Proxies duplicados: cada proxy deve ser distinto (host:port)');
        return;
      }
      chaves.add(chave);
    }

    this.contas = [];
    for (let i = 0; i < this.tamanho; i++) {
      this.contas.push({
        indice: i,
        tela: Math.floor(i / 4), // bloco de 4
        status: 'pendente',
        resultado: null,
        agente: null,
        identidade: null,
        tentativas: 0,
      });
    }

    this.emit('inicio', { tamanho: this.tamanho });

    for (let i = 0; i < this.tamanho; i++) {
      const conta = this.contas[i];
      await this._processarConta(conta);
      if (i < this.tamanho - 1) {
        // Intervalo entre contas
        await this._esperar(this.ritmo.entre);
      }
    }

    this._finalizarLote();
  }

  async _processarConta(conta) {
    const { AgenteCompilacao } = require('./agente');
    conta.tentativas++;

    // Gerar identidade
    try {
      conta.identidade = this.gerador.gerar(conta.indice);
    } catch (err) {
      conta.status = 'falhou';
      conta.erro = `Gerador: ${err.message}`;
      this.emit('conta', { indice: conta.indice, tela: conta.tela, status: 'falhou', motivo: conta.erro });
      return;
    }

    const tela = conta.tela;
    const temProxys = this.listaProxys.length > 0;
    // Teto de tentativas: uma por proxy disponível na lista (ou 1 sem proxy).
    const maxTentativas = temProxys ? Math.max(1, this.listaProxys.length) : 1;

    for (let tentativa = 0; tentativa < maxTentativas; tentativa++) {
      const proxy = temProxys ? this._proxyDaTela(tela) : null;
      if (temProxys && !proxy) {
        conta.status = 'falhou';
        conta.erro = 'Nenhum proxy disponível (todos em uso ou descartados).';
        this.emit('conta', { indice: conta.indice, tela, status: 'falhou', motivo: conta.erro });
        return;
      }

      // O id da conta no deck nasce aqui, e não depois: a partição do cadastro
      // precisa ser exatamente a que o deck vai usar (persist:acc-<id>), senão o
      // cookie de sessão fica numa partição órfã e a tela criada pede login.
      if (!conta.contaId) conta.contaId = randomUUID();
      const partition = `persist:acc-${conta.contaId}`;

      // Aplicar proxy na partição (antes de qualquer tráfego)
      if (proxy && this.proxyGuard) {
        try {
          const ses = session.fromPartition(partition);
          this.proxyGuard.arm(ses);
          const ok = await this.proxyGuard.apply(ses, proxy);
          if (!ok) {
            conta.status = 'falhou';
            conta.erro = 'Proxy não pôde ser aplicado na partição (falha na sessão do Electron)';
            this.emit('conta', { indice: conta.indice, tela, status: 'falhou', motivo: conta.erro });
            return;
          }
        } catch (err) {
          conta.status = 'falhou';
          conta.erro = `Erro ao aplicar proxy: ${err.message}`;
          this.emit('conta', { indice: conta.indice, tela, status: 'falhou', motivo: conta.erro });
          return;
        }
      }

      // Sonda de diagnóstico: confirma que a criação sai pelo IP do proxy.
      if (proxy && this.rede && this.rede.requisitar) {
        try {
          const buf = await this.rede.requisitar('https://api.ipify.org?format=json', { partition });
          const js = JSON.parse(buf.toString('utf8'));
          console.log(`[cadastro] conta ${conta.indice} (tela ${tela}) sai pelo IP ${js.ip} — proxy ${proxy.host}:${proxy.port}`);
        } catch (e) {
          console.log(`[cadastro] conta ${conta.indice} (tela ${tela}) não conseguiu confirmar IP de saída: ${e.message}`);
        }
      }

      const agente = new AgenteCompilacao({
        indice: conta.indice,
        identidade: conta.identidade,
        partition,
        proxy,
        exigeProxy: !!proxy,
        starterFixo: this.starterFixo,
        net: this.net,
        session: this.session,
        rede: this.rede,
      });

      conta.agente = agente;

      // WebSocket REAL: sem ele, nick e starter nunca chegam ao servidor e a
      // verificação (que é real) sempre reprova a conta.
      //
      // Conectado sob demanda na etapa 2, NUNCA aqui: o handshake precisa do
      // cookie digiclone_sessao, que só existe na partição depois da
      // POST /auth/criar. Conectar antes dava sempre "Sem login nesta conta".
      agente.conectarWs = async () => {
        const ws = await this._conectarWs(partition, proxy, conta);
        if (!ws) agente.erro = conta.erro; // motivo real para o log do lote
        return ws;
      };

      let resultado;
      try {
        resultado = await this._rodarAgente(agente, conta, tela);
      } finally {
        try { if (agente.ws) agente.ws.disconnect(); } catch { /* ignora */ }
      }
      if (!resultado.rotacionar) return; // confirmada ou falhou definitivo

      // Limite 429: rotaciona o proxy da tela e tenta de novo com a mesma identidade.
      this._rotacionarProxy(tela);
      console.log(`[cadastro] conta ${conta.indice} (tela ${tela}) sofreu limite 429 — rotacionando proxy`);
    }

    // Esgotou as rotações de proxy
    conta.status = 'falhou';
    conta.erro = 'Esgotaram as rotações de proxy (limite 429 persistente).';
    this.emit('conta', { indice: conta.indice, tela, status: 'falhou', motivo: conta.erro });
  }

  /**
   * Conecta o WebSocket real da conta recém-criada.
   * O client headless já cuida de cookie da partição, proxy e falha fechado.
   * Devolve null (e preenche conta.erro) se não conectar.
   */
  async _conectarWs(partition, proxy, conta) {
    let DigiiIdleHeadlessClient;
    try {
      ({ DigiiIdleHeadlessClient } = require('../headless/client'));
    } catch (err) {
      conta.erro = `Cliente WebSocket indisponível: ${err.message}`;
      return null;
    }

    const cliente = new DigiiIdleHeadlessClient(conta.indice, partition, {
      proxy,
      exigeProxy: !!proxy,
      name: conta.identidade.nick,
    });
    // Durante o cadastro uma queda é falha da conta, não algo para insistir.
    cliente.autoReconnect = false;

    // Diagnóstico: todo pacote do servidor durante o onboarding.
    cliente.on('msg', (m) => {
      console.log(`[cadastro:ws ${conta.indice}] <= ${JSON.stringify(m).slice(0, 300)}`);
    });

    return new Promise((resolve) => {
      let resolvido = false;
      const encerrar = (valor, motivo) => {
        if (resolvido) return;
        resolvido = true;
        clearTimeout(timer);
        if (motivo) conta.erro = motivo;
        resolve(valor);
      };

      const timer = setTimeout(() => {
        try { cliente.disconnect(); } catch { /* ignora */ }
        encerrar(null, 'Timeout ao conectar o WebSocket da conta (20s).');
      }, 20000);

      cliente.once('connected', () => encerrar(cliente, null));
      cliente.once('error', (motivo) => {
        const texto = typeof motivo === 'string' ? motivo : (motivo && motivo.message) || 'desconhecida';
        encerrar(null, `WebSocket não conectou: ${texto}`);
      });

      cliente.connect().catch((err) => encerrar(null, `Erro ao conectar WebSocket: ${err.message}`));
    });
  }

  /** Escolhe um proxy livre para a tela (distinto das demais, não descartado). */
  _proxyDaTela(tela) {
    if (this.atribuidos[tela]) return this.atribuidos[tela];
    const emUsoPorOutras = new Set(
      Object.values(this.atribuidos).map((p) => `${p.host}:${p.port}`)
    );
    for (const p of this.listaProxys) {
      const chave = `${p.host}:${p.port}`;
      if (emUsoPorOutras.has(chave)) continue;
      if (this.descartados.has(chave)) continue;
      this.atribuidos[tela] = p;
      return p;
    }
    return null;
  }

  /** Descarta o proxy atual da tela (por 429) e devolve o próximo disponível. */
  _rotacionarProxy(tela) {
    const atual = this.atribuidos[tela];
    if (atual) this.descartados.add(`${atual.host}:${atual.port}`);
    delete this.atribuidos[tela];
    return this._proxyDaTela(tela);
  }

  /** Roda um agente até o fim; retorna { rotacionar } se falhou por 429. */
  _rodarAgente(agente, conta, tela) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (res) => {
        if (!done) {
          done = true;
          resolve(res);
        }
      };

      agente.on('status', (ev) => {
        this.emit('conta:status', { indice: conta.indice, ...ev });
      });

      agente.on('confirmada', (resultado) => {
        conta.status = 'confirmada';
        // contaId/proxy/senha viajam junto: é com isso que o renderer cria a
        // tela, amarra o proxy e liga o headless sem pedir login de novo.
        conta.resultado = {
          ...resultado,
          tela,
          baseNick: this.bases[tela] || this.base,
          contaId: conta.contaId,
          nick: resultado.nick || conta.identidade.nick,
          email: conta.identidade.email,
          senha: conta.identidade.senha,
          proxy: this.atribuidos[tela] || null,
        };
        this.emit('conta', { indice: conta.indice, tela, status: 'confirmada', resultado: conta.resultado });
        finish({ rotacionar: false });
      });

      agente.on('falhou', (ev) => {
        const codigo = agente.resultado && agente.resultado.codigoErro;
        if (codigo === 'limite') {
          // Marca o status intermediário de rotação
          this.emit('conta:status', { indice: conta.indice, status: 'rotacionando_proxy' });
          finish({ rotacionar: true });
        } else {
          conta.status = 'falhou';
          conta.erro = ev.motivo;
          this.emit('conta', { indice: conta.indice, tela, status: 'falhou', motivo: ev.motivo });
          finish({ rotacionar: false });
        }
      });

      const timeout = setTimeout(() => {
        if (!done) {
          conta.status = 'falhou';
          conta.erro = 'Timeout global (60s).';
          this.emit('conta', { indice: conta.indice, status: 'falhou', motivo: conta.erro });
          finish({ rotacionar: false });
        }
      }, 60000);

      agente.executar().catch((err) => {
        conta.status = 'falhou';
        conta.erro = err.message;
        this.emit('conta', { indice: conta.indice, status: 'falhou', motivo: conta.erro });
        clearTimeout(timeout);
        finish({ rotacionar: false });
      });
    });
  }

  _esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _finalizarLote() {
    const confirmadas = this.contas.filter((c) => c.status === 'confirmada').length;
    const falhadas = this.contas.filter((c) => c.status === 'falhou').length;

    const relatorio = {
      tamanho: this.tamanho,
      confirmadas,
      falhadas,
      contas: this.contas.map((c) => ({
        indice: c.indice,
        tela: c.tela,
        baseNick: this.bases[c.tela] || this.base,
        status: c.status,
        contaId: c.contaId,
        email: c.identidade?.email,
        nick: c.identidade?.nick,
        senha: c.identidade?.senha,
        proxy: this.atribuidos[c.tela] || null,
        resultado: c.resultado,
        erro: c.erro,
      })),
    };

    this.emCurso = false;
    this.emit('fim', relatorio);
  }

  /**
   * Relatório resumido.
   */
  relatorio() {
    const confirmadas = this.contas.filter((c) => c.status === 'confirmada').length;
    return {
      tamanho: this.tamanho,
      confirmadas,
      falhadas: this.tamanho - confirmadas,
      taxa: confirmadas === this.tamanho ? '✅ 100%' : `⚠️ ${confirmadas}/${this.tamanho}`,
    };
  }
}

module.exports = { FilaCadastro };
