'use strict';
// Carregado antes de app.js (index.html). O renderer roda sem Node (nodeIntegration: false),
// então isto não é um módulo CommonJS: publica o catálogo em window.DDTools.
//
// Ferramentas: automações prontas que o DesDeck injeta na página do jogo, ligadas por conta.
//
// Cada ferramenta é um "script de fábrica": o mesmo caminho dos scripts do usuário
// (executeJavaScript no dom-ready), só que o código é gerado a partir da configuração
// que a pessoa escolheu para aquela conta. O estado fica em state.tools:
//
//   state.tools = { [toolId]: { [accountId]: { enabled: bool, cfg: {...} } } }
//
// Nada roda sem a conta estar marcada: sem entrada aqui, a ferramenta não é injetada.

// ---------------------------------------------------------------- base comum
// Ponte com o jogo, compartilhada pelas ferramentas. Instalada uma vez por página.
//
// O porquê de cada parte (tudo conferido no cliente do DigiIdle):
//   - app.js é um ES module: `enviar` e o estado `E` não existem em window
//     (window.__dc só é criado em localhost). Então a via é o próprio WebSocket.
//   - O socket conecta com &z=1 e o servidor manda cada pacote em zstd binário.
//     Tirando o z=1 da URL, ele manda JSON puro — e o cliente aceita texto normal,
//     porque só descomprime quando o dado não é string.
//   - Comandos usados: 'market.comprar' {item,qtd} (js/loja.js) e 'ovo.vender' {ids}
//     (js/menus2.js), exatamente os que os botões do jogo mandam.
const PONTE_JS = `
if (!window.__ddGame) {
  const G = window.__ddGame = {
    sock: null, estado: null, ovos: null, campo: null, offCfg: null, pronto: false,
    espera: [], aoMorrer: [],
    // A config de cada ferramenta que já está rodando nesta página. O objeto de cada
    // uma é criado UMA vez e depois só mutado: assim o laço da ferramenta, que guardou
    // a referência, passa a ler os valores novos sem precisar ser reinjetado (sem F5).
    cfg: {},
    // Troca a config no lugar. Devolve true se a ferramenta já estava rodando — nesse
    // caso quem chamou não deve montar o laço de novo, só deixar o antigo seguir.
    aplicar(id, novo) {
      const atual = this.cfg[id];
      if (!atual) { this.cfg[id] = novo; return false; }
      for (const k of Object.keys(atual)) delete atual[k];
      Object.assign(atual, novo); // __off some aqui: desligar e religar volta a agir
      return true;
    },
    // Desligar sem recarregar: o laço continua existindo, mas cada passo desiste.
    desligar(id) { if (this.cfg[id]) this.cfg[id].__off = true; },
    quando(fn) { this.pronto ? fn() : this.espera.push(fn); },
    enviar(t, dados) {
      if (!this.sock || this.sock.readyState !== 1) return false;
      this.sock.send(JSON.stringify({ t, ...dados }));
      return true;
    },
    log(...a) { console.log('[ferramentas]', ...a); },
  };
  const adotar = (ws) => {
    if (!ws || G.sock === ws) return;
    G.sock = ws;
    // addEventListener é um canal à parte: o onmessage do jogo continua intacto.
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return; // pacote ainda comprimido: não é o nosso
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (!m) return;
      if (m.t === 'estado') { G.estado = m; if (!G.pronto) { G.pronto = true; G.espera.splice(0).forEach((f) => { try { f(); } catch (e) { console.error(e); } }); } }
      else if (m.t === 'ovos') G.ovos = m.lista || [];
      // 'campo' é a cena. No Labirinto ele vem como delta (campo-delta.js); não
      // remontamos nada: só guardamos o pacote cheio, que é onde os corpos aparecem.
      else if (m.t === 'campo') { if (!m.delta) G.campo = m; }
      // 'batalha' chega mesmo com a cena desligada (Modo Economia). Cada evento com
      // morto:true diz, em 'para', o id do inimigo que acabou de cair — ou seja, o
      // corpo que o jogo mostraria na lista de caídos. É a via do scan sem a cena.
      else if (m.t === 'batalha') {
        for (const e of (m.ev || [])) {
          if (!e || !e.morto) continue;
          const id = Number(e.para);
          if (!id) continue; // 'a' (o nosso Digimon) não é número: morte nossa, não corpo
          for (const fn of G.aoMorrer) { try { fn(id); } catch (err) { console.error(err); } }
        }
      }
      // A lista de hunts com perigo/xpH do Digimon em campo: é daqui que o Mapa
      // tira a área recomendada. Pedida com enviar('offline.cfg').
      else if (m.t === 'offline.cfg') G.offCfg = m;
    });
    ws.addEventListener('close', () => { if (G.sock === ws) G.sock = null; });
  };
  const Nativo = window.WebSocket;
  function Hook(url, protos) {
    let u = String(url);
    if (/\\/ws\\b/.test(u) && /[?&]z=1/.test(u)) u = u.replace(/&z=1/, '').replace(/\\?z=1&/, '?');
    const ws = protos === undefined ? new Nativo(u) : new Nativo(u, protos);
    if (/\\/ws\\b/.test(u)) adotar(ws);
    return ws;
  }
  Hook.prototype = Nativo.prototype;
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Hook[k] = Nativo[k];
  window.WebSocket = Hook;
  // O jogo às vezes conecta antes desta injeção (ele chama connect() no carregamento,
  // então o dom-ready pode chegar depois). Nesse caso o socket ainda tem z=1 e os
  // pacotes vêm em zstd binário, ilegíveis para nós. Pegamos esse socket no primeiro
  // send (o ping sai a cada 25 s) e o fechamos: o jogo reconecta sozinho, agora
  // passando pelo Hook, que tira o z=1. Uma vez só, para não entrar em laço.
  let jaReconectou = false;
  const semCompressao = () => {
    if (jaReconectou || !G.sock || G.estado) return;
    if (!/[?&]z=1/.test(G.sock.url || '')) return;
    jaReconectou = true;
    G.log('socket aberto antes da injeção: reconectando sem compressão para poder ler o jogo.');
    try { G.sock.close(1000, 'desdeck: reconectar sem compressao'); } catch (e) { /* já caiu */ }
  };
  const sendNativo = Nativo.prototype.send;
  Nativo.prototype.send = function (...a) {
    if (!G.sock && this.url && /\\/ws\\b/.test(this.url)) { adotar(this); setTimeout(semCompressao, 0); }
    return sendNativo.apply(this, a);
  };
  setTimeout(() => {
    if (!G.estado) G.log('ainda não consegui ler o estado do jogo; recarregue esta conta (F5) se as ferramentas não agirem.');
  }, 120000);
}
var G = window.__ddGame;
`;

