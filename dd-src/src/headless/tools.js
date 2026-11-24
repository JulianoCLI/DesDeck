'use strict';
// Ferramentas no modo headless.
//
// São as mesmas automações que o DesDeck injeta na página do jogo
// (src/renderer/tools.js), reescritas para operar sobre o socket do
// DigiiIdleHeadlessClient em vez de sobre a página. A lógica é portada letra a
// letra da versão do webview, que por sua vez foi conferida contra o cliente do
// jogo — cada guarda abaixo cita o motivo.
//
// O que muda em relação ao webview:
//   - não há `fetch`: os catálogos vêm de catalogo.js (net.request + cache);
//   - não há `G.aoMorrer`: o scan escuta o evento 'corpo' do client, que o
//     roteador de mensagens emite a cada inimigo morto;
//   - não há módulos ES: o tier do ovo vem de ovo-tier.js, um porte conferido
//     contra o módulo do jogo (4005/4005 ovos com a mesma letra).

const catalogo = require('./catalogo');

// Janela usada para espalhar a PRIMEIRA ação de cada ferramenta depois de
// conectar. Com 4 contas, cada uma estreia num ponto diferente destes ~40 s
// (metade do deslocamento fixo da conta, metade sorteada), em vez de todas
// agirem no mesmo segundo do boot.
const ENTRADA_SPREAD_MS = 80000;

class HeadlessTool {
  constructor(client, toolId, config) {
    this.client = client;
    this.toolId = toolId;
    this.config = config;
    this.running = false;
    this.loopTimer = null;
    this.pronto = false;     // os catálogos já carregaram?
    this.inicioFalhou = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    // Deixa o preparo (catálogos) acontecer antes do primeiro passo. Se ele
    // falhar, a ferramenta não age: é melhor não fazer nada do que agir com
    // dados chutados.
    Promise.resolve()
      .then(() => this.preparar())
      .then(() => { this.pronto = true; })
      .catch((err) => {
        this.inicioFalhou = true;
        this.log(`não consegui preparar (${err.message}). Por segurança, não vou agir.`);
      })
      // O boot é o pior momento para coincidir: as contas sobem juntas e o
      // primeiro atraso é curto, então 25% dele espalharia pouco. Aqui o jitter
      // é calculado sobre uma janela própria, bem maior que o atraso em si.
      .finally(() => { if (this.running) this.agendar(this.primeiroAtrasoMs() + this.jitterMs(ENTRADA_SPREAD_MS)); });
  }

  stop() {
    this.running = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
  }

  /** Carrega o que a ferramenta precisa antes de agir. Pode ser sobrescrito. */
  async preparar() {}

  /** Espera antes do primeiro passo, para não agir no susto ao conectar. */
  primeiroAtrasoMs() { return 5000; }

  /**
   * Espalha no tempo o que, sem isto, sairia no mesmo instante em todas as
   * contas.
   *
   * Várias contas sobem juntas (boot do app, religação depois de queda de rede)
   * e todas as ferramentas usam o mesmo intervalo configurado. Sem espalhar, as
   * 4 contas mandam o mesmo comando no mesmo segundo, repetidamente — um padrão
   * que nenhum jogador produz.
   *
   * São dois componentes, e os dois são necessários:
   *   - base: um deslocamento FIXO por conta+ferramenta. É o que impede que as
   *     contas fiquem em fase. Só aleatório não resolve: a cada volta elas se
   *     reaproximariam e, no agregado, voltariam a coincidir.
   *   - sorteio: um ruído por volta, para que o intervalo de cada conta também
   *     não seja um relógio exato.
   */
  jitterMs(baseMs) {
    const spread = Math.max(1500, Math.min(45000, Math.round(baseMs * 0.25)));
    const semente = `${this.client && this.client.index}:${this.toolId}`;
    let h = 0;
    for (const ch of String(semente)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const fixo = (h % 1000) / 1000;                  // 0..1, estável para esta conta
    const base = Math.round(spread * fixo);
    const sorteio = Math.round(Math.random() * spread);
    return base + sorteio;
  }

  agendar(ms) {
    if (!this.running) return;
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(() => this.loop(), ms + this.jitterMs(ms));
    if (this.loopTimer.unref) this.loopTimer.unref();
  }

  /** Pausa curta antes de um comando, para duas contas não o mandarem juntas. */
  async respirar(maxMs = 4000) {
    const ms = 250 + Math.round(Math.random() * Math.max(0, maxMs - 250));
    await new Promise((r) => setTimeout(r, ms));
    return this.running && !this.desligada;
  }

  async loop() {
    if (!this.running) return;
    try {
      if (this.pronto && !this.inicioFalhou) await this.step();
    } catch (err) {
      this.log('passo falhou:', err.message);
    }
    this.agendar(this.getInterval());
  }

  async step() {}

  getInterval() { return 60000; }

  /** O estado do jogo, ou null se ainda não chegou. */
  get estado() {
    const st = this.client && this.client.state;
    // nivel 0 e local null = o pacote 'estado' ainda não veio.
    if (!st || !st.local) return null;
    return st;
  }

  /** Desligada pelo usuário sem recarregar (o toggle da UI). */
  get desligada() { return !!this.config.__off; }

  send(type, data) {
    if (!this.client || !this.client.connected) return false;
    return this.client.sendCommand(type, data);
  }

  log(...args) {
    console.log(`[headless:${this.toolId}]`, ...args);
  }
}

// ---------------------------------------------------------------- auto scan
// Clica o scan nos corpos caídos. Com VIP o jogo já faz sozinho
// (auto.scannerCaptura); sem VIP o clique é manual, e é esse que automatizamos.
//
// Conferido no cliente do jogo:
//   - o clique manual é enviar('ball.throw', { corpo, scanner });
//   - só vale em hunt, e não no Labirinto (lá não há scan de corpo);
//   - uma tentativa por corpo: insistir no mesmo é desperdício de scanner.
//
// A ferramenta NÃO depende da cena ('campo'), e isso importa: com Modo Economia
// o servidor para de mandar a cena, e no headless ela nunca é pedida. A via são
// os eventos 'batalha', que chegam de todo jeito — o client os traduz no evento
// 'corpo' com o id do inimigo que caiu.
class ToolScan extends HeadlessTool {
  constructor(client, config) {
    super(client, 'scan', config);
    this.tentados = new Set();
    this.ordem = [];
    this.avisouVip = false;
    this.avisouSemScanner = 0;
    this.janela = Date.now();
    this.noMinuto = 0;
    this.lancados = 0;
    this.aoCorpo = (id) => this.corpoCaiu(id);
  }

