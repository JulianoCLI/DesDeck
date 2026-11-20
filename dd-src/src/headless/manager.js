'use strict';
const EventEmitter = require('events');
const { DigiiIdleHeadlessClient } = require('./client');

/**
 * Gerenciador de clientes headless. Mantém múltiplas contas rodando,
 * agrega eventos, sincroniza com a UI via IPC.
 */
class HeadlessManager extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // accountIndex -> DigiiIdleHeadlessClient
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
    client.connect();

    return client;
  }

  /**
   * Para um cliente headless.
   */
  stop(accountIndex) {
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
    for (const [index, client] of this.clients) {
      client.disconnect();
    }
    this.clients.clear();
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
