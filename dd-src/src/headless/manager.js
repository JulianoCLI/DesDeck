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

class HeadlessManager extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // accountIndex -> DigiiIdleHeadlessClient
    // Quando a próxima conta pode entrar. Cada start() reserva o seu lugar na
    // fila, então a ordem de chegada é respeitada sem ninguém ficar sem vez.
    this.proximaEntrada = 0;
    this.entradas = new Map(); // accountIndex -> timer da entrada agendada
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
