'use strict';
const EventEmitter = require('events');
const WebSocket = require('ws');
const { getCookieHeader } = require('./cookies');

const WS_URL = 'wss://digiidle.com/ws';
const PING_INTERVAL_MS = 25000;
const RECONNECT_MIN_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const AUTH_TIMEOUT_MS = 15000;

/**
 * Cliente headless para DigiIdle via WebSocket puro (JSON).
 *
 * Autenticação por cookies extraídos da partição persist:acc-<id>.
 * Estado mínimo: apenas o que as ferramentas precisam (hunt, estado, ovos, batalha, offline.cfg).
 * Protocolo: JSON puro, sem compressão (z=1 omitido), sem token no handshake.
 */
class DigiiIdleHeadlessClient extends EventEmitter {
  constructor(accountIndex, partition, options = {}) {
    super();
    this.index = accountIndex;
    this.partition = partition;
    this.wsUrl = WS_URL;
    this.origin = 'https://digiidle.com';

    this.ws = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'failed'
    this.lastError = null;

    this.pingTimer = null;
    this.reconnectTimer = null;
    this.reconnectDelay = RECONNECT_MIN_MS;
    this.autoReconnect = true;
    this.cookieHeader = null;

    // Estado mínimo para ferramentas
    this.state = {
      ok: true,
      i: accountIndex,
      name: options.name || `Conta ${accountIndex + 1}`,
      nivel: 0,
      bits: 0,
      hunt: null,
      ativoId: null,
      local: null,
      itens: {},
      ovos: [],
      a: { segundos: 0, xph: 0, bitsph: 0 },
    };

    this.sessionStartTime = Date.now();
  }

  async connect() {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return; // já conectando ou conectado
    }

    if (this.status === 'failed') {
      // Tentou e falhou permanentemente (credencial ruim, etc)
      return;
    }

    this.setStatus('connecting');

    // Coleta cookies
    try {
      this.cookieHeader = await getCookieHeader(this.partition);
      if (!this.cookieHeader) {
        this.setStatus('failed');
        this.emit('error', 'Sem cookies: a conta precisa fazer login na interface gráfica');
        return;
      }
    } catch (err) {
      this.setStatus('failed');
      this.emit('error', `Erro ao ler cookies: ${err.message}`);
      return;
    }

    // Monta headers
    const headers = {
      Cookie: this.cookieHeader,
      Origin: this.origin,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    try {
      // Sem compressão (z=1 omitido), sem token
      const url = `${this.wsUrl}?off=1&dl=1`;
      this.ws = new WebSocket(url, { headers, handshakeTimeout: AUTH_TIMEOUT_MS });

      this.ws.onopen = () => this.onOpen();
      this.ws.onmessage = (ev) => this.onMessage(ev);
      this.ws.onclose = (ev) => this.onClose(ev);
      this.ws.onerror = (err) => this.onError(err);
    } catch (err) {
      this.setStatus('failed');
      this.emit('error', `Erro ao criar WebSocket: ${err.message}`);
    }
  }

  onOpen() {
    this.reconnectDelay = RECONNECT_MIN_MS;
    this.setStatus('connected');
    this.startPingTimer();
    this.emit('connected');
  }

  onMessage(ev) {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return; // ignore malformed JSON
    }

    if (!msg || typeof msg !== 'object') return;

    // Roteador mínimo: só o que as ferramentas precisam
    switch (msg.t) {
      case 'estado':
        this.state.nivel = msg.nivel || 0;
        this.state.bits = msg.bits || 0;
        this.state.ativoId = msg.ativoId || null;
        this.state.local = msg.local || null;
        this.state.itens = msg.itens || {};
        this.emit('update');
        break;

      case 'ovos':
        this.state.ovos = msg.lista || [];
        this.emit('update');
        break;

      case 'campo':
        // A cena: só se o headless pediu explicitamente ou se economia=false
        // Para Fase 1, ignoramos
        break;

      case 'offline.cfg':
        // Config para hunt recomendada
        this.emit('offline-cfg', msg);
        break;

      case 'batalha':
        // Eventos de combate
        this.emit('battle', msg);
        break;

      case 'ping':
        // Responde ao ping do servidor
        this.send({ t: 'pong' });
        break;

      default:
        // Ignora o resto silenciosamente
        break;
    }
  }

  onClose(ev) {
    this.stopPingTimer();
    this.ws = null;

    // Code 4000 = jogo aberto em outra aba; 4001 = bloqueio admin
    if (ev.code === 4000) {
      this.autoReconnect = false;
      this.setStatus('failed');
      this.emit('error', 'Jogo aberto em outro lugar (code 4000)');
      return;
    }

    if (ev.code === 4001) {
      this.autoReconnect = false;
      this.setStatus('failed');
      this.emit('error', 'Conta bloqueada pelo administrador (code 4001)');
      return;
    }

    if (this.status === 'connected') {
      this.setStatus('disconnected');
      this.emit('disconnected');
    }

    if (this.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  onError(err) {
    this.lastError = err?.message || String(err);
    if (this.status !== 'failed') {
      this.emit('error', `WebSocket error: ${this.lastError}`);
    }
  }

  startPingTimer() {
    this.stopPingTimer();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === 1) {
        this.send({ t: 'ping' });
      }
    }, PING_INTERVAL_MS);
    // Permite que o process termine se só este timer estiver rodando
    if (this.pingTimer.unref) this.pingTimer.unref();
  }

  stopPingTimer() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  scheduleReconnect() {
    if (!this.autoReconnect || this.status === 'failed') return;
    if (this.reconnectTimer) return;

    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(RECONNECT_MAX_MS, Math.round(this.reconnectDelay * 1.5));
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) {
      try {
        this.ws.send(JSON.stringify(obj));
        return true;
      } catch (err) {
        console.error(`[headless:client] erro ao enviar:`, err);
        return false;
      }
    }
    return false;
  }

  setStatus(newStatus) {
    if (newStatus !== this.status) {
      this.status = newStatus;
      this.emit('status', newStatus);
    }
  }

  disconnect() {
    this.autoReconnect = false;
    this.stopPingTimer();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, 'desconexão normal');
      } catch (err) {
        console.error(`[headless:client] erro ao fechar WS:`, err);
      }
      this.ws = null;
    }
    this.setStatus('disconnected');
  }
}

module.exports = { DigiiIdleHeadlessClient };