  start() {
    if (this.running) return;
    super.start();
    // O scan é reativo: não tem laço próprio, age no instante da morte.
    this.client.on('corpo', this.aoCorpo);
  }

  stop() {
    super.stop();
    if (this.client) this.client.off('corpo', this.aoCorpo);
  }

  // Sem laço: o passo periódico não faz nada.
  getInterval() { return 60000; }

  corpoCaiu(id) {
    if (!this.running || this.desligada) return;
    const E = this.estado;
    if (!E) return;

    // Com VIP o jogo escaneia sozinho; agir junto gastaria em dobro.
    if (this.config.soSemVip !== false && E.vip) {
      if (!this.avisouVip) {
        this.avisouVip = true;
        this.log('esta conta tem VIP, o jogo já escaneia sozinho. Nada a fazer.');
      }
      return;
    }

    // Só em hunt: no Labirinto não existe scan de corpo, e na cidade não há corpo.
    if (E.local !== 'hunt') return;
    if (E.campo && E.campo.arena && E.campo.arena.lab) return;

    if (this.tentados.has(id)) return;

    // Teto opcional por minuto, para segurar o gasto de scanner.
    const maxPorMin = Math.max(0, this.config.maxPorMin || 0);
    if (maxPorMin > 0) {
      if (Date.now() - this.janela >= 60000) { this.janela = Date.now(); this.noMinuto = 0; }
      if (this.noMinuto >= maxPorMin) return;
    }

    // O primeiro scanner da ordem escolhida que a conta realmente tem.
    const escolhidos = Array.isArray(this.config.scanners) && this.config.scanners.length
      ? this.config.scanners
      : ['scanner-basico'];
    const scanner = escolhidos.find((s) => (E.itens || {})[s] > 0);
    if (!scanner) {
      if (Date.now() - this.avisouSemScanner > 300000) {
        this.avisouSemScanner = Date.now();
        this.log('sem scanners na mochila dos escolhidos.');
      }
      return;
    }

    this.tentados.add(id);
    this.ordem.push(id);
    if (this.ordem.length > 500) {
      for (const velho of this.ordem.splice(0, 250)) this.tentados.delete(velho);
    }

    if (!this.send('ball.throw', { corpo: id, scanner })) return;
    this.noMinuto++;
    if (++this.lancados % 25 === 0) {
      this.log(`${this.lancados} scans lançados (último: ${scanner})`);
    }
  }
}

// ---------------------------------------------------------------- auto refill
// Compra na Loja quando um item chega ao mínimo e repõe até o máximo.
//
// Os preços vêm do catálogo do próprio jogo. A versão antiga chutava "100 bits
// por item" e pedia quantidades impossíveis (58 mil scanners, 30% acima do saldo).
class ToolRefill extends HeadlessTool {
  constructor(client, config) {
    super(client, 'refill', config);
    this.precos = {};
    this.ultima = 0;
    this.pendente = null;
  }

  async preparar() {
    this.precos = await catalogo.precos();
  }

  getInterval() {
    return Math.max(5000, (this.config.intervaloSec || 15) * 1000);
  }

  step() {
    if (this.desligada) return;
    const E = this.estado;
    if (!E) return;

    const regras = (this.config.regras || []).filter((r) => r && r.item && r.max > r.min);
    if (!regras.length) return; // sem regras: nada a comprar

    const itens = E.itens || {};
    const bits = E.bits || 0;
    const reserva = this.config.reservaBits || 0;
    const parcial = this.config.parcial !== false;

    // Uma compra só é confirmada pelo 'estado' seguinte; até lá não insiste.
    // Sem isto a ferramenta re-disparava a cada volta e empilhava pedidos.
    if (this.pendente) {
      if ((itens[this.pendente.item] || 0) >= this.pendente.alvo) {
        this.pendente = null;
      } else if (Date.now() - this.pendente.em > 15000) {
        this.log('compra não confirmada:', this.pendente.item);
        this.pendente = null;
      } else {
        return;
      }
    }
    if (Date.now() - this.ultima < 4000) return;

    for (const r of regras) {
      const preco = this.precos[r.item];
      if (!preco) continue; // item sem preço no catálogo: não dá para calcular
      const tem = itens[r.item] || 0;
      if (tem > r.min) continue;
      const livre = bits - reserva;
      let qtd = r.max - tem;
      if (qtd <= 0) continue;
      if (qtd * preco > livre) {
        if (!parcial) continue;
        qtd = Math.floor(livre / preco);
      }
      if (qtd <= 0) continue;
      if (!this.send('market.comprar', { item: r.item, qtd })) return;
      this.ultima = Date.now();
      this.pendente = { item: r.item, alvo: tem + qtd, em: Date.now() };
      this.log(`comprou ${qtd}x ${r.item} por ${qtd * preco} bits (tinha ${tem})`);
      return; // uma por rodada: o saldo novo vem no próximo estado
    }
  }
}

// ------------------------------------------------------------ auto melhor hunt
// Troca para a área recomendada do Mapa quando não estamos nela.
//
// Conferido no cliente do jogo:
//   - a recomendada é sugeridaOff(): entre as de MENOR perigo, a de maior xpH;
//     empate decide por bitsH. A ilha 'halloween' fica fora, como no Mapa;
//   - a lista chega em 'offline.cfg' e é pedida com enviar('offline.cfg');
//   - trocar de área é enviar('hunt.select', { slug });
//   - no Labirinto ('lab') a ferramenta não encosta na hunt;
//   - 'praca' é o Hospital/Cidade: lá o Digimon fica parado, e sair de lá é o
//     ponto principal da ferramenta.
class ToolHunt extends HeadlessTool {
  constructor(client, config) {
    super(client, 'hunt', config);
    this.ilhaPorSlug = {};
    this.ultimaTroca = 0;
    // A última área em que a conta estava de fato caçando. É o que devolve a
    // conta à hunt original quando ela sai do Labirinto pelo Hospital.
    this.ultimaHunt = null;
  }