// Cada ferramenta é injetada no escopo global da página, uma por vez. Sem isto, a
// segunda a entrar estourava "Identifier 'G' has already been declared" e simplesmente
// não rodava — então a conta ficava com só uma ferramenta ativa, sem erro visível na UI.
// Embrulhar em função deixa cada ferramenta com o seu próprio escopo.
const isolar = (corpo) => `(() => {\n${corpo}\n})();`;

// Entrega a config à ferramenta sem reinjetar nada.
//
// Antes, mudar um ajuste exigia F5: a config era uma constante colada no código, então
// a única forma de trocá-la era injetar o script outra vez — e injetar de novo numa
// página que já rodava a ferramenta criaria um segundo setInterval, duplicando compras.
//
// Agora a config vive em G.cfg[id], um objeto mutável. Reinjetar a ferramenta só troca
// o conteúdo desse objeto e sai (o 'return' abaixo), deixando o laço original seguir —
// agora lendo os valores novos. Na primeira vez, aplicar() devolve false e o laço é montado.
const comCfg = (id, cfg, corpo) => `${PONTE_JS}
if (G.aplicar(${JSON.stringify(id)}, ${JSON.stringify(cfg)})) return; // já rodava: só troquei os valores
const CFG = G.cfg[${JSON.stringify(id)}];
${corpo}`;

// ---------------------------------------------------------------- auto refill
const REFILL_ITENS = [
  { id: 'scanner-basico', nome: 'Scanner Básico' },
  { id: 'scanner-plus', nome: 'Scanner Plus' },
  { id: 'scanner-super', nome: 'Scanner Super' },
  { id: 'scanner-ultra', nome: 'Scanner Ultra' },
  { id: 'pocao-small', nome: 'Small Potion' },
  { id: 'pocao-great', nome: 'Great Potion' },
  { id: 'pocao-ultra', nome: 'Ultra Potion' },
  { id: 'pocao-hyper', nome: 'Hyper Potion' },
  { id: 'pocao-ultimate', nome: 'Ultimate Potion' },
  { id: 'pocao-golden', nome: 'Golden Potion' },
  { id: 'revive', nome: 'Revive' },
  { id: 'revive-max', nome: 'Max Revive' },
  { id: 'pocao-evp', nome: 'Poção de EVP' },
];

