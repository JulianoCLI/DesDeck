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
 * Traduz o erro cru do socket para algo que diga o que esta acontecendo e de
 * quem e a culpa. "Unexpected server response: 502" nao diz a ninguem que o
 * problema e do servidor do jogo e que o DesDeck ja esta tentando de novo.
 */
function explicaErro(motivo) {
  const m = /Unexpected server response: (\d+)/.exec(motivo);
  if (m) {
    const code = Number(m[1]);
    // 5xx no handshake: o servidor do jogo respondeu, mas nao estava em
    // condicoes de abrir o socket. Nada a fazer do lado de ca - o backoff
    // tenta de novo sozinho.
    if (code === 502 || code === 503 || code === 504) {
      return `Servidor do jogo fora do ar (${code}). Tentando de novo…`;
    }
    if (code === 401 || code === 403) {
      return 'Sessão recusada pelo servidor. Entre na conta em modo normal para renovar o login.';
    }
    if (code === 429) return 'Servidor pediu para esperar (429). Tentando de novo…';
    return `Servidor respondeu ${code} ao conectar. Tentando de novo…`;
  }
  if (/ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH/.test(motivo)) {
    return 'Sem conexão com o servidor do jogo. Tentando de novo…';
  }
  return `Erro de conexão: ${motivo}`;
}

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
      vip: false,
      vipAte: 0,
      travaSaidaAte: null,
      huntSlug: null,
      campo: null,
      offCfg: null,
      // O lobby do Labirinto da Guild. Chega no pacote 'lab' (resposta de
      // 'lab.info') e é o que a ferramenta de labirinto lê para decidir.
      lab: null,

      // ---- O que o card mostra. Sem webview não há nada para olhar, então
      // estes campos são a única noção do que a conta está fazendo.
      nick: null,
      equipe: [],        // o time; equipe[0] com ativoId é quem está lutando
      sessao: null,      // abates, capturas, xp e bits desta sessão
      online: 0,         // segundos conectado, segundo o servidor
      evp: 0,
      evpMax: 0,
      eventoXP: null,
      ultimoAbate: null, // { nome, em } do pacote 'log' tipo abate
    };

    this.sessionStartTime = Date.now();

    // Ferramentas headless (Phase 3)
    this.tools = new Map();
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
        // A causa mais comum de o headless não conectar. O modo não tem como
        // fazer login (o cookie é HttpOnly, criado pela página), então ele
        // depende de um login feito antes na webview.
        this.falhar('Sem login nesta conta. Deixe-a em modo normal, entre no jogo, e então ligue o headless.');
        return;
      }
    } catch (err) {
      this.setStatus('failed');
      this.falhar(`Erro ao ler cookies: ${err.message}`);
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
      this.falhar(`Erro ao criar WebSocket: ${err.message}`);
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
        // Campos que as guardas das ferramentas precisam. Antes eram descartados,
        // então huntSlug ficava null (a ferramenta de hunt não sabia onde estava)
        // e o VIP nunca era detectado. O jogo manda vipAte (timestamp), não 'vip'.
        this.state.huntSlug = msg.huntSlug || null;
        this.state.vipAte = msg.vipAte || 0;
        this.state.vip = (msg.vipAte || 0) > Date.now();
        this.state.travaSaidaAte = msg.travaSaidaAte || null;
        // O que o card mostra. O pacote 'estado' ja trazia tudo isto; era
        // descartado porque so as ferramentas liam o estado.
        this.state.nick = msg.nick || null;
        this.state.equipe = Array.isArray(msg.equipe) ? msg.equipe : [];
        this.state.sessao = msg.sessao || null;
        this.state.online = msg.online || 0;
        this.state.evp = msg.evp || 0;
        this.state.evpMax = msg.evpMax || 0;
        this.state.eventoXP = msg.eventoXP || null;
        this.emit('update');
        break;

      // O diario do jogo. Interessa o abate: e a unica fonte do NOME do
      // inimigo que acabou de cair ("Gaomon derrotado! +20 xp tamer").
      // O pacote 'batalha' so traz o id numerico do alvo.
      case 'log':
        if (msg.tipo === 'abate' && typeof msg.txt === 'string') {
          const m = /^(.+?)\s+derrotado/i.exec(msg.txt);
          if (m) {
            this.state.ultimoAbate = { nome: m[1], em: msg.em || Date.now() };
            this.emit('update');
          }
        }
        break;

      case 'ovos':
        this.state.ovos = msg.lista || [];
        this.emit('update');
        break;

      case 'campo':
        // A cena. Com Modo Economia o servidor não manda isto, e as ferramentas
        // não dependem dela — mas quando vem, 'arena.lab' diz se estamos no
        // Labirinto, onde não existe scan de corpo.
        if (!msg.delta) this.state.campo = msg;
        break;

      case 'offline.cfg':
        // A lista de hunts com perigo/xpH: é daqui que sai a área recomendada.
        this.state.offCfg = msg;
        this.emit('offline-cfg', msg);
        break;

      // O lobby do Labirinto. Conferido numa conta real: o pacote se chama
      // 'lab' (não 'lab.info', que é só o pedido) e traz
      // bauHoje, cfg, dif, eu, fila, gerente, guild, noLobby, pronto, t, ultimo.
      case 'lab':
        this.state.lab = msg;
        this.emit('lab', msg);
        break;

      // O servidor avisa que o lobby mudou sem mandar o conteúdo: quem quiser
      // o estado novo pede 'lab.info' de novo (é o que o jogo faz).
      case 'lab.mudou':
        this.emit('lab-mudou', msg);
        break;

      // A corrida acabou. Vem logo antes de a conta ser mandada ao Hospital,
      // então é o gatilho mais cedo que existe para o retorno à hunt.
      case 'lab.fim':
        this.state.lab = null;
        this.emit('lab-fim', msg);
        break;

      case 'batalha':
        // Chega mesmo com a cena desligada. Cada evento com morto:true traz em
        // 'para' o id do inimigo que caiu — é a via do scan sem a cena.
        for (const e of msg.ev || []) {
          if (!e || !e.morto) continue;
          const id = Number(e.para);
          if (!id) continue; // 'a' é o nosso Digimon: morte nossa, não corpo
          this.emit('corpo', id);
        }
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
      this.falhar('Jogo aberto em outro lugar (code 4000)');
      return;
    }

    if (ev.code === 4001) {
      this.autoReconnect = false;
      this.setStatus('failed');
      this.falhar('Conta bloqueada pelo administrador (code 4001)');
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
    const motivo = err?.message || String(err);
    // Não sobrescreve um 'failed' anterior: o primeiro erro é o que explica a
    // falha; os seguintes são consequência dele.
    if (this.status !== 'failed') this.falhar(explicaErro(motivo));
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
    // Sorteio de ate +50% na espera. Sem isso, as contas que caem juntas
    // (servidor reiniciando, queda de internet) voltam todas no mesmo instante:
    // batem num servidor que ainda esta de pe so pela metade, falham juntas de
    // novo e repetem o ciclo em sincronia, do mesmo IP.
    const espera = this.reconnectDelay + Math.round(Math.random() * this.reconnectDelay * 0.5);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, espera);

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

  // Todo erro passa por aqui, para o motivo ficar guardado além do evento.
  // Antes só o erro de socket gravava lastError, então getStatus() devolvia
  // error: null nos casos mais comuns — como a conta sem sessão — e quem
  // consultasse o status depois não tinha como saber o que falhou.
  falhar(mensagem) {
    this.lastError = mensagem;
    this.emit('error', mensagem);
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
    // 'failed' é um diagnóstico (sem sessão, credencial ruim) e precisa
    // sobreviver ao desligamento: sobrescrevê-lo com 'disconnected' apagava o
    // motivo justamente quando a pessoa ia ler o card.
    if (this.status !== 'failed') this.setStatus('disconnected');

    // Para todas as ferramentas
    for (const tool of this.tools.values()) {
      tool.stop();
    }
    this.tools.clear();
  }

  startTool(toolId, config) {
    if (!config) return false;
    const existing = this.tools.get(toolId);
    if (existing) {
      // Já rodava: só troca os valores, como o G.aplicar() da versão do webview.
      // O laço em curso passa a ler a config nova na volta seguinte, sem criar um
      // segundo laço (que duplicaria compras).
      existing.config = config;
      return true;
    }
    try {
      const { createHeadlessTool } = require('./tools');
      const tool = createHeadlessTool(this, toolId, config);
      if (!tool) return false;
      tool.start();
      this.tools.set(toolId, tool);
      console.log(`[headless] ferramenta ${toolId} iniciada`);
      return true;
    } catch (err) {
      console.error(`[headless] erro ao iniciar ${toolId}:`, err);
      return false;
    }
  }

  stopTool(toolId) {
    const tool = this.tools.get(toolId);
    if (tool) {
      tool.stop();
      this.tools.delete(toolId);
      return true;
    }
    return false;
  }

  get connected() {
    return this.status === 'connected' && this.ws && this.ws.readyState === 1;
  }

  sendCommand(type, data) {
    if (!this.connected) return false;
    try {
      this.ws.send(JSON.stringify({ t: type, ...data }));
      return true;
    } catch (err) {
      console.error(`[headless] erro ao enviar:`, err);
      return false;
    }
  }
}

module.exports = { DigiiIdleHeadlessClient };
