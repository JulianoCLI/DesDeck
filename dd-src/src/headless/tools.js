'use strict';
// Ferramentas no modo headless.
//
// São as mesmas 4 automações que o DesDeck injeta na página do jogo
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
      .finally(() => { if (this.running) this.agendar(this.primeiroAtrasoMs()); });
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

  agendar(ms) {
    if (!this.running) return;
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = setTimeout(() => this.loop(), ms);
    if (this.loopTimer.unref) this.loopTimer.unref();
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

    // --- As guardas, antes de qualquer coisa ---
    if (E.local === 'lab') return;                              // Labirinto: não tocamos
    if (E.local !== 'hunt' && E.local !== 'praca') return;      // fora do mapa
    if (!E.ativoId) return;                                     // sem Digimon em campo
    if (E.travaSaidaAte && E.travaSaidaAte > Date.now()) return; // trava de saída do servidor
    if (Date.now() - this.ultimaTroca < 60000) return;           // respiro depois de trocar

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

function createHeadlessTool(client, toolId, config) {
  if (!config) return null;
  switch (toolId) {
    case 'scan': return new ToolScan(client, config);
    case 'refill': return new ToolRefill(client, config);
    case 'hunt': return new ToolHunt(client, config);
    case 'eggs': return new ToolEggs(client, config);
    default: return null;
  }
}

module.exports = { HeadlessTool, ToolScan, ToolRefill, ToolHunt, ToolEggs, createHeadlessTool };