function codeRefill(cfg) {
  const regras = (cfg.regras || []).filter((r) => r && r.item && r.max > r.min);
  return isolar(comCfg('refill', {
    regras,
    reservaBits: cfg.reservaBits || 0,
    parcial: cfg.parcial !== false,
    intervaloMs: Math.max(5, cfg.intervaloSec || 15) * 1000,
  }, `
(async () => {
  // Preços em bits do catálogo do próprio jogo (scanners, poções, revives, evolução).
  let precos = {};
  try {
    const j = await (await fetch('/shared/itens.json?v=1', { credentials: 'same-origin' })).json();
    for (const c of ['scanners', 'pocoes', 'revives', 'evolucao']) for (const i of j[c] || []) if (i.preco > 0) precos[i.id] = i.preco;
  } catch (e) { G.log('refill: não carregou os preços:', e.message); return; }

  let ultima = 0, pendente = null;
  const passo = () => {
    const E = G.estado;
    if (!E || CFG.__off) return;
    if (!CFG.regras.length) return; // a pessoa apagou todas as regras: nada a comprar
    const itens = E.itens || {}, bits = E.bits || 0;
    // Uma compra só é confirmada pelo "estado" seguinte; até lá não insiste.
    if (pendente) {
      if ((itens[pendente.item] || 0) >= pendente.alvo) pendente = null;
      else if (Date.now() - pendente.em > 15000) { G.log('refill: compra não confirmada:', pendente.item); pendente = null; }
      else return;
    }
    if (Date.now() - ultima < 4000) return;
    for (const r of CFG.regras) {
      const preco = precos[r.item];
      if (!preco) continue;
      const tem = itens[r.item] || 0;
      if (tem > r.min) continue;
      const livre = bits - CFG.reservaBits;
      let qtd = r.max - tem;
      if (qtd <= 0) continue;
      if (qtd * preco > livre) { if (!CFG.parcial) continue; qtd = Math.floor(livre / preco); }
      if (qtd <= 0) continue;
      if (!G.enviar('market.comprar', { item: r.item, qtd })) return;
      ultima = Date.now();
      pendente = { item: r.item, alvo: tem + qtd, em: Date.now() };
      G.log('refill: comprou ' + qtd + 'x ' + r.item + ' por ' + (qtd * preco) + ' bits (tinha ' + tem + ')');
      return; // uma por rodada: o saldo novo vem no próximo estado
    }
  };
  // Reagenda a cada volta em vez de setInterval fixo: assim mudar o intervalo nos
  // ajustes passa a valer na próxima volta, sem reinjetar.
  const laco = () => { try { passo(); } finally { setTimeout(laco, CFG.intervaloMs); } };
  G.quando(laco);
})();`));
}