  // Anota a hunt enquanto ela é verdade. Chamado a cada passo e também a cada
  // 'estado', porque uma corrida de Labirinto pode começar e acabar entre dois
  // passos (o intervalo padrão é de 5 min) — sem o gancho no 'estado' a memória
  // nunca veria a hunt de antes.
  lembrarHunt(st) {
    if (st && st.local === 'hunt' && st.huntSlug) this.ultimaHunt = st.huntSlug;
  }

  start() {
    // O gancho tem de ser removido no stop(): sem isso, religar a ferramenta
    // acumularia um ouvinte por religação no mesmo client.
    this.aoEstado = () => this.lembrarHunt(this.client && this.client.state);
    this.client.on('update', this.aoEstado);
    this.lembrarHunt(this.client && this.client.state);
    super.start();
  }

  stop() {
    if (this.aoEstado) {
      this.client.removeListener('update', this.aoEstado);
      this.aoEstado = null;
    }
    super.stop();
  }

  /**
   * O slug para onde voltar ao sair do Labirinto/Hospital.
   * Preferimos o que vimos com os próprios olhos; se a ferramenta subiu depois
   * de a conta já estar na praça (religação, app reaberto), o próprio jogo ainda
   * guarda a última área em huntSlug — é a mesma fonte que o Mapa usa para
   * marcar "você estava aqui". Com as duas, o retorno nunca fica sem destino.
   */
  alvoDeVolta(st) {
    return this.ultimaHunt || (st && st.huntSlug) || null;
  }

  async preparar() {
    this.ilhaPorSlug = await catalogo.ilhaPorSlug();
  }

  // Parado na praça a conta não rende nada, então não espera o intervalo cheio.
  getInterval() {
    const intervaloMs = Math.max(1, this.config.intervaloMin || 5) * 60000;
    const st = this.client && this.client.state;
    if (st && st.local === 'praca') return Math.min(30000, intervaloMs);
    return intervaloMs;
  }

  primeiroAtrasoMs() { return 20000; }

  // sugeridaOff() do jogo, sem alteração.
  sugerida(hunts) {
    const com = hunts.filter((h) => h.perigo != null);
    if (!com.length) return null;
    const p = Math.min(...com.map((h) => h.perigo));
    const xp = (h) => h.xpH || 0;
    const bits = (h) => h.bitsH || 0;
    return com
      .filter((h) => h.perigo === p)
      .reduce((a, h) => (xp(h) > xp(a) || (xp(h) === xp(a) && bits(h) > bits(a)) ? h : a));
  }

  // Pede a lista e espera a resposta nova chegar. Sem a espera, o passo lia a
  // lista no mesmo instante do pedido e desistia, deixando a conta parada no
  // Hospital um ciclo inteiro à toa.
  async pedirCfg() {
    const velho = this.client.state.offCfg;
    this.client.state.offCfg = null;
    if (!this.send('offline.cfg', {})) {
      this.client.state.offCfg = velho;
      return velho;
    }
    for (let i = 0; i < 20 && !this.client.state.offCfg; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!this.client.state.offCfg) this.client.state.offCfg = velho;
    return this.client.state.offCfg;
  }

