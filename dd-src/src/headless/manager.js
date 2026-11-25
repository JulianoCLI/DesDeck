'use strict';
const EventEmitter = require('events');
const { DigiiIdleHeadlessClient } = require('./client');

/**
 * Gerenciador de clientes headless. Mantém múltiplas contas rodando,
 * agrega eventos, sincroniza com a UI via IPC.
 */
// Espera entre a entrada de uma conta e a da seguinte. Quem liga 4 contas de
// uma vez (botão de ligar tudo, boot com bootHeadless) faria 4 autenticações no
// mesmo instante, do mesmo IP — o padrão mais visível que este app pode
// produzir. A faixa é sorteada por conta, então a sequência nunca é a mesma.
const ENTRADA_MIN_MS = 3000;
const ENTRADA_MAX_MS = 11000;

// De quanto em quanto o card de uma conta e atualizado. O pacote 'estado' chega
// varias vezes por minuto e o resumo monta nome, retrato e contadores: refazer
// isso a cada pacote, vezes 8 contas, seria trabalho jogado fora - ninguem le um
// card que muda 20x por minuto.
const PAINEL_MIN_MS = 2000;

class HeadlessManager extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // accountIndex -> DigiiIdleHeadlessClient
    // Quando a próxima conta pode entrar. Cada start() reserva o seu lugar na
    // fila, então a ordem de chegada é respeitada sem ninguém ficar sem vez.
    this.proximaEntrada = 0;
    this.entradas = new Map(); // accountIndex -> timer da entrada agendada
    this.painelEm = new Map(); // accountIndex -> quando o card foi atualizado
  }

  /**
   * Monta o resumo do card e manda para a UI, no maximo a cada PAINEL_MIN_MS.
   * Falha em silencio: um card sem retrato e um detalhe, nao um motivo para
   * derrubar a conta.
   */
  mandarPainel(accountIndex, client) {
    const agora = Date.now();
    if (agora - (this.painelEm.get(accountIndex) || 0) < PAINEL_MIN_MS) return;
    this.painelEm.set(accountIndex, agora);

    const { resumo } = require('./painel');
    resumo(client.state)
      .then((p) => {
        if (p && this.clients.get(accountIndex) === client) {
          this.emit('account:painel', { index: accountIndex, painel: p });
        }
      })
      .catch((err) => console.error(`[headless:painel] conta ${accountIndex}:`, err.message));
  }

  /**
   * Inicia um cliente headless para uma conta.
   * @param {number} accountIndex - índice da conta (0-based)
   * @param {string} partition - partição Electron, ex: 'persist:acc-abc123'
   * @param {object} options - { name?, ... }
   */
  start(accountIndex, partition, options = {}) {
    this.stop(accountIndex); // idempotent: para a anterior se existir

    const client = new DigiiIdleHeadlessClient(accountIndex, partition, options);

    client.on('update', () => {
      this.emit('account:update', { index: accountIndex, state: client.state });
      this.mandarPainel(accountIndex, client);
    });

    client.on('status', (status) => {
      this.emit('account:status', { index: accountIndex, status });
    });

    client.on('error', (message) => {
      this.emit('account:error', { index: accountIndex, message });
    });

    client.on('connected', () => {
      console.log(`[headless] conta ${accountIndex} conectada`);
    });

    client.on('disconnected', () => {
      console.log(`[headless] conta ${accountIndex} desconectada`);
    });

    client.on('offline-cfg', (cfg) => {
      this.emit('account:offline-cfg', { index: accountIndex, cfg });
    });

    client.on('battle', (battle) => {
      this.emit('account:battle', { index: accountIndex, battle });
    });

    // As atividades do painel (captura de ovo, ovo chocado, drop, log das
    // ferramentas). Sem limite de taxa: cada uma e um acontecimento unico, e
    // perder uma captura SSS para economizar um IPC nao se justifica.
    client.on('atividade', (a) => {
      // A captura carrega um ovo cru: a letra e o retrato dele so existem aqui
      // (catalogos via net.request, data-URL por causa da CSP da janela).
      if (a && a.tipo === 'captura' && a.ovo) {
        require('./ovos').enriquecer(a.ovo)
          .then((ovo) => this.emit('account:atividade', { index: accountIndex, atividade: { ...a, ovo } }))
          .catch(() => this.emit('account:atividade', { index: accountIndex, atividade: a }));
        return;
      }
      // Se o item dropado é raro quem decide é o catálogo do jogo: a mesma
      // lista da aba "Itens Raros". Antes era uma lista de exceções minha, e
      // ela deixava passar "Energia de Ovo Bird Instável" (categoria 'datas',
      // que cai a cada poucos abates) como se fosse um achado.
      // A negociação do Mercado traz slugs ('agumon') e ids de item
      // ('token-boss'). O nome bonito está no catálogo, que só existe aqui.
      if (a && a.tipo === 'mercado') {
        require('./ovos').nomeDoNegocio(a)
          .then((nome) => this.emit('account:atividade', { index: accountIndex, atividade: { ...a, nome } }))
          .catch(() => this.emit('account:atividade', { index: accountIndex, atividade: a }));
        return;
      }
      if (a && a.tipo === 'drop' && a.item) {
        require('./catalogo').nomesRaros()
          .then((raros) => this.emit('account:atividade', {
            index: accountIndex, atividade: { ...a, raro: raros.has(a.item) },
          }))
          // Sem catálogo não se inventa: 'raro' fica indefinido e o Painel
          // trata como desconhecido, em vez de encher a lista de lixo.
          .catch(() => this.emit('account:atividade', { index: accountIndex, atividade: a }));
        return;
      }
      this.emit('account:atividade', { index: accountIndex, atividade: a });
    });

    client.on('historico', (h) => {
      require('./ovos').enriquecerLista(h)
        .then((lista) => {
          if (this.clients.get(accountIndex) !== client) return;
          this.emit('account:historico', { index: accountIndex, historico: lista });
        })
        .catch((err) => console.error(`[headless:ovos] conta ${accountIndex}:`, err.message));
    });

    this.clients.set(accountIndex, client);

    // A primeira conta entra na hora; cada seguinte espera a sua vez na fila.
    const agora = Date.now();
    const quando = Math.max(agora, this.proximaEntrada);
    const espera = quando - agora;
    const passo = ENTRADA_MIN_MS + Math.round(Math.random() * (ENTRADA_MAX_MS - ENTRADA_MIN_MS));
    this.proximaEntrada = quando + passo;

    if (!espera) {
      client.connect();
    } else {
      console.log(`[headless] conta ${accountIndex} entra em ${Math.round(espera / 1000)}s (entrada escalonada)`);
      const t = setTimeout(() => {
        this.entradas.delete(accountIndex);
        // Pode ter sido parada enquanto esperava: só conecta se ainda é a conta
        // registrada neste índice.
        if (this.clients.get(accountIndex) === client) client.connect();
      }, espera);
      if (t.unref) t.unref();
      this.entradas.set(accountIndex, t);
    }

    return client;
  }

  /**
   * Para um cliente headless.
   */
  stop(accountIndex) {
    const t = this.entradas.get(accountIndex);
    if (t) { clearTimeout(t); this.entradas.delete(accountIndex); }
    const client = this.clients.get(accountIndex);
    if (client) {
      client.disconnect();
      this.clients.delete(accountIndex);
    }
    this.painelEm.delete(accountIndex);
    // Última conta a sair: os catálogos voltam para a sessão pública, em vez de
    // seguirem presos à partição de uma conta que já não está rodando.
    if (!this.clients.size) {
      try { require('./rede').esquecerParticao(); } catch { /* opcional */ }
    }
  }

  /**
   * Para todos os clientes.
   */
  stopAll() {
    for (const t of this.entradas.values()) clearTimeout(t);
    this.entradas.clear();
    for (const [index, client] of this.clients) {
      client.disconnect();
    }
    this.clients.clear();
    this.painelEm.clear();
    this.proximaEntrada = 0;
  }

  /**
   * Devolve o status de um cliente.
   */
  getStatus(accountIndex) {
    const client = this.clients.get(accountIndex);
    if (!client) {
      return { active: false, status: 'inactive', state: null };
    }
    return {
      active: true,
      status: client.status,
      state: client.state,
      error: client.lastError || null,
    };
  }

  /**
   * Devolve o estado de uma conta.
   */
  getState(accountIndex) {
    const client = this.clients.get(accountIndex);
    return client ? client.state : null;
  }

  /**
   * Envia um comando para uma conta headless.
   * Usado pelas ferramentas.
   */
  send(accountIndex, type, data = {}) {
    const client = this.clients.get(accountIndex);
    if (!client) return false;
    return client.send({ t: type, ...data });
  }

  /**
   * Liga uma ferramenta numa conta headless. Idempotente: se já rodava, só
   * troca a config (o laço em curso passa a ler os valores novos).
   */
  startTool(accountIndex, toolId, config) {
    const client = this.clients.get(accountIndex);
    if (!client) return false;
    return client.startTool(toolId, config);
  }

  /** Desliga uma ferramenta numa conta headless. */
  stopTool(accountIndex, toolId) {
    const client = this.clients.get(accountIndex);
    if (!client) return false;
    return client.stopTool(toolId);
  }

  /**
   * Pede a config de hunts para uma conta.
   */
  requestOfflineCfg(accountIndex) {
    return this.send(accountIndex, 'offline.cfg');
  }

  /**
   * Conta ativa em headless?
   */
  isActive(accountIndex) {
    const client = this.clients.get(accountIndex);
    return client && client.status === 'connected';
  }

  /**
   * Lista de todas as contas ativas.
   */
  getActiveAccounts() {
    return Array.from(this.clients.entries())
      .filter(([_, c]) => c.status === 'connected')
      .map(([idx, _]) => idx);
  }
}

module.exports = { HeadlessManager };