// ---------------------------------------------------------- auto melhor hunt
// Troca para a área recomendada do Mapa quando não estamos nela.
//
// O que foi conferido no cliente (js/app.js):
//   - A recomendada do Mapa é sugeridaOff() (app.js:865), aplicada sobre offlineCfg.hunts
//     excluindo a ilha 'halloween' (app.js:3815). A regra é: entre as de MENOR perigo,
//     a de maior xpH; empate decide por bitsH. Copiada letra a letra, sem "melhorar".
//   - offlineCfg chega na mensagem 'offline.cfg' e é pedida com enviar('offline.cfg').
//   - Trocar de área é enviar('hunt.select', { slug }) (app.js:3733, função cacar).
//   - "Você está aqui" só vale com E.local === 'hunt'; na cidade E.huntSlug é apenas a
//     última área (app.js:3709-3710). Por isso só agimos com local === 'hunt'.
//   - Labirinto da Guild é E.local === 'lab' (app.js:3009, 2436). É a guarda que o
//     usuário pediu: no Labirinto a ferramenta não encosta na hunt.
function codeHunt(cfg) {
  return isolar(comCfg('hunt', {
    intervaloMs: Math.max(1, cfg.intervaloMin || 5) * 60000,
    soTranquilas: cfg.soTranquilas !== false,
    ganhoMin: Math.max(0, cfg.ganhoMin || 0),
  }, `
(async () => {
  // Precisamos saber a ilha de cada área para excluir 'halloween', igual ao Mapa.
  let ilhaPorSlug = {};
  try {
    const areas = await (await fetch('/shared/areas.json?v=1', { credentials: 'same-origin' })).json();
    const lista = Array.isArray(areas) ? areas : (areas.areas || []);
    for (const a of lista) ilhaPorSlug[a.slug] = a.ilha || 'file-island';
  } catch (e) {
    G.log('hunt: não carregou as áreas (' + e.message + '). Por segurança, não vou trocar de hunt.');
    return;
  }

  // sugeridaOff() do jogo (app.js:865), sem alteração.
  const sugerida = (hunts) => {
    const com = hunts.filter((h) => h.perigo != null);
    if (!com.length) return null;
    const p = Math.min(...com.map((h) => h.perigo));
    const xp = (h) => h.xpH || 0, bits = (h) => h.bitsH || 0;
    return com.filter((h) => h.perigo === p).reduce((a, h) => (xp(h) > xp(a) || (xp(h) === xp(a) && bits(h) > bits(a)) ? h : a));
  };

  let ultimaTroca = 0;
  // Espera a resposta de 'offline.cfg' chegar (ela cai em G.offCfg pela ponte). Sem
  // isso o passo pedia a lista e lia G.offCfg no MESMO instante: na primeira volta
  // ainda não havia resposta, então ele desistia e só agia na volta seguinte — a
  // conta ficava parada no Hospital um ciclo inteiro à toa.
  const pedirCfg = async () => {
    const velho = G.offCfg;
    G.offCfg = null;                 // para saber se a resposta NOVA chegou
    G.enviar('offline.cfg', {});
    for (let i = 0; i < 20 && !G.offCfg; i++) await new Promise((r) => setTimeout(r, 250));
    if (!G.offCfg) G.offCfg = velho; // não respondeu em 5s: fica com a lista anterior
    return G.offCfg;
  };

  const passo = async () => {
    const E = G.estado;
    if (!E || CFG.__off) return;

    // --- As guardas, antes de qualquer coisa ---
    // Labirinto da Guild: o usuário está fazendo Labirinto. Não tocamos em nada.
    if (E.local === 'lab') return;
    // E.local só tem três valores no cliente: 'hunt', 'lab' e 'praca'. 'praca' é o
    // Hospital Digital / Cidade Inicial — é para onde o Digimon vai ao morrer sem
    // revive, e lá ele fica parado, sem caçar. Antes eu desistia aqui, então a conta
    // ficava presa no Hospital: era o problema relatado. O próprio jogo permite sair
    // daqui — o botão "Caçar aqui" do Mapa chama cacar() (app.js:3733), que manda
    // hunt.select sem exigir local === 'hunt'.
    if (E.local !== 'hunt' && E.local !== 'praca') return;
    // Sem Digimon em campo a recomendação do jogo nem existe (app.js:3766).
    if (!E.ativoId) return;
    // Trava de saída do servidor (app.js:3051): enquanto corre, o jogo desabilita o
    // próprio botão de sair. Mandar hunt.select agora seria recusado.
    if (E.travaSaidaAte && E.travaSaidaAte > Date.now()) return;
    if (Date.now() - ultimaTroca < 60000) return; // respiro depois de trocar

    const cfg = await pedirCfg(); // pede a lista fresca e espera a resposta
    if (!cfg || !Array.isArray(cfg.hunts) || !cfg.hunts.length) return;
    // A cada mensagem 'estado' a ponte troca o OBJETO (G.estado = m), e isso acontece
    // várias vezes por segundo. Então não dá para comparar a identidade do objeto: o
    // certo é reler o estado de agora e repetir as guardas que importam, porque na
    // espera a conta pode ter entrado no Labirinto ou saído da praça.
    const A = G.estado;
    if (!A || A.local === 'lab' || !A.ativoId) return;
    if (A.local !== 'hunt' && A.local !== 'praca') return;
    if (A.travaSaidaAte && A.travaSaidaAte > Date.now()) return;

    const elegiveis = cfg.hunts.filter((h) => ilhaPorSlug[h.slug] !== 'halloween');
    const sug = sugerida(elegiveis);
    if (!sug || !sug.slug) return;
    if (CFG.soTranquilas && sug.perigo > 0) return;       // nada de área que mata o Digimon

    // Na praça/Hospital o Tamer não está caçando: E.huntSlug é só a ÚLTIMA área, que
    // o jogo guarda (app.js:3709-3710). Então aqui não existe "já estou na melhor" —
    // comparar com huntSlug era o que prendia a conta no Hospital quando a última
    // hunt por acaso já era a recomendada. Fora da praça, a comparação vale.
    const naPraca = A.local === 'praca';
    if (!naPraca) {
      if (sug.slug === A.huntSlug) return;                // já estamos na melhor

      // Só troca se valer a pena: evita ficar pulando por 1% de XP. Não se aplica à
      // praça, onde o ganho é sair da parada para qualquer hunt.
      if (CFG.ganhoMin > 0) {
        const atual = cfg.hunts.find((h) => h.slug === A.huntSlug);
        const agora = (atual && atual.xpH) || 0;
        if (agora > 0 && (sug.xpH || 0) < agora * (1 + CFG.ganhoMin / 100)) return;
      }
    }

    if (!G.enviar('hunt.select', { slug: sug.slug })) return;
    ultimaTroca = Date.now();
    G.log(naPraca
      ? 'hunt: estava parado no Hospital/praça; voltei a caçar em ' + sug.slug + ' (' + sug.nome + ')'
      : 'hunt: troquei de ' + (A.huntSlug || '—') + ' para ' + sug.slug + ' (' + sug.nome + ', perigo ' + sug.perigo + ', ' + Math.round(sug.xpH || 0) + ' xp/h)');
  };
  // Parado na praça/Hospital a conta não rende nada, então não faz sentido esperar o
  // intervalo cheio (5 min por padrão) para tirá-la de lá: nesse caso reconferimos a
  // cada 30 s. Caçando, segue o intervalo que a pessoa escolheu.
  const proximo = () => (G.estado && G.estado.local === 'praca' ? Math.min(30000, CFG.intervaloMs) : CFG.intervaloMs);
  // Reagenda só DEPOIS que o passo termina (ele agora espera a resposta do servidor),
  // para não haver duas voltas sobrepostas.
  const laco = async () => {
    try { await passo(); } catch (e) { G.log('hunt: passo falhou', e); }
    setTimeout(laco, proximo());
  };
  G.quando(() => setTimeout(laco, 20000));
})();`));
}