  async step() {
    if (this.desligada) return;
    const E = this.estado;
    if (!E) return;
    this.lembrarHunt(E);

    // --- As guardas, antes de qualquer coisa ---
    if (E.local === 'lab') return;                              // Labirinto: não tocamos
    if (E.local !== 'hunt' && E.local !== 'praca') return;      // fora do mapa
    if (!E.ativoId) return;                                     // sem Digimon em campo
    if (E.travaSaidaAte && E.travaSaidaAte > Date.now()) return; // trava de saída do servidor
    if (Date.now() - this.ultimaTroca < 60000) return;           // respiro depois de trocar

    // Voltar à hunt original não depende da lista do servidor: o destino já é
    // conhecido. Resolver isto ANTES do pedirCfg() é o que torna o retorno
    // confiável — se 'offline.cfg' não responder (5 s de espera, servidor
    // ocupado, religação), o caminho antigo desistia e a conta passava o ciclo
    // inteiro parada no Hospital.
    if (E.local === 'praca' && this.config.voltarUltima !== false) {
      const alvo = this.alvoDeVolta(E);
      if (alvo) {
        // Um grupo que faz Labirinto junto cai no Hospital junto. Sem este
        // respiro, as 4 contas mandariam hunt.select no mesmo instante.
        if (!(await this.respirar())) return;
        const B = this.estado;
        if (!B || B.local !== 'praca' || !B.ativoId) return; // saiu sozinho na espera
        if (B.travaSaidaAte && B.travaSaidaAte > Date.now()) return;
        if (!this.send('hunt.select', { slug: alvo })) return;
        this.ultimaTroca = Date.now();
        this.log(`estava parado no Hospital/praça; voltei para a última hunt (${alvo})`);
        return;
      }
      // Sem destino conhecido (conta nova, nunca caçou): cai para a recomendada
      // abaixo, que é melhor do que deixar a conta parada.
    }

    const cfg = await this.pedirCfg();
    if (!cfg || !Array.isArray(cfg.hunts) || !cfg.hunts.length) return;

    // Na espera a conta pode ter entrado no Labirinto ou saído da praça: relê o
    // estado de agora e repete as guardas que importam.
    const A = this.estado;
    if (!A || A.local === 'lab' || !A.ativoId) return;
    if (A.local !== 'hunt' && A.local !== 'praca') return;
    if (A.travaSaidaAte && A.travaSaidaAte > Date.now()) return;

    const elegiveis = cfg.hunts.filter((h) => this.ilhaPorSlug[h.slug] !== 'halloween');
    const sug = this.sugerida(elegiveis);
    if (!sug || !sug.slug) return;
    if (this.config.soTranquilas !== false && sug.perigo > 0) return; // nada que mate o Digimon

    // Na praça o Tamer não está caçando: huntSlug é só a ÚLTIMA área, então aqui
    // não existe "já estou na melhor". Fora da praça, a comparação vale.
    const naPraca = A.local === 'praca';
    if (!naPraca) {
      if (sug.slug === A.huntSlug) return; // já estamos na melhor

      // Só troca se valer a pena: evita pular por 1% de XP.
      const ganhoMin = Math.max(0, this.config.ganhoMin || 0);
      if (ganhoMin > 0) {
        const atual = cfg.hunts.find((h) => h.slug === A.huntSlug);
        const agora = (atual && atual.xpH) || 0;
        if (agora > 0 && (sug.xpH || 0) < agora * (1 + ganhoMin / 100)) return;
      }
    }

    if (!this.send('hunt.select', { slug: sug.slug })) return;
    this.ultimaTroca = Date.now();
    this.log(naPraca
      ? `estava parado no Hospital/praça; voltei a caçar em ${sug.slug} (${sug.nome})`
      : `troquei de ${A.huntSlug || '—'} para ${sug.slug} (${sug.nome}, perigo ${sug.perigo}, ${Math.round(sug.xpH || 0)} xp/h)`);
  }
}

// ------------------------------------------------------------- venda de ovos
// Vende os ovos dos tiers escolhidos, periodicamente.
//
// O tier NÃO vem do servidor: o pacote 'ovos' traz especie, ivs, u, potencia e
// data, e a letra é calculada no cliente. A versão antiga lia `ovo.tier`, que
// não existe — a condição era sempre falsa, a checagem de tier era pulada e
// TODO ovo passava o filtro, inclusive SSS. Agora a letra sai de ovo-tier.js,
// um porte conferido contra o módulo do jogo.
//
// Os campos também foram corrigidos: energia é `data` (o +N), não `energia`;
// `protegido` e `shiny` só existem quando o ovo os tem.
class ToolEggs extends HeadlessTool {
  constructor(client, config) {
    super(client, 'eggs', config);
    this.letraOvo = null;
    this.jaPedidos = new Set();
  }

  async preparar() {
    const { letraOvo } = await catalogo.tierOvo();
    this.letraOvo = letraOvo;
  }

  getInterval() {
    return Math.max(60000, (this.config.intervaloMin || 10) * 60000);
  }

  primeiroAtrasoMs() { return 15000; }

  podeVender(o) {
    const cfg = this.config;
    const tiers = Array.isArray(cfg.tiers) ? cfg.tiers : ['D', 'C', 'B', 'A'];
    const potencias = Array.isArray(cfg.potencias) ? cfg.potencias : [1, 2, 3];

    if (o.travado) return false;                        // cadeado nunca vende
    if (o.shiny && !cfg.shiny) return false;
    if (o.data && !cfg.comEnergia) return false;        // +1 a +5
    if (o.protegido && !cfg.protegido) return false;
    if (o.potencia && !potencias.includes(o.potencia)) return false;
    const t = this.letraOvo(o);
    if (!t || t === '?') return !!cfg.semTier;          // sem sorteio: só se pediu
    return tiers.includes(t);
  }

  step() {
    if (this.desligada) return;
    if (!this.letraOvo) return; // sem o cálculo de tier, não vende nada
    const E = this.estado;
    if (!E) return;

    const bolsa = E.ovos;
    if (!Array.isArray(bolsa) || !bolsa.length) return;

    // A venda só se confirma quando o ovo sai da bolsa, e o pacote 'ovos' pode
    // demorar uma volta. Sem lembrar o que já foi pedido, o passo seguinte lia a
    // mesma bolsa e remandava os mesmos ids — inofensivo no servidor (o ovo já
    // não existe), mas é pedido à toa e polui o log.
    const naBolsa = new Set(bolsa.map((o) => o && o.id));
    for (const id of this.jaPedidos) if (!naBolsa.has(id)) this.jaPedidos.delete(id);

    const alvo = bolsa.filter((o) => o && !this.jaPedidos.has(o.id) && this.podeVender(o));
    if (!alvo.length) return;

    // Em lotes: a mensagem do servidor tem limite de tamanho.
    const ids = alvo.map((o) => o.id);
    for (const id of ids) this.jaPedidos.add(id);
    for (let k = 0; k < ids.length; k += 200) {
      this.send('ovo.vender', { ids: ids.slice(k, k + 200) });
    }
    const tiers = Array.isArray(this.config.tiers) ? this.config.tiers : ['D', 'C', 'B', 'A'];
    this.log(`vendeu ${ids.length} (tiers ${tiers.join('/')})`);
  }
}

// ------------------------------------------------------------- auto labirinto
// Mantém a conta no lobby do Labirinto da Guild, para ela nunca perder uma
// corrida que a guild comece.
//
// Conferido numa conta real (test-lab-campos.js, conta ms1):
//   - 'lab.info' PEDE o lobby; a resposta é o pacote 't: "lab"', com os campos
//     bauHoby/cfg/dif/eu/fila/gerente/guild/noLobby/pronto/ultimo;
//   - entrar é enviar('lab.entrar'); sair é 'lab.sair' (guild.js:547-548);
//   - 'noLobby' diz se JÁ estamos no lobby — é o que evita reentrar em laço;
//   - 'eu' só existe com um Digimon que possa lutar; sem ele o jogo desabilita
//     o botão de entrar, então mandar o comando seria recusado;
//   - 'pronto' false = o mapa do Labirinto não está instalado no servidor;
//   - 'run' presente e sem 'acabou' = corrida rodando: o lobby está fechado;
//   - 'cfg.max' é o teto do lobby (30 na conta observada).
//
// O que esta ferramenta NÃO faz, de propósito:
//   - não manda 'lab.iniciar': começar exige ser dono ou sub-dono ('gerente'),
//     e decidir a hora de começar é do jogador, não nossa;
//   - não manda 'lab.dificuldade': mexer na dificuldade do grupo afeta todos;
//   - não entra em corrida já em andamento com 'lab.voltar' sem ser pedido.
class ToolLab extends HeadlessTool {
  constructor(client, config) {
    super(client, 'lab', config);
    this.ultimaEntrada = 0;
    this.ultimoPedido = 0;
  }

