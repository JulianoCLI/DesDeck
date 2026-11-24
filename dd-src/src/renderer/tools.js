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
    // O lobby do Labirinto da Guild: pacote 'lab', resposta de 'lab.info'.
    // aoLabMudou: chamados quando o servidor avisa 'lab.mudou'.
    lab: null, aoLabMudou: [],
    // aoEstado: chamados a CADA pacote 'estado' (várias vezes por segundo).
    // 'espera'/quando() dispara uma vez só, no primeiro estado — não serve para
    // quem precisa acompanhar mudanças, como a memória da última hunt.
    espera: [], aoMorrer: [], aoEstado: [],
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
    // --- Disfarce de tempo ---
    // Várias contas sobem juntas e todas usam o mesmo intervalo configurado. Sem
    // espalhar, elas mandam o mesmo comando no mesmo segundo, repetidamente — um
    // padrão que nenhum jogador produz.
    //
    // São dois componentes, e os dois são necessários:
    //   - base: deslocamento FIXO desta conta (semeado na identidade da conta, que
    //     o servidor manda no 'welcome'/'estado'). É o que impede que as contas
    //     fiquem em fase; só aleatório não resolve, porque a cada volta elas se
    //     reaproximariam e, no agregado, voltariam a coincidir.
    //   - sorteio: ruído por volta, para o intervalo não ser um relógio exato.
    semente(id) {
      const s = String((this.estado && (this.estado.contaId || this.estado.nick)) || location.host) + ':' + id;
      let h = 0;
      for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      return (h % 1000) / 1000;
    },
    jitter(id, baseMs) {
      const spread = Math.max(1500, Math.min(45000, Math.round(baseMs * 0.25)));
      return Math.round(spread * this.semente(id)) + Math.round(Math.random() * spread);
    },
    // Pausa curta antes de um comando, para duas contas não o mandarem juntas.
    respirar(maxMs) {
      const ms = 250 + Math.round(Math.random() * Math.max(0, (maxMs || 4000) - 250));
      return new Promise((r) => setTimeout(r, ms));
    },
  };
  const adotar = (ws) => {
    if (!ws || G.sock === ws) return;
    G.sock = ws;
    // addEventListener é um canal à parte: o onmessage do jogo continua intacto.
    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return; // pacote ainda comprimido: não é o nosso
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (!m) return;
      if (m.t === 'estado') {
        G.estado = m;
        for (const fn of G.aoEstado) { try { fn(m); } catch (e) { console.error(e); } }
        if (!G.pronto) { G.pronto = true; G.espera.splice(0).forEach((f) => { try { f(); } catch (e) { console.error(e); } }); }
      }
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
      // O lobby do Labirinto da Guild. Conferido em conta real: o PEDIDO é
      // 'lab.info', mas a RESPOSTA vem como 't: "lab"'.
      else if (m.t === 'lab') G.lab = m;
      // O servidor só avisa que o lobby mudou; quem quiser o conteúdo novo pede
      // 'lab.info' de novo (é o que a própria tela do jogo faz).
      else if (m.t === 'lab.mudou') { for (const fn of G.aoLabMudou) { try { fn(m); } catch (e) { console.error(e); } } }
      else if (m.t === 'lab.fim') { G.lab = null; }
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
    voltarUltima: cfg.voltarUltima !== false,
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
  // A última área em que a conta estava de fato caçando: é para cá que ela volta
  // ao sair do Labirinto pelo Hospital. O gancho em G.aoEstado recebe CADA pacote
  // 'estado', então a memória é anotada mesmo que uma corrida de Labirinto comece
  // e acabe entre dois passos (o intervalo padrão é de 5 min). G.quando() não
  // serviria: ele dispara uma vez só, no primeiro estado.
  // Reinjetar a ferramenta não duplica este gancho, porque comCfg() retorna antes
  // de chegar aqui quando o laço já existe.
  let ultimaHunt = null;
  const lembrarHunt = (E) => { if (E && E.local === 'hunt' && E.huntSlug) ultimaHunt = E.huntSlug; };
  lembrarHunt(G.estado);
  G.aoEstado.push(lembrarHunt);
  // Preferimos o que vimos acontecer; se a ferramenta subiu com a conta já na
  // praça (recarga da página, app reaberto), o próprio jogo ainda guarda a última
  // área em E.huntSlug (app.js:3709-3710) — a mesma fonte que o Mapa usa para
  // marcar "você estava aqui". Com as duas, o retorno nunca fica sem destino.
  const alvoDeVolta = (E) => ultimaHunt || (E && E.huntSlug) || null;
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
    lembrarHunt(E);

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

    // Voltar à hunt original não depende da lista do servidor: o destino já é
    // conhecido. Resolver isto ANTES do pedirCfg() é o que torna o retorno
    // confiável — se 'offline.cfg' não responder (5 s de espera, servidor ocupado,
    // religação), o caminho antigo desistia e a conta passava o ciclo inteiro
    // parada no Hospital.
    if (E.local === 'praca' && CFG.voltarUltima) {
      const alvo = alvoDeVolta(E);
      if (alvo) {
        // Um grupo que faz Labirinto junto cai no Hospital junto. Sem este
        // respiro, as contas mandariam hunt.select no mesmo instante.
        await G.respirar(4000);
        const B = G.estado;
        if (!B || CFG.__off || B.local !== 'praca' || !B.ativoId) return; // saiu na espera
        if (B.travaSaidaAte && B.travaSaidaAte > Date.now()) return;
        if (!G.enviar('hunt.select', { slug: alvo })) return;
        ultimaTroca = Date.now();
        G.log('hunt: estava parado no Hospital/praça; voltei para a última hunt (' + alvo + ')');
        return;
      }
      // Sem destino conhecido (conta nova, nunca caçou): cai para a recomendada
      // abaixo, que é melhor do que deixar a conta parada.
    }

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
  // O jitter em cima disso é o disfarce: sem ele, todas as contas abertas conferem
  // no mesmo segundo, para sempre.
  const proximo = () => {
    const base = G.estado && G.estado.local === 'praca' ? Math.min(30000, CFG.intervaloMs) : CFG.intervaloMs;
    return base + G.jitter('hunt', base);
  };
  // Reagenda só DEPOIS que o passo termina (ele agora espera a resposta do servidor),
  // para não haver duas voltas sobrepostas.
  const laco = async () => {
    try { await passo(); } catch (e) { G.log('hunt: passo falhou', e); }
    setTimeout(laco, proximo());
  };
  // A estreia também é espalhada: o boot é quando as contas mais coincidem.
  G.quando(() => setTimeout(laco, 20000 + G.jitter('hunt-inicio', 80000)));
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

// ------------------------------------------------------------- auto labirinto
// Espelho de ToolLab (src/headless/tools.js) para o modo normal (webview).
// Mantém a conta inscrita no lobby do Labirinto da Guild, para ela não perder
// uma corrida que a guild comece.
//
// Conferido em conta real (test-lab-campos.js, conta ms1):
//   - 'lab.info' PEDE o lobby; a resposta é o pacote 't: "lab"';
//   - campos de decisão: noLobby, pronto, eu, guild, run, fila, cfg.max;
//   - entrar é 'lab.entrar'.
//
// Baús do dia (lab-report.txt, lab.info cru da ms1): 'cfg.bauPorDia' é o teto
// por dia (3 na conta observada) e 'bauHoje' quantos já foram pegos. Atingido o
// teto, a corrida não dá mais baú — não vale ocupar vaga nem gastar os 25 min.
// Sem 'bauPorDia' no pacote não chutamos teto nenhum: não barramos.
//
// Começar e escolher a dificuldade são opcionais e vêm desligados. Regras
// lidas do cliente do jogo (js/guild.js, via test-lab-grep.js):
// 'lab.iniciar' sem argumento; 'lab.dificuldade' com { dif: <id> }; o botão
// Começar só existe para gerente e exige cfg.min no lobby e nenhuma corrida.
//
// O que NÃO faz: 'lab.chamar' (convida a guild inteira), 'lab.sair' e
// 'lab.voltar'.
function codeLab(cfg) {
  const difOk = ['normal', 'dificil', 'pesadelo'].includes(cfg.dificuldade) ? cfg.dificuldade : null;
  return isolar(comCfg('lab', {
    intervaloMs: Math.max(0.5, cfg.intervaloMin || 2) * 60000,
    autoStart: cfg.autoStart === true,
    startLotado: cfg.startLotado === true,
    startAposMinimo: cfg.startAposMinimo === true,
    startAposMinimoMin: Math.max(0, +cfg.startAposMinimoMin || 0),
    startSemEntrar: cfg.startSemEntrar === true,
    startSemEntrarMin: Math.max(0, +cfg.startSemEntrarMin || 0),
    dificuldade: difOk,
  }, `
(async () => {
  let ultimaEntrada = 0;
  let ultimoMotivo = null;
  let ultimoMotivoStart = null;
  let lobbyDesde = 0;      // desde quando o lobby tem o mínimo
  let ultimaMudanca = 0;   // desde quando ninguém entra nem sai
  let filaVista = null;
  let ultimoStart = 0;
  let ultimaDif = 0;
  let difInvalida = null;
  let avisouSemPermissao = false;

  // Pede o lobby e espera a resposta NOVA, como a hunt faz com offline.cfg.
  const pedirLab = async () => {
    const velho = G.lab;
    G.lab = null;
    if (!G.enviar('lab.info', {})) { G.lab = velho; return velho; }
    for (let i = 0; i < 20 && !G.lab; i++) await new Promise((r) => setTimeout(r, 250));
    if (!G.lab) G.lab = velho;
    return G.lab;
  };

  // Por que não entraríamos agora. null = pode entrar.
  const motivoParaNaoEntrar = (L, E) => {
    if (!L) return 'o servidor não respondeu o lobby';
    if (L.guild === false) return 'a conta não está numa guild';
    if (!L.pronto) return 'o mapa do Labirinto não está instalado no servidor';
    if (L.noLobby) return null;                 // já estamos: nada a fazer
    const bauMax = Number(L.cfg && L.cfg.bauPorDia) || 0;
    const bauFeitos = Number(L.bauHoje) || 0;
    // Só barra com o teto vindo do servidor; sem ele não dá para saber.
    if (bauMax > 0 && bauFeitos >= bauMax) return 'os baús de hoje já acabaram (' + bauFeitos + '/' + bauMax + ') — a corrida não daria recompensa';
    if (!L.eu) return 'sem Digimon na equipe que possa lutar';
    if (L.run && !L.run.acabou) return 'uma corrida está em andamento (o lobby reabre quando ela acabar)';
    const max = (L.cfg && L.cfg.max) || 0;
    if (max && Array.isArray(L.fila) && L.fila.length >= max) return 'o lobby está cheio (' + L.fila.length + '/' + max + ')';
    if (E && E.local === 'lab') return 'a conta já está dentro do Labirinto';
    return null;
  };

  // Acompanha o lobby para os gatilhos de tempo.
  const observarLobby = (L) => {
    if (!L || !Array.isArray(L.fila)) return;
    const n = L.fila.length;
    const min = Number(L.cfg && L.cfg.min) || 0;
    const agora = Date.now();
    if (filaVista === null || n !== filaVista) { filaVista = n; ultimaMudanca = agora; }
    if (min && n < min) lobbyDesde = 0;
    else if (min && n >= min && !lobbyDesde) lobbyDesde = agora;
    if (L.run && !L.run.acabou) { lobbyDesde = 0; ultimaMudanca = agora; }
  };

  // Por que NAO comecariamos agora. null = pode comecar.
  // Mesmas guardas do botao '#lab-comecar' do jogo.
  const motivoParaNaoComecar = (L) => {
    if (!CFG.autoStart) return 'o início automático está desligado';
    if (!L) return 'o servidor não respondeu o lobby';
    if (!L.gerente) return 'esta conta não é dono nem sub-dono da guild';
    if (!L.pronto) return 'o mapa do Labirinto não está instalado no servidor';
    if (L.run && !L.run.acabou) return 'uma corrida já está em andamento';
    if (!L.noLobby) return 'a conta ainda não está no lobby';
    // Sem baú a corrida não rende nada: não puxa a guild para 25 min a troco de nada.
    const bauMax = Number(L.cfg && L.cfg.bauPorDia) || 0;
    const bauFeitos = Number(L.bauHoje) || 0;
    if (bauMax > 0 && bauFeitos >= bauMax) return 'os baús de hoje já acabaram (' + bauFeitos + '/' + bauMax + ')';
    const fila = Array.isArray(L.fila) ? L.fila.length : 0;
    const min = Number(L.cfg && L.cfg.min) || 0;
    const max = Number(L.cfg && L.cfg.max) || 0;
    if (min && fila < min) return 'faltam ' + (min - fila) + ' para o mínimo de ' + min;

    const agora = Date.now();
    const motivos = [];
    if (CFG.startLotado && max && fila >= max) return null;
    if (CFG.startLotado) motivos.push('lobby em ' + fila + '/' + max);
    if (CFG.startAposMinimo && CFG.startAposMinimoMin > 0) {
      const alvo = CFG.startAposMinimoMin * 60000;
      if (lobbyDesde && agora - lobbyDesde >= alvo) return null;
      const falta = lobbyDesde ? Math.ceil((alvo - (agora - lobbyDesde)) / 60000) : CFG.startAposMinimoMin;
      motivos.push('faltam ~' + falta + ' min desde o mínimo');
    }
    if (CFG.startSemEntrar && CFG.startSemEntrarMin > 0) {
      const alvo = CFG.startSemEntrarMin * 60000;
      if (ultimaMudanca && agora - ultimaMudanca >= alvo) return null;
      const falta = ultimaMudanca ? Math.ceil((alvo - (agora - ultimaMudanca)) / 60000) : CFG.startSemEntrarMin;
      motivos.push('faltam ~' + falta + ' min sem ninguém entrar');
    }
    if (!motivos.length) return 'nenhum gatilho de início está configurado';
    return 'nenhum gatilho bateu (' + motivos.join('; ') + ')';
  };

  const ajustarDificuldade = async (L) => {
    if (!CFG.dificuldade || !L || !L.gerente) return;
    if (L.run && !L.run.acabou) return;
    if (L.dif === CFG.dificuldade) return;
    const difs = (L.cfg && Array.isArray(L.cfg.dificuldades)) ? L.cfg.dificuldades : null;
    if (difs && !difs.some((d) => d && d.id === CFG.dificuldade)) {
      if (difInvalida !== CFG.dificuldade) {
        difInvalida = CFG.dificuldade;
        G.log('labirinto: dificuldade "' + CFG.dificuldade + '" não existe neste servidor');
      }
      return;
    }
    if (Date.now() - ultimaDif < 30000) return;
    if (!G.enviar('lab.dificuldade', { dif: CFG.dificuldade })) return;
    ultimaDif = Date.now();
    G.log('labirinto: dificuldade do grupo: ' + (L.dif || '?') + ' -> ' + CFG.dificuldade);
  };

  // A parte opcional de líder: dificuldade e start.
  const cuidarDoStart = async (L) => {
    if (!CFG.autoStart && !CFG.dificuldade) return;
    if (!L.gerente) {
      if (!avisouSemPermissao) {
        avisouSemPermissao = true;
        G.log('labirinto: início/dificuldade automáticos ignorados: a conta não é dono nem sub-dono');
      }
      return;
    }
    avisouSemPermissao = false;
    await ajustarDificuldade(L);
    if (!CFG.autoStart || CFG.__off) return;

    const motivo = motivoParaNaoComecar(L);
    if (motivo) {
      if (ultimoMotivoStart !== motivo) { ultimoMotivoStart = motivo; G.log('labirinto: não comecei: ' + motivo); }
      return;
    }
    ultimoMotivoStart = null;
    if (Date.now() - ultimoStart < 60000) return;
    // Deixa o servidor aplicar a dificuldade antes de começar.
    if (CFG.dificuldade && L.dif !== CFG.dificuldade && Date.now() - ultimaDif < 10000) return;

    await G.respirar(3000);
    if (CFG.__off) return;
    const L2 = G.lab || L;
    if (L2.run && !L2.run.acabou) return;
    if (motivoParaNaoComecar(L2)) return;

    if (!G.enviar('lab.iniciar', {})) return;
    ultimoStart = Date.now();
    const n = Array.isArray(L2.fila) ? L2.fila.length : '?';
    G.log('labirinto: comecei o Labirinto com ' + n + ' Tamers (dificuldade ' + (L2.dif || '?') + ')');
  };

  const passo = async () => {
    if (CFG.__off) return;
    const E = G.estado;
    if (!E) return;
    if (E.local === 'lab') return;              // já jogando: não há lobby a entrar
    // Respiro depois de entrar: o servidor pode não ter devolvido noLobby ainda.
    if (Date.now() - ultimaEntrada < 30000) return;

    const L = await pedirLab();
    if (!L || CFG.__off) return;
    // Os gatilhos de tempo medem o lobby: o relógio corre mesmo já inscritos.
    observarLobby(L);
    if (L.noLobby) { ultimoMotivo = null; await cuidarDoStart(L); return; }

    const motivo = motivoParaNaoEntrar(L, G.estado);
    if (motivo) {
      if (ultimoMotivo !== motivo) { ultimoMotivo = motivo; G.log('labirinto: não entrei no lobby: ' + motivo); }
      return;
    }
    ultimoMotivo = null;

    // A guild inteira reage ao mesmo 'lab.mudou': sem este respiro as contas
    // mandariam lab.entrar no mesmo instante.
    await G.respirar(5000);
    if (CFG.__off) return;
    // Relê: na espera a corrida pode ter começado ou o lobby enchido.
    const L2 = G.lab || L;
    if (L2.noLobby || motivoParaNaoEntrar(L2, G.estado)) return;

    if (!G.enviar('lab.entrar', {})) return;
    ultimaEntrada = Date.now();
    const n = Array.isArray(L.fila) ? L.fila.length : '?';
    const max = (L.cfg && L.cfg.max) || '?';
    G.log('labirinto: entrei no lobby (' + n + '/' + max + ' antes de mim)');
  };

  const seguro = async () => { try { await passo(); } catch (e) { G.log('labirinto: passo falhou', e); } };
  const laco = async () => { await seguro(); setTimeout(laco, CFG.intervaloMs + G.jitter('lab', CFG.intervaloMs)); };

  // Reagir ao aviso do servidor é o que torna a inscrição rápida sem precisar de
  // um intervalo curto batendo no servidor a cada volta.
  G.aoLabMudou.push(() => {
    if (CFG.__off) return;
    G.respirar(6000).then(() => { if (!CFG.__off) seguro(); });
  });
  // A estreia é espalhada: o boot é quando as contas mais coincidem.
  G.quando(() => setTimeout(laco, 25000 + G.jitter('lab-inicio', 80000)));
})();`));
}

// ----------------------------------------------------------------- auto passe
// Espelho de ToolPasse (src/headless/tools.js) para o modo normal (webview).
// Resgata o Passe de Batalha todo dia, porque perder UM dia zera a trilha de
// 30 dias e leva embora os baús (dias 7/14/21/28) e o Lendário (dia 30).
//
// Conferido no cliente do jogo (js/menus.js, abrirPasse) e em 4 contas reais:
//   - o passe NÃO tem pacote próprio: vem em estado.passe;
//   - resgatar é enviar('passe.resgatar') sem argumentos;
//   - 'pode' é o que liga o botão; abaixo de passe.nivel ele fica desabilitado;
//   - 'premiumPend' são os dias de Premium atrasado -> enviar('passe.premium').
//
// O reset é à meia-noite de Brasília, mas não calculamos nada: 'pode' já é a
// palavra do servidor. Nunca compra o Premium (50 DCoin é decisão do jogador).
function codePasse(cfg) {
  return isolar(comCfg('passe', {
    intervaloMs: Math.max(1, cfg.intervaloMin || 10) * 60000,
    premiumAtrasado: cfg.premiumAtrasado !== false,
  }, `
(async () => {
  let ultimoResgate = 0;
  let ultimoMotivo = null;

  // Por que não resgataríamos agora. null = pode.
  const motivoParaNaoResgatar = (P, E) => {
    if (!P) return 'o estado ainda não trouxe o passe';
    if (!P.pode) return 'o dia de hoje já foi resgatado';
    const min = P.nivel || 0;
    if (E && min && E.nivel < min) return 'o passe libera no nível ' + min + ' (a conta está no ' + E.nivel + ')';
    return null;
  };

  // Dias de Premium atrasado, só se a conta TEM Premium.
  const premiumPendente = (P) => {
    if (!CFG.premiumAtrasado) return [];
    if (!P || !P.premium) return [];
    return Array.isArray(P.premiumPend) ? P.premiumPend : [];
  };

  const resgatarPremium = async (P) => {
    const pend = premiumPendente(P);
    if (!pend.length) return;
    await G.respirar(5000);
    if (CFG.__off) return;
    if (!G.enviar('passe.premium', {})) return;
    G.log('passe: resgatei o Premium atrasado de ' + pend.length + ' dia(s): ' + pend.join(', '));
  };

  const passo = async () => {
    if (CFG.__off) return;
    const E = G.estado;
    if (!E) return;
    const P = E.passe;

    // Respiro depois de resgatar: o 'estado' pode não ter trazido o 'pode' novo.
    if (Date.now() - ultimoResgate < 60000) return;

    const motivo = motivoParaNaoResgatar(P, E);
    if (motivo) {
      if (ultimoMotivo !== motivo) { ultimoMotivo = motivo; G.log('passe: ' + motivo); }
      await resgatarPremium(P);   // pode haver Premium atrasado mesmo sem resgate do dia
      return;
    }
    ultimoMotivo = null;

    // Todas as contas viram o dia no mesmo instante: sem respiro elas mandariam
    // o comando no mesmo segundo.
    await G.respirar(8000);
    if (CFG.__off) return;
    const P2 = (G.estado && G.estado.passe) || P;
    if (motivoParaNaoResgatar(P2, G.estado)) return;

    if (!G.enviar('passe.resgatar', {})) return;
    ultimoResgate = Date.now();
    G.log('passe: resgatei o Dia ' + P2.dia + ' (' + (P2.feitos + 1) + '/30 na trilha)');

    // Com Premium, o resgate do dia já traz os dois; isto é só para o atrasado.
    await resgatarPremium(G.estado && G.estado.passe);
  };

  const seguro = async () => { try { await passo(); } catch (e) { G.log('passe: passo falhou', e); } };
  const laco = async () => { await seguro(); setTimeout(laco, CFG.intervaloMs + G.jitter('passe', CFG.intervaloMs)); };
  G.quando(() => setTimeout(laco, 40000 + G.jitter('passe-inicio', 80000)));
})();`));
}

// ---------------------------------------------------------------- auto sniper
// Varre o Mercado procurando o que está abaixo do teto que a pessoa definiu e
// compra. O nome "sniper" é literal: a graça não é comprar, é comprar PRIMEIRO.
//
// O protocolo foi levantado do cliente (test-mercado-grep.js) e conferido em
// conta real (test-mercado-campos.js, test-mercado-filtros.js, test-sniper-real.js):
//
//   - pedir:    enviar('mercado.listar', { tipo, moeda, precoMax, tiers,
//               potencias, maisMin, especie, ordem, pagina })  (menus2.js:403-409)
//   - RESPOSTA: pacote 't: "mercado"' (menus2.js:941), com { lista, total, agora }
//   - comprar:  enviar('mercado.comprar', { id, qtd, preco, moeda }) (menus2.js:474)
//   - push:     't: "mercado.mudou"' quando alguém vende/compra/expira (menus2.js:952)
//
// A RETENÇÃO é o coração desta ferramenta. Todo anúncio nasce retido e só pode ser
// comprado depois de `libera` — "todo anúncio espera 2 min antes de poder ser
// comprado" (menus2.js:677). Medido em conta real: libera - criado = 119.993 ms.
// Então a pechincha não é perdida por estar retida: ela é uma CORRIDA marcada para
// um instante conhecido. É por isso que existe uma fila — achar o anúncio é fácil,
// chegar primeiro no segundo do libera é o que importa.
//
// Três decisões que vale registrar:
//
//   1. NADA DE REGRA REIMPLEMENTADA. Tier, potência e energia são filtrados pelo
//      SERVIDOR, não por nós. Conferido em conta real: tiers='S,SS,SSS' levou
//      1728 anúncios para 601; potencias='4,5' para 716; maisMin=5 para 190. O
//      anúncio NÃO traz a letra do tier (só especie/ivs/u), e calculá-la exigiria
//      o catálogo do jogo — então confiamos em quem tem a regra. Mesma escolha do
//      resto do projeto.
//
//   2. POTÊNCIA NÃO É ENERGIA. 'potencias' é o P1..P5 (o "p4+" do pedido);
//      'maisMin' é o +N do ovo, que é outra coisa. Isto quase entrou trocado: um
//      pedido com maisMin=4 devolveu um ovo com potencia:1 e data:5. Trocar os
//      dois faria a ferramenta comprar justamente o que não foi pedido.
//
//   3. O RELÓGIO É O DO SERVIDOR. A resposta traz 'agora', e comparar 'libera'
//      com o Date.now() local erraria pelo desvio entre as máquinas (medido:
//      ~250-400 ms, o bastante para perder a corrida ou, pior, chegar adiantado e
//      ser recusado). Guardamos o desvio e decidimos sempre no tempo do servidor.
//
// A trava final é do próprio jogo, e é de graça: 'mercado.comprar' manda o PREÇO
// junto. Se o vendedor tiver mudado o valor, o servidor recusa em vez de cobrar o
// preço novo. Ou seja: é impossível esta ferramenta pagar mais do que viu.
// Os itens que o Mercado realmente negocia, com o nome que o jogo usa.
//
// Por que uma tabela colada aqui, e não o itens.json: a tela de ajustes roda sob
// `connect-src 'none'` (index.html), então ela não busca nada da rede. E não daria
// no mesmo: o itens.json tem ~110 itens, e o Mercado negocia 45. Poção, Revive e
// comida não têm anúncio nenhum — oferecer "Small Potion" aqui seria um alvo que
// nunca acha nada, e isso é indistinguível de ferramenta quebrada.
//
// A lista veio do comando 'mercado.itens' numa conta real (os 45 com estoque) e os
// nomes do itens.json do jogo, casados id a id — nenhum rótulo foi inventado.
// Se o jogo passar a negociar outro item, ele aparece no 'mercado.itens' e entra
// aqui; o campo de id avulso abaixo cobre o caso enquanto isso.
const MERCADO_ITENS = [
  { id: 'chip-darkness', nome: 'Chip de Trevas' },
  { id: 'chip-earth', nome: 'Chip de Terra' },
  { id: 'chip-fire', nome: 'Chip de Fogo' },
  { id: 'chip-ice', nome: 'Chip de Gelo' },
  { id: 'chip-light', nome: 'Chip de Luz' },
  { id: 'chip-physical', nome: 'Chip de Físico' },
  { id: 'chip-steel', nome: 'Chip de Aço' },
  { id: 'chip-thunder', nome: 'Chip de Trovão' },
  { id: 'chip-water', nome: 'Chip de Água' },
  { id: 'chip-wind', nome: 'Chip de Vento' },
  { id: 'chip-wood', nome: 'Chip de Planta' },
  { id: 'data-aquatic-instavel', nome: 'Energia de Ovo Aquatic Instável' },
  { id: 'data-aquatic-pura', nome: 'Energia de Ovo Aquatic Pura' },
  { id: 'data-aquatic-refinada', nome: 'Energia de Ovo Aquatic Refinada' },
  { id: 'data-beast-instavel', nome: 'Energia de Ovo Beast Instável' },
  { id: 'data-beast-pura', nome: 'Energia de Ovo Beast Pura' },
  { id: 'data-beast-refinada', nome: 'Energia de Ovo Beast Refinada' },
  { id: 'data-bird-instavel', nome: 'Energia de Ovo Bird Instável' },
  { id: 'data-bird-pura', nome: 'Energia de Ovo Bird Pura' },
  { id: 'data-bird-refinada', nome: 'Energia de Ovo Bird Refinada' },
  { id: 'data-devil-instavel', nome: 'Energia de Ovo Devil Instável' },
  { id: 'data-devil-pura', nome: 'Energia de Ovo Devil Pura' },
  { id: 'data-devil-refinada', nome: 'Energia de Ovo Devil Refinada' },
  { id: 'data-dragon-instavel', nome: 'Energia de Ovo Dragon Instável' },
  { id: 'data-dragon-pura', nome: 'Energia de Ovo Dragon Pura' },
  { id: 'data-dragon-refinada', nome: 'Energia de Ovo Dragon Refinada' },
  { id: 'data-insectoid-instavel', nome: 'Energia de Ovo Insectoid Instável' },
  { id: 'data-insectoid-pura', nome: 'Energia de Ovo Insectoid Pura' },
  { id: 'data-insectoid-refinada', nome: 'Energia de Ovo Insectoid Refinada' },
  { id: 'data-plant-instavel', nome: 'Energia de Ovo Plant Instável' },
  { id: 'data-plant-pura', nome: 'Energia de Ovo Plant Pura' },
  { id: 'data-plant-refinada', nome: 'Energia de Ovo Plant Refinada' },
  { id: 'data-rock-instavel', nome: 'Energia de Ovo Rock Instável' },
  { id: 'data-rock-pura', nome: 'Energia de Ovo Rock Pura' },
  { id: 'data-rock-refinada', nome: 'Energia de Ovo Rock Refinada' },
  { id: 'evoluter', nome: 'Evoluter' },
  { id: 'fragmento-bike', nome: 'Fragmento de Speed' },
  { id: 'fragmento-chave', nome: 'Fragmento de Chave' },
  { id: 'fragmento-nucleo', nome: 'Fragmento de Núcleo' },
  { id: 'fragmento-ovo-shiny', nome: 'Fragmento de Ovo UX' },
  { id: 'fragmento-shiny', nome: 'Fragmento UX' },
  { id: 'fragmento-zmove', nome: 'Fragmento de D-Skill' },
  { id: 'peca-aoe', nome: 'Peça de Chip AoE' },
  { id: 'safari-ticket', nome: 'Ticket Digital World' },
  { id: 'token-boss', nome: 'Boss Token' },
];

/**
 * Acha o item pelo que a pessoa escreveu: id exato, nome exato ou pedaço do nome.
 * Devolve o item, ou null se não houver UM só candidato — "chip" casa com onze, e
 * escolher o primeiro compraria o Chip de Trevas para quem queria o de Fogo.
 */
function acharItem(texto) {
  const q = String(texto || '').trim().toLowerCase();
  if (!q) return null;
  const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const exato = MERCADO_ITENS.find((i) => i.id === q || i.nome.toLowerCase() === q || semAcento(i.nome) === semAcento(q));
  if (exato) return exato;
  const parciais = MERCADO_ITENS.filter((i) => semAcento(i.nome).includes(semAcento(q)) || i.id.includes(q));
  return parciais.length === 1 ? parciais[0] : null;
}

/**
 * Um alvo guarda DOIS tetos, um por moeda: tetoBits e tetoGemas. Teto 0 (ou
 * ausente) significa "não compre nesta moeda" — então um alvo com só tetoBits
 * nunca gasta D-Dol, e é assim que se diz "isto eu quero, mas só em bits".
 *
 * Aqui esse alvo é aberto numa busca POR MOEDA. Cada busca é o formato antigo
 * ({ moeda, tetoPreco }), então todo o resto da ferramenta — filtro, fila,
 * compra, reserva — segue igual, sem saber que a tela mudou.
 *
 * Também aceita o formato velho (moeda + tetoPreco) para não zerar a
 * configuração de quem já tinha alvos salvos: a config é gravada em disco por
 * conta, e uma migração mal feita aqui apagaria o teto que a pessoa escolheu.
 */
const buscasDoAlvo = (a) => {
  if (!a) return [];
  const base = { ...a };
  delete base.tetoBits;
  delete base.tetoGemas;

  // Formato antigo: uma moeda só, teto único.
  if (a.tetoPreco > 0 && a.tetoBits == null && a.tetoGemas == null) {
    return [{ ...base, moeda: a.moeda || 'bits', tetoPreco: a.tetoPreco }];
  }

  const out = [];
  if (a.tetoBits > 0) out.push({ ...base, moeda: 'bits', tetoPreco: a.tetoBits });
  if (a.tetoGemas > 0) out.push({ ...base, moeda: 'gemas', tetoPreco: a.tetoGemas });
  return out;
};

/**
 * Este alvo pode ir para o ar?
 *
 * Sem nenhum teto não compra nada, e é o padrão de fábrica. Mas há um segundo
 * caso, e ele é pior porque parece configurado: alvo de ITEM sem item escolhido.
 * O pedido sairia sem 'especie', o servidor listaria TODO item do Mercado e o
 * sniper compraria qualquer coisa abaixo do teto — Boss Token, fragmento, o que
 * fosse. Um alvo pela metade não deve virar um alvo largo.
 */
const alvoValido = (a) => {
  if (!a || !buscasDoAlvo(a).length) return false;
  if ((a.tipo || 'ovo') === 'item' && !a.especie) return false;
  return true;
};

function codeSniper(cfg) {
  // O que vai para a ferramenta já são as buscas abertas por moeda: ela recebe a
  // lista no formato que sempre soube tratar.
  const alvos = (cfg.alvos || []).filter(alvoValido).flatMap(buscasDoAlvo);
  return isolar(comCfg('sniper', {
    alvos,
    intervaloSec: Math.max(20, cfg.intervaloSec || 60),
    reservaBits: Math.max(0, cfg.reservaBits || 0),
    reservaGemas: Math.max(0, cfg.reservaGemas || 0),
    maxPorHora: Math.max(0, cfg.maxPorHora || 0),
    soLiberados: !!cfg.soLiberados,
  }, `
(async () => {
  // O desvio entre o nosso relógio e o do servidor, medido a cada resposta
  // ('agora' vem no pacote). Toda decisão de tempo passa por aqui.
  let desvio = 0;
  const agoraServidor = () => Date.now() - desvio;

  // A fila: anúncios retidos que já passaram pelos filtros e estão esperando o
  // libera. Chave é o id do anúncio, para não enfileirar o mesmo duas vezes.
  const fila = new Map();
  const comprados = new Set();   // nunca tenta o mesmo anúncio duas vezes
  let compras = [];              // instantes das compras, para o limite por hora
  let listaPend = null;
  const avisouSaldo = {};        // o aviso de saldo curto sai uma vez por moeda

  // A ponte guarda a última resposta de cada pacote, mas 'mercado' não estava
  // entre os que ela escuta (ela nasceu para ovos/campo/lab). Em vez de mexer na
  // ponte, escutamos aqui: é um ouvinte a mais no mesmo socket.
  const aoMercado = [];
  if (!G.__sniperOuvindo) {
    G.__sniperOuvindo = true;
    G.aoPacote = G.aoPacote || [];
  }

  // Pede uma listagem e espera a resposta. O pacote de resposta é 'mercado'.
  const listar = (filtro) => new Promise((resolve) => {
    listaPend = resolve;
    if (!G.enviar('mercado.listar', filtro)) { listaPend = null; resolve(null); return; }
    setTimeout(() => { if (listaPend === resolve) { listaPend = null; resolve(null); } }, 8000);
  });

  // Enganchamos no socket uma vez, por fora do jogo (addEventListener, como a ponte).
  const engancha = () => {
    if (!G.sock || G.sock.__sniper) return;
    G.sock.__sniper = true;
    G.sock.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (!m) return;
      if (m.t === 'mercado') {
        if (typeof m.agora === 'number') desvio = Date.now() - m.agora;
        const r = listaPend; listaPend = null;
        if (r) r(m);
      } else if (m.t === 'mercado.mudou') {
        // O mercado mexeu: alguém vendeu, comprou ou um anúncio expirou. É o
        // momento mais provável de aparecer coisa nova, então varremos já.
        if (!CFG.__off) setTimeout(varrer, 400 + Math.random() * 800);
      }
    });
  };

  // O filtro de um alvo, no formato que o SERVIDOR entende. Campos vazios são
  // omitidos: mandar 'tiers: ""' é o mesmo que não filtrar, mas enviar o campo à
  // toa só aumenta a chance de divergir do que o jogo manda.
  const filtroDe = (a) => {
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
  };

  const saldoDe = (moeda) => {
    const E = G.estado || {};
    return moeda === 'gemas' ? (E.gemas || 0) : (E.bits || 0);
  };
  const reservaDe = (moeda) => (moeda === 'gemas' ? CFG.reservaGemas : CFG.reservaBits);

  // Dá para pagar este anúncio sem furar a reserva?
  const cabe = (a) => saldoDe(a.moeda) - reservaDe(a.moeda) >= a.preco;

  const noLimite = () => {
    if (!CFG.maxPorHora) return false;
    const corte = Date.now() - 3600000;
    compras = compras.filter((t) => t > corte);
    return compras.length >= CFG.maxPorHora;
  };

  // Comprar. Só é chamada quando o anúncio já está liberado.
  const comprar = async (a, alvo) => {
    if (CFG.__off || comprados.has(a.id)) return;
    if (noLimite()) { G.log('sniper: limite de ' + CFG.maxPorHora + ' compra(s)/hora atingido; deixando passar #' + a.id); return; }
    if (!cabe(a)) { G.log('sniper: #' + a.id + ' custa ' + a.preco + ' ' + a.moeda + ', mas a reserva não deixa'); return; }
    // Marca ANTES de enviar: se o envio falhar, melhor perder uma pechincha do
    // que arriscar comprar duas vezes.
    comprados.add(a.id);
    fila.delete(a.id);
    if (!G.enviar('mercado.comprar', { id: a.id, qtd: 1, preco: a.preco, moeda: a.moeda })) return;
    compras.push(Date.now());
    avisouSaldo[a.moeda] = false; // o saldo mudou: vale avisar de novo se faltar
    G.log('sniper: comprei #' + a.id + ' (' + (a.resumo && a.resumo.especie || a.item || a.tipo) + ') por ' + a.preco + ' ' + (a.moeda === 'gemas' ? 'D-Dol' : 'bits') + (alvo.nome ? ' [' + alvo.nome + ']' : ''));
  };

  // Agenda a compra para o instante do libera. É isto que ganha a corrida: em vez
  // de reconferir de minuto em minuto (e chegar até 60 s atrasado), acordamos no
  // milissegundo em que o anúncio fica comprável.
  //
  // A folga existe porque o servidor recusa quem chega adiantado: o desvio de
  // relógio é medido, mas não é exato, e a rede ainda cobra o seu tempo.
  const FOLGA_MS = 250;
  const agendar = (a, alvo) => {
    if (fila.has(a.id) || comprados.has(a.id)) return;
    const espera = a.libera - agoraServidor() + FOLGA_MS;
    if (espera > 15 * 60000) return; // retenção é de 2 min; isto não deveria acontecer
    const timer = setTimeout(async () => {
      fila.delete(a.id);
      if (CFG.__off) return;
      // O mundo pode ter mudado nos 2 min de espera: outro comprador levou, o
      // vendedor retirou ou mudou o preço. Então reconferimos o anúncio AGORA,
      // em vez de confiar na foto antiga.
      const m = await listar(filtroDe(alvo));
      if (!m || CFG.__off) return;
      const vivo = (m.lista || []).find((x) => x.id === a.id);
      if (!vivo) { G.log('sniper: #' + a.id + ' já não está à venda (alguém chegou antes)'); return; }
      if (vivo.preco > alvo.tetoPreco) { G.log('sniper: #' + a.id + ' subiu para ' + vivo.preco + '; acima do teto'); return; }
      if (vivo.libera > agoraServidor()) { agendar(vivo, alvo); return; } // preço mudou: retenção reiniciou
      await comprar(vivo, alvo);
    }, Math.max(0, espera));
    fila.set(a.id, timer);
    G.log('sniper: #' + a.id + ' na fila por ' + a.preco + ' ' + (a.moeda === 'gemas' ? 'D-Dol' : 'bits') + ' — libera em ' + Math.ceil((a.libera - agoraServidor()) / 1000) + 's');
  };

  // Uma passada por todos os alvos configurados.
  const varrer = async () => {
    if (CFG.__off || !G.estado) return;
    engancha();
    for (const alvo of CFG.alvos) {
      if (CFG.__off) break;
      if (noLimite()) break;
      const m = await listar(filtroDe(alvo));
      if (!m) continue;
      for (const a of m.lista || []) {
        if (comprados.has(a.id) || fila.has(a.id)) continue;
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
        if (!cabe(a)) {
          const moeda = a.moeda === 'gemas' ? 'D-Dol' : 'bits';
          if (!avisouSaldo[a.moeda]) {
            avisouSaldo[a.moeda] = true;
            G.log('sniper: achei #' + a.id + ' por ' + a.preco + ' ' + moeda + ', mas o saldo disponível é ' + (saldoDe(a.moeda) - reservaDe(a.moeda)) + ' (saldo ' + saldoDe(a.moeda) + ' menos a reserva ' + reservaDe(a.moeda) + '). Não vou comprar.');
          }
          continue;
        }
        const retido = a.libera > agoraServidor();
        if (retido) { if (!CFG.soLiberados) agendar(a, alvo); continue; }
        await comprar(a, alvo);
        if (noLimite()) break;
      }
    }
  };

  const seguro = async () => { try { await varrer(); } catch (e) { G.log('sniper: varredura falhou', e); } };
  const laco = async () => {
    await seguro();
    const base = CFG.intervaloSec * 1000;
    setTimeout(laco, base + G.jitter('sniper', base));
  };
  G.quando(() => { engancha(); setTimeout(laco, 15000 + G.jitter('sniper-inicio', 45000)); });
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
    desc: 'Confere a hunt recomendada do Mapa e troca se não estivermos nela. Tira a conta do Hospital quando ela fica parada lá — voltando para a hunt em que estava, que é o caso de quem sai do Labirinto da Guild. Nunca troca durante o Labirinto.',
    defaults: () => ({
      intervaloMin: 5,
      soTranquilas: true,
      ganhoMin: 0,
      voltarUltima: true,
    }),
    code: codeHunt,
    summary: (c) => `confere a cada ${c.intervaloMin || 5} min${c.soTranquilas !== false ? ' · só áreas tranquilas' : ''}${c.ganhoMin > 0 ? ` · ganho mín. ${c.ganhoMin}%` : ''}${c.voltarUltima !== false ? ' · volta para a última hunt' : ''}`,
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
  {
    id: 'lab',
    name: 'Auto Labirinto',
    icon: 'users',
    desc: 'Inscreve a conta no lobby do Labirinto da Guild assim que ele reabre, para não perder a corrida. Para de entrar quando os baús do dia acabam, já que a corrida não daria recompensa. Pode também escolher a dificuldade e começar sozinha, se a conta for dona ou sub-dona da guild.',
    defaults: () => ({
      intervaloMin: 2,
      // Começar e trocar a dificuldade afetam a guild inteira: desligados até
      // que o usuário peça.
      dificuldade: null,
      autoStart: false,
      startLotado: false,
      startAposMinimo: false,
      startAposMinimoMin: 10,
      startSemEntrar: false,
      startSemEntrarMin: 5,
    }),
    code: codeLab,
    summary: (c) => {
      const partes = [`confere a cada ${c.intervaloMin || 2} min`];
      if (c.dificuldade) partes.push(({ normal: 'Normal', dificil: 'Difícil', pesadelo: 'Pesadelo' })[c.dificuldade]);
      if (c.autoStart) {
        const g = [];
        if (c.startLotado) g.push('lotado');
        if (c.startAposMinimo) g.push(`${c.startAposMinimoMin || 10} min do mínimo`);
        if (c.startSemEntrar) g.push(`${c.startSemEntrarMin || 5} min parado`);
        partes.push(g.length ? `começa: ${g.join(' ou ')}` : 'começa: sem gatilho');
      }
      return partes.join(' · ');
    },
  },
  {
    id: 'passe',
    name: 'Auto Passe',
    icon: 'calendar',
    desc: 'Resgata o Passe de Batalha todo dia. Perder um dia zera a trilha de 30 dias, junto com os baús e o Lendário. Se a conta tiver Premium atrasado, resgata esse também. Nunca compra o Premium.',
    // Vem ligada de fábrica, inclusive em conta nova. É a única ferramenta
    // assim: ela não gasta nada, não muda onde a conta está nem o que ela faz,
    // e esquecer de ligá-la custa a trilha inteira de 30 dias. Desligar fica
    // gravado por conta (enabled: false), então a escolha é respeitada.
    padraoLigado: true,
    defaults: () => ({
      intervaloMin: 10,
      premiumAtrasado: true,
    }),
    code: codePasse,
    summary: (c) => `confere a cada ${c.intervaloMin || 10} min${c.premiumAtrasado !== false ? ' · pega o Premium atrasado' : ' · só o grátis'}`,
  },
  {
    id: 'sniper',
    name: 'Sniper de Mercado',
    icon: 'search',
    // Curta de propósito: na lista de ferramentas esta linha fica ao lado das
    // outras, e um parágrafo aqui desalinhava a lista toda. O detalhe (a fila
    // dos 2 min, os filtros do servidor) está na tela de configuração.
    desc: 'Compra no Mercado o que estiver abaixo do seu teto. Pega até anúncio retido, na hora em que libera.',
    defaults: () => ({
      // Nasce com um alvo de exemplo DESLIGADO na prática: os dois tetos em 0
      // não compram nada, então ligar a ferramenta sem configurar não gasta nem
      // um bit nem um D-Dol.
      alvos: [{
        nome: 'Ovo S+ barato',
        tipo: 'ovo',
        tetoBits: 0,
        tetoGemas: 0,
        tiers: ['S', 'SS', 'SSS'],
        potencias: [4, 5],
        energiaMin: 0,
        especie: '',
        familia: '',
        soShiny: false,
      }],
      intervaloSec: 60,
      reservaBits: 0,
      reservaGemas: 0,
      maxPorHora: 5,
      soLiberados: false,
    }),
    code: codeSniper,
    summary: (c) => {
      const alvos = (c.alvos || []).filter(alvoValido);
      if (!alvos.length) return 'sem alvo com teto definido · não compra nada';
      const n = alvos.length;
      // Quantas moedas estão de fato armadas, somando todos os alvos: é a
      // resposta para "ele vai mexer no meu D-Dol?".
      const buscas = alvos.flatMap(buscasDoAlvo);
      const moedas = [...new Set(buscas.map((b) => (b.moeda === 'gemas' ? 'D-Dol' : 'bits')))];
      return `${n} alvo${n > 1 ? 's' : ''} em ${moedas.join(' e ')} · varre a cada ${c.intervaloSec || 60}s${c.maxPorHora > 0 ? ` · até ${c.maxPorHora}/h` : ''}${c.soLiberados ? ' · só liberados' : ' · pega na fila'}`;
    },
  },
];

const toolById = (id) => TOOLS.find((t) => t.id === id);

// Esta ferramenta está ligada nesta conta?
//
// Sem registro, a resposta é o padrão da ferramenta: quase todas vêm desligadas,
// mas as que têm padraoLigado valem para contas que nunca passaram pela tela de
// ferramentas — inclusive as criadas depois. Só assim o "já vem ligado" alcança
// conta nova sem precisar escrever estado para cada conta no momento do cadastro.
//
// Um registro explícito sempre ganha: desligar na UI grava enabled:false, e isso
// é respeitado (não é "nunca configurado").
const toolLigada = (conf, tool) => (conf && typeof conf.enabled === 'boolean' ? conf.enabled : !!(tool && tool.padraoLigado));

// Desligar uma ferramenta numa conta que já está aberta, sem recarregar. O laço dela
// continua existindo (não há como cancelar um setTimeout de fora), mas desiste a cada
// passo. Religar depois é só aplicar a config de novo, que limpa o __off.
const offCode = (id) => `(() => { window.__ddGame && window.__ddGame.desligar(${JSON.stringify(id)}); })();`;

window.DDTools = { TOOLS, toolById, toolLigada, REFILL_ITENS, MERCADO_ITENS, acharItem, alvoValido, buscasDoAlvo, TIERS, offCode };