// ---------------------------------------------------------------- auto scan
// Clica o scan nos corpos caídos. Com VIP o jogo já faz isso sozinho
// (auto.scannerCaptura, app.js:2011); sem VIP o clique é manual, e é esse que
// automatizamos aqui.
//
// Conferido no cliente:
//   - O clique manual é lancar() (app.js:2782): enviar('ball.throw', { corpo, scanner }).
//   - Os corpos vêm da cena: campo.inimigos com i.corpo, e só valem quando
//     campo.tipo === 'hunt' && !campo.arena?.lab (app.js:2795) — ou seja, no
//     Labirinto não há scan de corpo.
//   - "Uma tentativa por corpo" (app.js:2823): insistir no mesmo corpo é desperdício,
//     então guardamos os já tentados.
//   - O corpo dura ~30 s (corpoAte/30000, app.js:2827).
//
// Esta ferramenta NÃO precisa da cena, e isso importa: o Modo Economia
// (cliente.economia, app.js:3018) e a aba em segundo plano (aba.oculta, app.js:492)
// fazem o servidor parar de mandar 'campo' — e no DesDeck as contas ficam ocultas.
// Ligar a cena só para escanear custaria rede e CPU em todas as contas.
//
// A saída é que os eventos 'batalha' continuam chegando com a cena desligada, e cada
// evento com morto:true traz em 'para' o id do inimigo que caiu — o mesmo id que a
// lista de caídos usaria. Então escaneamos no instante da morte, em vez de varrer a
// cena 5x/s. Medido em conta real (MS1, Modo Economia ligado): 26 mortes → 25 scans
// → 3 capturas, sem um único 'campo' recebido e sem erro do servidor.
//
// 'para' vale 'a' quando quem morreu foi o nosso Digimon; só número é corpo de inimigo.
function codeScan(cfg) {
  return isolar(comCfg('scan', {
    scanners: Array.isArray(cfg.scanners) && cfg.scanners.length ? cfg.scanners : ['scanner-basico'],
    soSemVip: cfg.soSemVip !== false,
    maxPorMin: Math.max(0, cfg.maxPorMin || 0),
  }, `
(() => {
  const tentados = new Set();   // uma tentativa por corpo (app.js:2823)
  let ordem = [];               // para limpar os ids antigos sem crescer sem fim
  let avisouVip = false, avisouSemScanner = 0;
  let janela = Date.now(), noMinuto = 0, lancados = 0;

  const aoMorrer = (id) => {
    const E = G.estado;
    if (!E || CFG.__off) return;

    // Com VIP o jogo escaneia sozinho (app.js:2011); agir junto gastaria em dobro.
    if (CFG.soSemVip && E.vipAte > Date.now()) {
      if (!avisouVip) { avisouVip = true; G.log('scan: esta conta tem VIP, o jogo já escaneia sozinho. Nada a fazer.'); }
      return;
    }
    // Só em hunt: no Labirinto não existe scan de corpo (app.js:2795), e na cidade
    // não há corpo nenhum.
    if (E.local !== 'hunt') return;
    if (G.campo && G.campo.arena && G.campo.arena.lab) return;

    if (tentados.has(id)) return;

    // Teto opcional por minuto, para quem quer segurar o gasto de scanner.
    if (CFG.maxPorMin > 0) {
      if (Date.now() - janela >= 60000) { janela = Date.now(); noMinuto = 0; }
      if (noMinuto >= CFG.maxPorMin) return;
    }

    // O primeiro scanner da ordem escolhida que a conta realmente tem.
    const scanner = CFG.scanners.find((s) => (E.itens || {})[s] > 0);
    if (!scanner) {
      if (Date.now() - avisouSemScanner > 300000) { avisouSemScanner = Date.now(); G.log('scan: sem scanners na mochila dos escolhidos.'); }
      return;
    }

    tentados.add(id);
    ordem.push(id);
    if (ordem.length > 500) { for (const velho of ordem.splice(0, 250)) tentados.delete(velho); }

    if (!G.enviar('ball.throw', { corpo: id, scanner })) return;
    noMinuto++;
    if (++lancados % 25 === 0) G.log('scan: ' + lancados + ' scans lançados (último: ' + scanner + ')');
  };

  G.quando(() => G.aoMorrer.push(aoMorrer));
})();`));
}