  getInterval() {
    return Math.max(30000, (this.config.intervaloMin || 2) * 60000);
  }

  primeiroAtrasoMs() { return 25000; }

  start() {
    // O servidor avisa 'lab.mudou' quando o lobby muda (alguém entrou, a
    // corrida acabou). Reagir a isso é o que torna a inscrição rápida sem
    // precisar de um intervalo curto batendo no servidor.
    this.aoMudou = () => {
      if (!this.running || this.desligada) return;
      // Um respiro antes, senão todas as contas da guild reagiriam ao mesmo
      // aviso no mesmo instante.
      this.respirar(6000).then((seguir) => { if (seguir) this.passoSeguro(); });
    };
    this.client.on('lab-mudou', this.aoMudou);
    super.start();
  }

  stop() {
    if (this.aoMudou) {
      this.client.removeListener('lab-mudou', this.aoMudou);
      this.aoMudou = null;
    }
    super.stop();
  }

  async passoSeguro() {
    try { await this.step(); } catch (err) { this.log('passo falhou:', err.message); }
  }

  /** Pede o lobby e espera a resposta nova, como a hunt faz com offline.cfg. */
  async pedirLab() {
    const velho = this.client.state.lab;
    this.client.state.lab = null;
    if (!this.send('lab.info', {})) {
      this.client.state.lab = velho;
      return velho;
    }
    for (let i = 0; i < 20 && !this.client.state.lab; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!this.client.state.lab) this.client.state.lab = velho;
    return this.client.state.lab;
  }

  /**
   * Por que não entraríamos no lobby agora.
   * Devolve null quando pode entrar, ou o motivo (para o log) quando não.
   * Separado do step() porque é exatamente isto que os testes verificam.
   */
  motivoParaNaoEntrar(L, E) {
    if (!L) return 'o servidor não respondeu o lobby';
    if (L.guild === false) return 'a conta não está numa guild';
    if (!L.pronto) return 'o mapa do Labirinto não está instalado no servidor';
    if (L.noLobby) return null; // já estamos: o step trata como "nada a fazer"
    if (!L.eu) return 'sem Digimon na equipe que possa lutar';
    if (L.run && !L.run.acabou) return 'uma corrida está em andamento (o lobby reabre quando ela acabar)';
    const max = (L.cfg && L.cfg.max) || 0;
    if (max && Array.isArray(L.fila) && L.fila.length >= max) return `o lobby está cheio (${L.fila.length}/${max})`;
    // No Labirinto a conta já está jogando: não há lobby para entrar.
    if (E && E.local === 'lab') return 'a conta já está dentro do Labirinto';
    return null;
  }

  async step() {
    if (this.desligada) return;
    const E = this.estado;
    if (!E) return;

    // Dentro do Labirinto não há nada a inscrever.
    if (E.local === 'lab') return;
    // Respiro depois de entrar: evita remandar o comando enquanto o servidor
    // ainda não devolveu o lobby com noLobby true.
    if (Date.now() - this.ultimaEntrada < 30000) return;

    const L = await this.pedirLab();
    if (!L) return;

    if (L.noLobby) return; // já inscrito: é o estado que queremos

    const motivo = this.motivoParaNaoEntrar(L, this.estado);
    if (motivo) {
      // Só loga quando o motivo muda, senão polui o log a cada volta.
      if (this.ultimoMotivo !== motivo) {
        this.ultimoMotivo = motivo;
        this.log(`não entrei no lobby: ${motivo}`);
      }
      return;
    }
    this.ultimoMotivo = null;

    // Um grupo inteiro reage ao mesmo 'lab.mudou': sem este respiro as contas
    // mandariam lab.entrar no mesmo instante.
    if (!(await this.respirar(5000))) return;

    // Relê: na espera a corrida pode ter começado ou o lobby enchido.
    const L2 = this.client.state.lab;
    const motivo2 = this.motivoParaNaoEntrar(L2 || L, this.estado);
    if (motivo2 || (L2 && L2.noLobby)) return;

    if (!this.send('lab.entrar', {})) return;
    this.ultimaEntrada = Date.now();
    const n = Array.isArray(L.fila) ? L.fila.length : '?';
    const max = (L.cfg && L.cfg.max) || '?';
    this.log(`entrei no lobby do Labirinto (${n}/${max} antes de mim)`);
  }
}

// ----------------------------------------------------------------- auto passe
// Resgata o Passe de Batalha todo dia. Perder UM dia zera a trilha de 30 dias
// ("Faltou um dia, a trilha volta ao Dia 1", regra escrita na própria tela),
// levando embora os baús dos dias 7/14/21/28 e o Lendário do 30 — é por isso
// que esta ferramenta existe.
//
// Conferido no cliente do jogo (js/menus.js, abrirPasse) e em 4 contas reais
// (test-passe-estado.js):
//   - NÃO existe pacote de leitura do passe: o estado vem dentro do 'estado',
//     em estado.passe = { dia, feitos, nivel, pode, premium, premiumAte,
//     premiumPend, ultimo };
//   - resgatar é enviar('passe.resgatar'), SEM argumentos — o servidor sabe
//     qual é o dia; é exatamente o que o botão #passe-resgatar manda;
//   - o botão liga com `hoje = p.pode ? p.dia : 0`, e fica desabilitado abaixo
//     do nível mínimo, então a guarda é `pode && nivel >= passe.nivel`;
//   - 'premiumPend' são os dias cujo Premium ainda não foi pego (o jogo chama
//     de "Premium atrasado"); resgatá-los é enviar('passe.premium').
//
// Sobre o reset: a trilha vira à meia-noite de BRASÍLIA (UTC-3 o ano todo,
// novoDiaPasse() no jogo). Mas não calculamos isso — 'pode' já é a palavra do
// servidor, então basta conferir de tempo em tempo e agir quando ele virar
// true. Isso é imune a fuso errado, PC dormindo e relógio fora de hora.
//
// O que NÃO faz, de propósito: nunca manda shop.comprar {id:'passe-premium'} —
// o Premium custa 50 DCoin e comprar é decisão do jogador, não de automação.
class ToolPasse extends HeadlessTool {
  constructor(client, config) {
    super(client, 'passe', config);
    this.ultimoResgate = 0;
    this.ultimoMotivo = null;
    this.ultimoDiaVisto = null;
  }

