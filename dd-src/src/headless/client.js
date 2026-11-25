'use strict';
const EventEmitter = require('events');
const WebSocket = require('ws');
const { getCookieHeader } = require('./cookies');

const WS_URL = 'wss://digiidle.com/ws';
const PING_INTERVAL_MS = 25000;
// Os baus do Labirinto mudam poucas vezes por dia; nao ha por que perguntar
// mais do que isto. O primeiro pedido sai depois do login, nao junto com ele.
const LAB_PRIMEIRO_MS = 8000;
const LAB_INTERVAL_MS = 5 * 60 * 1000;
// O 'mercado.mudou' avisa que ALGUMA coisa mexeu no mercado inteiro — inclusive
// anúncios de outras pessoas. Pedir 'mercado.meus' a cada aviso seria um pedido
// por segundo em horário cheio, então os avisos são juntados nesta janela.
const MERCADO_DEBOUNCE_MS = 4000;
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
    // O proxy da tela da conta, repassado pelo main. Sem isto o socket sai pelo
    // IP real, por mais que a webview da mesma conta esteja proxiada.
    this.proxy = options.proxy || null;
    // Tela com proxy configurado mas que falhou em chegar até aqui: é melhor a
    // conta não conectar do que conectar direto.
    this.exigeProxy = !!options.exigeProxy;

    this.ws = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'failed'
    this.lastError = null;

    this.pingTimer = null;
    this.labTimer = null;
    this.labPrimeiro = null;
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

      // O Passe de Batalha. NÃO tem pacote próprio: vem dentro do 'estado',
      // conferido em 4 contas reais (test-passe-estado.js). Forma:
      //   { dia, feitos, nivel, pode, premium, premiumAte, premiumPend, ultimo }
      // 'pode' é a palavra final do servidor sobre o resgate de hoje — é o
      // mesmo campo que liga o botão na tela do jogo.
      passe: null,

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

      // ---- O painel. Medido em conta real (test-painel2-campos.js):
      // D-Dol e 'gemas'. 'diamantes' e o DCoin, a moeda da Shop - mostrar um
      // no lugar do outro trocaria a moeda na cara do usuario.
      gemas: 0,
      // O lobby do Labirinto nao chega sozinho; 'bauHoje'/'cfg.bauPorDia' vem
      // em resposta a 'lab.info' e e de la que sai "labs disponiveis hoje".
      labBauHoje: null,
      labBauPorDia: null,
    };

    // O historico de ovos deste login. O servidor manda os ultimos 60 no
    // 'welcome' e cada ovo novo chega no pacote 'captura'. Quem acumula alem
    // disso e o renderer (o painel guarda o seu proprio, com botao de apagar).
    this.historicoOvos = [];

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

    // Catálogos e sprites saem pela sessão desta conta (onde o proxy está
    // aplicado), e não pela sessão padrão, que nunca é proxiada.
    try { require('./rede').usarParticao(this.partition); } catch { /* opcional */ }

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

    // O proxy da tela, se houver. O 'ws' roda na pilha de rede do Node, que não
    // tem nada a ver com a sessão do Electron: setProxy() na partição não afeta
    // este socket em nada. Sem um agent, o socket sai pelo IP real da máquina -
    // e com o cookie de sessão obtido pelo proxy, o servidor veria o mesmo
    // login vindo de dois IPs diferentes.
    //
    // Falha fechado: se a conta tem proxy configurado e o agent não sobe, a
    // conexão não acontece.
    let agent;
    if (this.proxy && this.proxy.host && this.proxy.port) {
      try {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        const { host, port, user, pass } = this.proxy;
        const auth = user && pass
          ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`
          : '';
        agent = new HttpsProxyAgent(`http://${auth}${host}:${port}`);
      } catch (err) {
        this.setStatus('failed');
        this.falhar(`Proxy desta tela não pôde ser usado (${err.message}). A conta não conecta sem ele.`);
        return;
      }
    } else if (this.exigeProxy) {
      this.setStatus('failed');
      this.falhar('Esta tela exige proxy e nenhum foi configurado. A conta não conecta sem ele.');
      return;
    }

    try {
      // Sem compressão (z=1 omitido), sem token
      const url = `${this.wsUrl}?off=1&dl=1`;
      this.ws = new WebSocket(url, { headers, handshakeTimeout: AUTH_TIMEOUT_MS, agent });

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
    this.startLabTimer();
    this.startMercadoMarco();
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

    // Espelho cru de toda mensagem, para quem precisa de pacotes que o roteador
    // abaixo não trata (o cadastro escuta 'nick' e 'starter', que caem no default).
    this.emit('msg', msg);

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
        // O Passe chega aqui dentro, não num pacote próprio.
        this.state.passe = msg.passe || null;
        // O D-Dol. Conferido em conta real: gemas=D-Dol, diamantes=DCoin.
        this.state.gemas = msg.gemas || 0;
        // O seller precisa ver isto: o jogo não responde a 'mercado.anunciar',
        // e a única prova de que o anúncio saiu é o item DIMINUIR na mochila —
        // o que só se sabe aqui, no pacote que acabou de atualizar 'itens'.
        // Uma ferramenta com defeito não pode derrubar o estado, que é o que
        // alimenta todo o resto do app.
        try {
          const vend = this.tools.get('seller');
          if (vend && vend.confirmarPorInventario) vend.confirmarPorInventario();
        } catch { /* a ferramenta não pode atrapalhar o estado */ }
        this.emit('update');
        break;

      // Os últimos 60 ovos capturados, mandados uma vez no login. É a semente
      // do Histórico de Ovos do painel: sem isto, o histórico só começaria a
      // existir depois da próxima captura (minutos ou horas de tela vazia).
      case 'welcome':
        if (Array.isArray(msg.historico)) {
          this.historicoOvos = msg.historico.filter(Boolean);
          this.emit('historico', this.historicoOvos);
        }
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
          // O item dropado NÃO tem pacote próprio: vem no fim do texto do
          // abate, depois de ' · drop: '. Medido em conta real:
          //   "Bloomlordmon derrotado! +11265 xp tamer, … · drop: Energia de
          //    Ovo Bird Instável"
          // Se o item é raro, quem diz é o CATÁLOGO do jogo (a mesma lista da
          // aba "Itens Raros" da Mochila), não uma lista escrita por mim. A
          // marca vai no manager, que tem acesso ao catálogo.
          const d = / · drop: (.+)$/.exec(msg.txt);
          if (d) {
            this.emit('atividade', {
              tipo: 'drop', em: msg.em || Date.now(), item: d[1].trim(), de: m ? m[1] : null,
            });
          }
        }
        break;

      // O ovo chocado. Não é um 'log': é um 'toast', e o cliente do jogo o
      // reconhece pelo texto (`/^O ovo chocou/`, app.js L593, onde ele toca o
      // som do ovo). Procurar isto em 'log' nunca acharia nada.
      case 'toast':
        if (typeof msg.txt === 'string') {
          if (/^O ovo chocou/i.test(msg.txt)) {
            this.emit('atividade', { tipo: 'chocou', em: Date.now(), txt: msg.txt });
          }
          this.emit('toast', msg.txt);
        }
        break;

      // A captura de um ovo. Atenção ao ok:false: medido em conta real, o
      // pacote da FALHA não traz 'ovo' nem 'historico' — só
      // { corpo, esp, ok, scanner }. Tratar todo 'captura' como sucesso
      // encheria o histórico de entradas vazias (foram 7 falhas em 90 s).
      case 'captura':
        if (msg.ok && msg.historico) {
          this.historicoOvos.unshift(msg.historico);
          // O mesmo teto do cliente do jogo. O acúmulo de longo prazo é do
          // renderer; aqui é só a janela desta sessão.
          this.historicoOvos = this.historicoOvos.slice(0, 60);
          this.emit('atividade', {
            tipo: 'captura', em: msg.historico.em || Date.now(), ovo: msg.historico,
          });
          this.emit('historico', this.historicoOvos);
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
        // Os baús do dia, para o card dizer quantos labirintos ainda cabem.
        // Medido em conta real: bauHoje=3, cfg.bauPorDia=3 -> 0 disponíveis.
        if (typeof msg.bauHoje === 'number') this.state.labBauHoje = msg.bauHoje;
        if (msg.cfg && typeof msg.cfg.bauPorDia === 'number') this.state.labBauPorDia = msg.cfg.bauPorDia;
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

      // A resposta de 'mercado.listar'. Conferido em conta real: traz
      // { lista, total, agora }. O 'agora' é o relógio do SERVIDOR, e é por ele
      // que o sniper decide a hora do libera — o relógio local pode estar fora.
      case 'mercado':
        this.emit('mercado', msg);
        break;

      // O mercado mexeu (alguém anunciou, comprou ou um anúncio expirou). Não
      // vem conteúdo: quem quiser a lista nova pede 'mercado.listar' de novo.
      case 'mercado.mudou':
        this.emit('mercado-mudou', msg);
        // Pode ter sido uma venda MINHA. O aviso não diz: quem sabe é o
        // 'mercado.meus', que traz o histórico de negociações da conta.
        this.pedirMinhasNegociacoes();
        break;

      // A resposta de 'mercado.meus': { abertos, historico, pensao }. Cada
      // linha do histórico é uma negociação ENTRE PLAYERS, com 'vendi' dizendo
      // de que lado a conta estava (menus2.js: `meus.historico.filter((x) =>
      // !!x.vendi === vendi)`).
      //
      // Isto não se confunde com a venda de ovos: aquela é 'market.vender',
      // para o NPC da Loja, e nem passa por aqui.
      case 'mercado.meus':
        this.novasNegociacoes(msg);
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
    this.stopLabTimer();
    this.stopMercadoMarco();
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

  // Os baus do Labirinto nao chegam sozinhos: provado em conta real, o pacote
  // 'lab' so vem em resposta a 'lab.info' (que le o lobby, nao inscreve a conta
  // em nada). Sem pedir, "labs disponiveis" ficaria em '-' para sempre.
  //
  // O intervalo e longo de proposito: o contador so muda quando a conta entra
  // num labirinto, algumas vezes por dia. O primeiro pedido espera alguns
  // segundos para nao sair no mesmo instante do login.
  startLabTimer() {
    this.stopLabTimer();
    // 'connected' e um getter, nao um metodo: chamar isConnected() derrubava o
    // processo principal 8s depois do login, com o socket ja aberto.
    const pedir = () => { if (this.connected) this.send({ t: 'lab.info' }); };
    const t0 = setTimeout(pedir, LAB_PRIMEIRO_MS);
    if (t0.unref) t0.unref();
    this.labPrimeiro = t0;
    this.labTimer = setInterval(pedir, LAB_INTERVAL_MS);
    if (this.labTimer.unref) this.labTimer.unref();
  }

  stopLabTimer() {
    if (this.labPrimeiro) { clearTimeout(this.labPrimeiro); this.labPrimeiro = null; }
    if (this.labTimer) { clearInterval(this.labTimer); this.labTimer = null; }
  }

  // ------------------------------------------- Mercado da Comunidade
  // As vendas e compras ENTRE PLAYERS, que é o que o Painel mostra. A venda de
  // ovos para o NPC ('market.vender') é outra coisa e sai pelo log da
  // ferramenta.
  //
  // Nenhum pacote anuncia "você vendeu". O caminho é o mesmo do jogo: ao
  // 'mercado.mudou', pedir 'mercado.meus' e comparar com o que já se viu.
  pedirMinhasNegociacoes() {
    if (this.mercadoTimer) return;
    this.mercadoTimer = setTimeout(() => {
      this.mercadoTimer = null;
      if (this.connected) this.send({ t: 'mercado.meus' });
    }, MERCADO_DEBOUNCE_MS);
    if (this.mercadoTimer.unref) this.mercadoTimer.unref();
  }

  novasNegociacoes(msg) {
    const hist = (msg && msg.historico) || [];
    // A PRIMEIRA resposta só serve de marco: ela traz o histórico inteiro da
    // conta, e anunciá-lo encheria a Atividade com vendas de semanas atrás na
    // hora do login. Só o que aparecer depois é novidade.
    const primeira = !this.mercadoVistos;
    if (primeira) this.mercadoVistos = new Set();

    for (const x of hist) {
      if (!x) continue;
      // Sem id estável, a assinatura é o que identifica a linha. 'em' é o
      // instante da negociação: duas vendas iguais no mesmo ms não acontecem.
      const chave = [x.em, x.tipo, x.item, x.qtd, x.preco, x.moeda, x.outro].join('|');
      if (this.mercadoVistos.has(chave)) continue;
      this.mercadoVistos.add(chave);
      if (primeira) continue;

      const r = x.resumo || {};
      // O sniper precisa ver isto ANTES do Painel: é a única prova de que a
      // compra foi dele (o jogo não responde 'mercado.comprar'). Quando ele
      // reconhece a negociação como sua, ela já virou a linha 'comprei' do
      // sniper, e repeti-la como "comprou X de Y" seria a mesma compra duas
      // vezes na mesma aba.
      let doSniper = false;
      try {
        const s = this.tools.get('sniper');
        if (s && s.confirmar) doSniper = s.confirmar(x);
      } catch { /* a ferramenta não pode atrapalhar o histórico */ }
      if (doSniper) continue;

      this.emit('atividade', {
        tipo: 'mercado',
        em: x.em || Date.now(),
        vendi: !!x.vendi,
        // 'tipo' diz o que foi negociado: digimon, ovo, item, casa ou bike.
        oque: x.tipo || 'item',
        item: x.item || null,
        especie: r.especie || null,
        qtd: x.qtd || 1,
        preco: x.preco || 0,
        moeda: x.moeda || 'bits',
        outro: x.outro || null,
        potencia: r.potencia || null,
        shiny: !!r.shiny,
        nivel: r.nivel || null,
      });
    }
    // Teto de memória: o histórico do servidor é finito, mas uma conta que
    // vende o dia todo acumularia chaves sem limite num processo que fica dias
    // de pé.
    if (this.mercadoVistos.size > 4000) {
      this.mercadoVistos = new Set([...this.mercadoVistos].slice(-2000));
    }
  }

  // Marco inicial do mercado, logo depois do login: sem esta primeira resposta,
  // a primeira venda do dia seria anunciada junto com todo o histórico antigo.
  startMercadoMarco() {
    this.stopMercadoMarco();
    const t = setTimeout(() => { if (this.connected) this.send({ t: 'mercado.meus' }); }, LAB_PRIMEIRO_MS);
    if (t.unref) t.unref();
    this.mercadoMarco = t;
  }

  stopMercadoMarco() {
    if (this.mercadoMarco) { clearTimeout(this.mercadoMarco); this.mercadoMarco = null; }
    if (this.mercadoTimer) { clearTimeout(this.mercadoTimer); this.mercadoTimer = null; }
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
    this.stopLabTimer();
    this.stopMercadoMarco();
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