// ---------------------------------------------------------------- venda de ovos
const TIERS = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

function codeEggs(cfg) {
  const vender = Array.isArray(cfg.tiers) ? cfg.tiers : ['D', 'C', 'B', 'A'];
  return isolar(comCfg('eggs', {
    tiers: vender,
    potencias: Array.isArray(cfg.potencias) ? cfg.potencias : [1, 2, 3],
    shiny: !!cfg.shiny,
    comEnergia: !!cfg.comEnergia,
    protegido: !!cfg.protegido,
    semTier: !!cfg.semTier,
    intervaloMs: Math.max(1, cfg.intervaloMin || 10) * 60000,
  }, `
(async () => {
  // O tier do ovo sai do módulo do próprio jogo (js/ovo-tier.js), alimentado pelos
  // catálogos públicos. Nada é recalculado aqui: a letra é a mesma que a Incubadora mostra.
  let letraOvo = null;
  try {
    const [especies, itens] = await Promise.all(
      ['especies', 'itens'].map((a) => fetch('/shared/' + a + '.json?v=1', { credentials: 'same-origin' }).then((r) => r.json())));
    const porId = new Map(especies.map((e) => [e.id, e]));
    const cat = { especie: (id) => porId.get(id), itens };
    let mod = null;
    for (const u of ['/js/ovo-tier.js?v=4', '/js/ovo-tier.js']) {
      try { mod = await import(u); break; } catch (e) { /* versão mudou: tenta a próxima */ }
    }
    if (!mod) throw new Error('ovo-tier.js não carregou');
    letraOvo = mod.criarTierOvo(cat).letraOvo;
  } catch (e) { G.log('ovos: não deu para calcular o tier (' + e.message + '). Por segurança, nada será vendido.'); return; }

  const podeVender = (o) => {
    if (o.travado) return false;                                   // cadeado nunca vende
    if (o.shiny && !CFG.shiny) return false;
    if (o.data && !CFG.comEnergia) return false;                   // +1 a +5
    if (o.protegido && !CFG.protegido) return false;
    if (o.potencia && !CFG.potencias.includes(o.potencia)) return false;
    const t = letraOvo(o);
    if (!t || t === '?') return CFG.semTier;                       // sem sorteio: só se a pessoa pediu
    return CFG.tiers.includes(t);
  };

  const passo = () => {
    if (CFG.__off) return;
    const bolsa = G.ovos;
    if (!Array.isArray(bolsa) || !bolsa.length) return;
    const alvo = bolsa.filter(podeVender);
    if (!alvo.length) return;
    // Em lotes: a mensagem do servidor tem limite de tamanho.
    const ids = alvo.map((o) => o.id);
    for (let k = 0; k < ids.length; k += 200) G.enviar('ovo.vender', { ids: ids.slice(k, k + 200) });
    G.log('ovos: vendeu ' + ids.length + ' (tiers ' + CFG.tiers.join('/') + ')');
  };
  const laco = () => { try { passo(); } finally { setTimeout(laco, CFG.intervaloMs); } };
  G.quando(() => setTimeout(laco, 15000));
})();`));
}