  getInterval() {
    return Math.max(60000, (this.config.intervaloMin || 10) * 60000);
  }

  // O passe não corre: o dia inteiro serve. Estreia tarde para não disputar o
  // boot com as outras ferramentas.
  primeiroAtrasoMs() { return 40000; }

  /**
   * Por que não resgataríamos agora. null = pode resgatar.
   * Espelha a decisão do botão do jogo; separado do step() porque é isto que
   * os testes verificam.
   */
  motivoParaNaoResgatar(P, E) {
    if (!P) return 'o estado ainda não trouxe o passe';
    if (!P.pode) return 'o dia de hoje já foi resgatado';
    const min = P.nivel || 0;
    if (E && min && E.nivel < min) return `o passe libera no nível ${min} (a conta está no ${E.nivel})`;
    return null;
  }

  /**
   * Dias de Premium atrasado. Vazio quando não há o que pegar.
   * A conta precisa TER o Premium: sem ele não existe atrasado, e mandar o
   * comando seria recusado. A opção da UI também desliga isto.
   */
  premiumPendente(P) {
    if (this.config.premiumAtrasado === false) return [];
    if (!P || !P.premium) return [];
    return Array.isArray(P.premiumPend) ? P.premiumPend : [];
  }

  async step() {
    if (this.desligada) return;
    const E = this.estado;
    if (!E) return;

    const P = E.passe;

    // Respiro depois de resgatar: o 'estado' pode ainda não ter trazido o
    // 'pode' novo, e remandar o comando não teria efeito nenhum.
    if (Date.now() - this.ultimoResgate < 60000) return;

    const motivo = this.motivoParaNaoResgatar(P, E);
    if (motivo) {
      // Só loga quando muda, senão o log enche (isto roda o dia todo).
      if (this.ultimoMotivo !== motivo) {
        this.ultimoMotivo = motivo;
        this.log(motivo);
      }
      // Mesmo sem resgate do dia, pode haver Premium atrasado a pegar.
      await this.resgatarPremium(P);
      return;
    }
    this.ultimoMotivo = null;

    // Várias contas viram o dia no mesmo instante (meia-noite é igual para
    // todas): sem este respiro elas mandariam o comando no mesmo segundo.
    if (!(await this.respirar(8000))) return;

    // Relê: na espera o 'estado' pode ter trazido um 'pode' já false.
    const P2 = (this.estado && this.estado.passe) || P;
    if (this.motivoParaNaoResgatar(P2, this.estado)) return;

    if (!this.send('passe.resgatar', {})) return;
    this.ultimoResgate = Date.now();
    this.ultimoDiaVisto = P2.dia;
    this.log(`resgatei o Dia ${P2.dia} do Passe (${P2.feitos + 1}/30 na trilha)`);

    // Com Premium, o resgate do dia já entrega os dois (grátis + Premium). O
    // 'passe.premium' é só para os dias cujo Premium ficou atrasado — por
    // exemplo quando o Premium foi comprado depois de o ciclo começar.
    await this.resgatarPremium(this.estado && this.estado.passe);
  }

  /**
   * Resgata o Premium atrasado, se houver.
   * Sem Premium na conta a lista vem vazia e nada é enviado — era o pedido:
   * confere se tem, e só então resgata.
   */
  async resgatarPremium(P) {
    const pend = this.premiumPendente(P);
    if (!pend.length) return;
    if (!(await this.respirar(5000))) return;
    if (!this.send('passe.premium', {})) return;
    this.log(`resgatei o Premium atrasado de ${pend.length} dia(s): ${pend.join(', ')}`);
  }
}

// ---------------------------------------------------------------- sniper
// Varre o Mercado e compra o que está abaixo do teto. Porte do codeSniper do
// webview (src/renderer/tools.js), com as mesmas travas.
//
// O ponto da ferramenta é a RETENÇÃO: no DigiIdle todo anúncio nasce travado e
// só fica comprável 2 min depois (medido em conta real: 119.993 ms). Quem varre
// de minuto em minuto chega até 60 s atrasado; aqui o anúncio retido entra numa
// fila e a compra acorda no milissegundo do 'libera'.
//
// Conferido no cliente do jogo e em conta real:
//   - pedir é enviar('mercado.listar', filtro); a resposta é o pacote 'mercado';
//   - comprar é enviar('mercado.comprar', { id, qtd, preco, moeda });
//   - mandar o 'preco' é trava de graça: o servidor recusa se o vendedor mudou
//     o valor, então é impossível pagar mais do que se viu;
//   - tier, potência e energia são filtrados pelo SERVIDOR (tiers, potencias,
//     maisMin), então nenhuma regra do jogo é reimplementada aqui.
//
// Potência NÃO é energia: 'potencias' é o P1–P5 e 'maisMin' é o +N do ovo. Um
// pedido com maisMin=4 devolveu um ovo potencia:1/data:5 — trocar os dois faria
// a ferramenta comprar justamente o que não foi pedido.
class ToolSniper extends HeadlessTool {
  constructor(client, config) {
    super(client, 'sniper', config);
    this.desvio = 0;            // nosso relógio menos o do servidor
    this.fila = new Map();      // id do anúncio -> timer do libera
    this.comprados = new Set(); // nunca tenta o mesmo anúncio duas vezes
    this.compras = [];          // instantes das compras, para o limite por hora
    this.listaPend = null;
    this.avisouSaldo = {};      // o aviso de saldo curto sai uma vez por moeda

    // A resposta de 'mercado.listar' e o aviso de que o mercado mexeu.
    this.client.on('mercado', (m) => {
      if (typeof m.agora === 'number') this.desvio = Date.now() - m.agora;
      const r = this.listaPend;
      this.listaPend = null;
      if (r) r(m);
    });
    this.client.on('mercado-mudou', () => {
      // É o momento mais provável de aparecer coisa nova, então varre já — com
      // um respiro para as contas não pedirem todas no mesmo instante.
      if (!this.running || this.desligada) return;
      setTimeout(() => { this.step().catch(() => {}); }, 400 + Math.random() * 800);
    });
  }

  /**
   * Os alvos que valem busca. Alvo sem teto não compra nada, e nem vale pedir a
   * lista por ele — é o padrão de fábrica, então ligar a ferramenta sem
   * configurar não gasta um bit.
   *
   * O segundo caso é mais perigoso porque parece configurado: alvo de ITEM sem
   * item escolhido. O pedido sairia sem 'especie', o servidor listaria TODO item
   * do Mercado e o sniper compraria qualquer coisa abaixo do teto. Um alvo pela
   * metade não deve virar um alvo largo.
   *
   * É um getter, e não um valor guardado no constructor, porque startTool()
   * troca this.config na ferramenta que já roda: uma cópia feita no constructor
   * ficaria velha, e o sniper seguiria comprando pelos alvos antigos.
   */
  get alvos() {
    return (this.config.alvos || []).filter((a) => {
      if (!a || !(a.tetoPreco > 0)) return false;
      if ((a.tipo || 'ovo') === 'item' && !a.especie) return false;
      return true;
    });
  }

  /**
   * É o mesmo alvo, depois de a config ser trocada?
   *
   * Os alvos não têm id: o que os identifica é o que eles procuram. Comparar o
   * filtro resolvido (já com os defaults aplicados) é mais confiável do que
   * comparar campo a campo, porque é exatamente o que vai ao servidor — dois
   * alvos com o mesmo filtro são indistinguíveis na prática.
   */
  mesmoAlvo(x, y) {
    const fx = this.filtroDe(x), fy = this.filtroDe(y);
    if (!fx || !fy) return false;
    return JSON.stringify(fx) === JSON.stringify(fy);
  }

  getInterval() { return Math.max(20000, (this.config.intervaloSec || 60) * 1000); }

  stop() {
    super.stop();
    for (const t of this.fila.values()) clearTimeout(t);
    this.fila.clear();
  }

  agoraServidor() { return Date.now() - this.desvio; }

  /** Pede uma listagem e espera o pacote 'mercado'. null se não vier. */
  listar(filtro) {
    return new Promise((resolve) => {
      // filtroDe() devolve null quando o alvo sumiu: não há o que pedir.
      if (!filtro) { resolve(null); return; }
      this.listaPend = resolve;
      if (!this.send('mercado.listar', filtro)) { this.listaPend = null; resolve(null); return; }
      setTimeout(() => { if (this.listaPend === resolve) { this.listaPend = null; resolve(null); } }, 8000);
    });
  }

  /**
   * O filtro de um alvo, no formato que o SERVIDOR entende. Campos vazios são
   * omitidos: mandar 'tiers: ""' é o mesmo que não filtrar, mas enviar o campo
   * à toa só aumenta a chance de divergir do que o jogo manda.
   */
  filtroDe(a) {
    // Sem alvo não há filtro possível. Um pedido montado sobre undefined iria
    // ao servidor sem 'precoMax' e listaria o Mercado inteiro — exatamente o
    // caso que o getter 'alvos' existe para impedir. Melhor não pedir nada.
    if (!a) return null;
    const f = { tipo: a.tipo || 'ovo', moeda: a.moeda || 'bits', ordem: 'barato', pagina: 0 };
    f.precoMax = a.tetoPreco;
    if (a.especie) f.especie = a.especie;
    if (a.busca) f.busca = a.busca;
    if (a.tiers && a.tiers.length) f.tiers = a.tiers.join(',');
    if (a.potencias && a.potencias.length) f.potencias = a.potencias.join(',');
    if (a.energiaMin > 0) f.maisMin = a.energiaMin;
    if (a.familia) f.familia = a.familia;
    if (a.soShiny) f.soShiny = true;
    return f;
  }

  saldoDe(moeda) {
    const E = this.estado || {};
    return moeda === 'gemas' ? (E.gemas || 0) : (E.bits || 0);
  }

  reservaDe(moeda) {
    return Math.max(0, (moeda === 'gemas' ? this.config.reservaGemas : this.config.reservaBits) || 0);
  }

  /** Dá para pagar este anúncio sem furar a reserva? */
  cabe(a) { return this.saldoDe(a.moeda) - this.reservaDe(a.moeda) >= a.preco; }

  noLimite() {
    const max = Math.max(0, this.config.maxPorHora || 0);
    if (!max) return false;
    const corte = Date.now() - 3600000;
    this.compras = this.compras.filter((t) => t > corte);
    return this.compras.length >= max;
  }