// ---------------------------------------------------------------- catálogo
const TOOLS = [
  {
    id: 'refill',
    name: 'Auto Refill',
    icon: 'layers',
    desc: 'Compra na Loja quando um item chega ao mínimo e repõe até o máximo.',
    defaults: () => ({
      regras: [{ item: 'scanner-ultra', min: 50, max: 300 }],
      reservaBits: 0,
      parcial: true,
      intervaloSec: 15,
    }),
    code: codeRefill,
    summary: (c) => {
      const n = (c.regras || []).length;
      return n ? `${n} item(ns) · confere a cada ${c.intervaloSec || 15}s` : 'sem regras';
    },
  },
  {
    id: 'hunt',
    name: 'Auto Melhor Hunt',
    icon: 'move',
    desc: 'Confere a hunt recomendada do Mapa e troca se não estivermos nela. Também tira a conta do Hospital quando ela fica parada lá. Nunca troca durante o Labirinto da Guild.',
    defaults: () => ({
      intervaloMin: 5,
      soTranquilas: true,
      ganhoMin: 0,
    }),
    code: codeHunt,
    summary: (c) => `confere a cada ${c.intervaloMin || 5} min${c.soTranquilas !== false ? ' · só áreas tranquilas' : ''}${c.ganhoMin > 0 ? ` · ganho mín. ${c.ganhoMin}%` : ''}`,
  },
  {
    id: 'scan',
    name: 'Auto Scan',
    icon: 'power',
    desc: 'Escaneia os Digimon no instante em que caem. Para contas sem VIP, que precisam clicar à mão. Funciona com a cena desligada.',
    defaults: () => ({
      scanners: ['scanner-basico'],
      maxPorMin: 0,
      soSemVip: true,
    }),
    code: codeScan,
    summary: (c) => `${(c.scanners || []).length || 0} scanner(es)${c.maxPorMin > 0 ? ` · até ${c.maxPorMin}/min` : ''}${c.soSemVip !== false ? ' · só sem VIP' : ' · sempre'}`,
  },
  {
    id: 'eggs',
    name: 'Vender ovos',
    icon: 'swap',
    desc: 'De tempos em tempos vende os ovos da bolsa que passam no filtro. Ovos travados nunca são vendidos.',
    defaults: () => ({
      tiers: ['D', 'C', 'B', 'A'], // S, SS e SSS ficam de fora de fábrica
      potencias: [1, 2, 3],
      shiny: false,
      comEnergia: false,
      protegido: false,
      semTier: false,
      intervaloMin: 10,
    }),
    code: codeEggs,
    summary: (c) => `tiers ${(c.tiers || []).join('/') || '—'} · a cada ${c.intervaloMin || 10} min`,
  },
];

const toolById = (id) => TOOLS.find((t) => t.id === id);

// Desligar uma ferramenta numa conta que já está aberta, sem recarregar. O laço dela
// continua existindo (não há como cancelar um setTimeout de fora), mas desiste a cada
// passo. Religar depois é só aplicar a config de novo, que limpa o __off.
const offCode = (id) => `(() => { window.__ddGame && window.__ddGame.desligar(${JSON.stringify(id)}); })();`;

window.DDTools = { TOOLS, toolById, REFILL_ITENS, TIERS, offCode };