  /** Comprar. Só é chamada quando o anúncio já está liberado. */
  async comprar(a, alvo) {
    if (this.desligada || this.comprados.has(a.id)) return;
    if (this.noLimite()) { this.log(`limite de ${this.config.maxPorHora} compra(s)/hora atingido; deixando passar #${a.id}`); return; }
    if (!this.cabe(a)) { this.log(`#${a.id} custa ${a.preco} ${a.moeda}, mas a reserva não deixa`); return; }
    // Marca ANTES de enviar: se o envio falhar, melhor perder uma pechincha do
    // que arriscar comprar duas vezes.
    this.comprados.add(a.id);
    this.fila.delete(a.id);
    if (!this.send('mercado.comprar', { id: a.id, qtd: 1, preco: a.preco, moeda: a.moeda })) return;
    this.compras.push(Date.now());
    this.avisouSaldo[a.moeda] = false; // o saldo mudou: vale avisar de novo se faltar
    const nome = (a.resumo && a.resumo.especie) || a.item || a.tipo;
    this.log(`comprei #${a.id} (${nome}) por ${a.preco} ${a.moeda === 'gemas' ? 'D-Dol' : 'bits'}${alvo.nome ? ` [${alvo.nome}]` : ''}`);
  }

  /**
   * Agenda a compra para o instante do libera. É isto que ganha a corrida: em
   * vez de reconferir de minuto em minuto, acordamos no milissegundo em que o
   * anúncio fica comprável.
   *
   * A folga existe porque o servidor recusa quem chega adiantado: o desvio de
   * relógio é medido, mas não é exato, e a rede ainda cobra o seu tempo.
   */
  agendar(a, alvo) {
    if (!alvo) return;
    if (this.fila.has(a.id) || this.comprados.has(a.id)) return;
    const espera = a.libera - this.agoraServidor() + 250;
    if (espera > 15 * 60000) return; // a retenção é de 2 min; isto não deveria acontecer
    const timer = setTimeout(async () => {
      this.fila.delete(a.id);
      if (!this.running || this.desligada) return;
      try {
        // O alvo também pode ter mudado na espera: startTool() troca this.config
        // na ferramenta que já roda, e os 2 min de retenção são tempo de sobra
        // para alguém editar ou apagar o alvo na UI. Comprar por um alvo que não
        // existe mais é gastar contra a vontade de quem acabou de mudá-lo, então
        // revalidamos contra a config de AGORA.
        const atual = this.alvos.find((x) => this.mesmoAlvo(x, alvo));
        if (!atual) { this.log(`#${a.id} saiu da fila: o alvo mudou ou foi removido`); return; }
        // O mundo pode ter mudado nos 2 min de espera: outro comprador levou, o
        // vendedor retirou ou mudou o preço. Então reconferimos o anúncio AGORA,
        // em vez de confiar na foto antiga.
        const m = await this.listar(this.filtroDe(atual));
        if (!m || this.desligada) return;
        const vivo = (m.lista || []).find((x) => x.id === a.id);
        if (!vivo) { this.log(`#${a.id} já não está à venda (alguém chegou antes)`); return; }
        if (vivo.preco > atual.tetoPreco) { this.log(`#${a.id} subiu para ${vivo.preco}; acima do teto`); return; }
        if (vivo.libera > this.agoraServidor()) { this.agendar(vivo, atual); return; } // preço mudou: retenção reiniciou
        await this.comprar(vivo, atual);
      } catch (err) {
        this.log('a compra agendada falhou:', err.message);
      }
    }, Math.max(0, espera));
    if (timer.unref) timer.unref();
    this.fila.set(a.id, timer);
    this.log(`#${a.id} na fila por ${a.preco} ${a.moeda === 'gemas' ? 'D-Dol' : 'bits'} — libera em ${Math.ceil((a.libera - this.agoraServidor()) / 1000)}s`);
  }

  async step() {
    if (this.desligada || !this.estado) return;
    for (const alvo of this.alvos) {
      if (this.desligada || this.noLimite()) break;
      const m = await this.listar(this.filtroDe(alvo));
      if (!m) continue;
      for (const a of m.lista || []) {
        if (this.comprados.has(a.id) || this.fila.has(a.id)) continue;
        // As guardas: nunca o nosso anúncio, nunca fechado, nunca acima do teto.
        // O precoMax já foi ao servidor, mas reconferimos aqui — um filtro que o
        // servidor ignorasse viraria compra indevida, e esse é o erro que custa.
        if (a.meu) continue;
        if (a.estado && a.estado !== 'aberto') continue;
        if (a.moeda !== (alvo.moeda || 'bits')) continue;
        if (!(a.preco > 0) || a.preco > alvo.tetoPreco) continue;
        // Saldo curto é o motivo mais chato de "o sniper nunca compra": do lado
        // de fora é idêntico a "não achou nada". Então ele é dito em voz alta,
        // uma vez por moeda, em vez de virar um 'continue' calado.
        if (!this.cabe(a)) {
          if (!this.avisouSaldo[a.moeda]) {
            this.avisouSaldo[a.moeda] = true;
            const moeda = a.moeda === 'gemas' ? 'D-Dol' : 'bits';
            this.log(`achei #${a.id} por ${a.preco} ${moeda}, mas o saldo disponível é ${this.saldoDe(a.moeda) - this.reservaDe(a.moeda)} (saldo ${this.saldoDe(a.moeda)} menos a reserva ${this.reservaDe(a.moeda)}). Não vou comprar.`);
          }
          continue;
        }
        if (a.libera > this.agoraServidor()) {
          if (!this.config.soLiberados) this.agendar(a, alvo);
          continue;
        }
        await this.comprar(a, alvo);
        if (this.noLimite()) break;
      }
    }
  }
}

function createHeadlessTool(client, toolId, config) {
  if (!config) return null;
  switch (toolId) {
    case 'scan': return new ToolScan(client, config);
    case 'refill': return new ToolRefill(client, config);
    case 'hunt': return new ToolHunt(client, config);
    case 'eggs': return new ToolEggs(client, config);
    case 'lab': return new ToolLab(client, config);
    case 'passe': return new ToolPasse(client, config);
    case 'sniper': return new ToolSniper(client, config);
    default: return null;
  }
}

module.exports = { HeadlessTool, ToolScan, ToolRefill, ToolHunt, ToolEggs, ToolLab, ToolPasse, ToolSniper, createHeadlessTool };
