'use strict';
const { tierOvo, especiePorId, carregar } = require('./catalogo');
const { retrato } = require('./sprites');

// Prepara um ovo do historico para o Painel desenhar.
//
// Existe aqui, e nao no renderer, por dois motivos medidos:
//   1. a letra D..SSS NAO vem do servidor. O campo `ovo` do pacote e o ESTAGIO
//      ("Rookie"); a letra sai de ovo-tier.js, que precisa dos catalogos do
//      jogo - e esses so sao baixaveis no processo principal (net.request).
//   2. a CSP da janela e `img-src 'self' data:`: o retrato tem que chegar ja
//      como data-URL, recortado da folha de sprites.
//
// Nunca lanca. Um ovo sem letra ou sem foto ainda e uma linha util do
// historico; um erro aqui apagaria a captura da tela.

/** O ovo cru do servidor + nome, letra e retrato. */
async function enriquecer(ovo) {
  if (!ovo) return null;

  let especies = {};
  let letra = '?';
  let notaCalc = null;
  try {
    const [esp, tier] = await Promise.all([especiePorId(), tierOvo()]);
    especies = esp;
    letra = tier.letraOvo(ovo);
    notaCalc = tier.notaOvo(ovo);
  } catch {
    // Sem catalogo da para mostrar potencia, shiny e data - so nao a letra.
  }

  const ficha = especies[ovo.especie];
  let img = null;
  try {
    if (ovo.especie) img = await retrato(ovo.especie, ficha);
  } catch { /* sprite que nao baixou nao vale uma linha a menos */ }

  return {
    especie: ovo.especie || null,
    nome: ficha ? ficha.nome : (ovo.especie || '—'),
    img,
    // A letra do card do jogo (D, C, B, A, S, SS, SSS) ou '?' quando o ovo e
    // antigo e nao tem o sorteio guardado.
    letra,
    // A nota de 0 a 10. O servidor manda a sua em `nota`; a calculada serve de
    // reserva para os ovos vindos do 'captura', que nem sempre a trazem.
    nota: ovo.nota != null ? ovo.nota : notaCalc,
    potencia: ovo.potencia || 0,
    shiny: !!ovo.shiny,
    nivel: ovo.nivel || 0,
    // UX e o scanner usado na captura; e um dos filtros pedidos no Painel.
    scanner: ovo.scanner || null,
    em: ovo.em || 0,
    // A qualidade, que e o que o +N faz subir.
    qualidade: ovo.qualidade != null ? ovo.qualidade : null,
  };
}

/**
 * A bolsa de ovos da conta, pronta para o Painel listar.
 *
 * Diferente de enriquecer(): aqui NÃO vai retrato. O retrato é por espécie e o
 * renderer já o busca no cache de sprites (canal 'sprites:retratos'); mandar um
 * data-URL por ovo foi exatamente o que inflou o estado para 24 MB.
 *
 * Os campos são os que o pacote 'ovos' realmente traz, medidos em conta real:
 * id, especie, de, estagio, familia, nivel, data, potencia, ivs, u, em. Note o
 * que NÃO vem: 'scanner' (por isso o filtro UX não existe nesta lista) nem
 * 'nota' (ela é calculada aqui). 'shiny', 'travado' e 'protegido' só aparecem
 * quando o ovo os tem.
 */
async function enriquecerBolsa(lista) {
  if (!Array.isArray(lista) || !lista.length) return [];

  let especies = {};
  let tier = null;
  try {
    const [esp, t] = await Promise.all([especiePorId(), tierOvo()]);
    especies = esp;
    tier = t;
  } catch {
    // Sem catalogo da para mostrar nome cru e potencia - so nao a letra.
  }

  const out = [];
  for (const o of lista) {
    if (!o) continue;
    const ficha = especies[o.especie];
    let letra = '?';
    let nota = null;
    if (tier) {
      try { letra = tier.letraOvo(o); nota = tier.notaOvo(o); } catch { /* ovo sem sorteio */ }
    }
    out.push({
      // O id do ovo no servidor: é a identidade estável da linha (o mesmo ovo
      // chega de novo em cada pacote 'ovos', e some quando choca ou é vendido).
      id: o.id,
      // A mesma lista mostra ovos e digimons: é isto que diz qual é qual.
      tipo: 'ovo',
      especie: o.especie || null,
      nome: ficha ? ficha.nome : (o.especie || '—'),
      letra,
      nota,
      potencia: o.potencia || 0,
      nivel: o.nivel || 0,
      // O +N de energia do ovo.
      data: o.data || 0,
      shiny: !!o.shiny,
      // Cadeado: a venda automática nunca leva um ovo travado.
      travado: !!o.travado,
      protegido: !!o.protegido,
      em: o.em || 0,
    });
  }
  return out;
}

/**
 * Os digimons que a conta tem, prontos para o Painel listar.
 *
 * As três origens, todas no mesmo formato (medido em conta real):
 *   - equipe : pacote 'estado'.equipe  (quem luta)
 *   - depot  : pacote 'depot'.lista    (o DigiBank da Babamon)
 *   - colecao: pacote 'depot'.colecao  (os marcados com ★)
 * É a mesma soma que o cliente do jogo chama de todosDigimons (app.js).
 *
 * A letra sai de 'nota', que o servidor JÁ manda calculada e na mesma escala
 * de 0 a 10 dos ovos (um wargrowlmon real veio nota 3.526, faixa "Razoável").
 * Não dá para recalcular: os digimons não trazem 'u', o sorteio de qualidade —
 * passá-los por notaOvo() devolveria null e todos ficariam com letra '?'.
 *
 * Como em enriquecerBolsa, nada de retrato: ele vem do cache por espécie.
 */
async function enriquecerDigimons({ equipe, depot, colecao } = {}) {
  const grupos = [
    ['equipe', equipe],
    ['depot', depot],
    ['colecao', colecao],
  ];
  if (!grupos.some(([, l]) => Array.isArray(l) && l.length)) return [];

  let especies = {};
  try {
    especies = await especiePorId();
  } catch {
    // Sem catalogo sobra o slug como nome - ainda e uma linha util.
  }
  const { letraDeNota } = require('./ovo-tier');

  const out = [];
  const vistos = new Set();
  for (const [grupo, lista] of grupos) {
    if (!Array.isArray(lista)) continue;
    for (const d of lista) {
      if (!d || d.id == null) continue;
      // O mesmo digimon pode aparecer em dois grupos (ele está na equipe E
      // marcado como coleção). Uma linha por bicho, e a primeira vence.
      if (vistos.has(d.id)) continue;
      vistos.add(d.id);
      const ficha = especies[d.especie];
      const nota = typeof d.nota === 'number' ? d.nota : null;
      out.push({
        id: d.id,
        tipo: 'digi',
        especie: d.especie || null,
        nome: ficha ? ficha.nome : (d.especie || '—'),
        letra: letraDeNota(nota),
        nota,
        // O rótulo da nota que o jogo mostra ("Razoável", "Mítico"…). Vem
        // pronto; é o que a dica da linha diz por extenso.
        faixa: d.faixa || null,
        potencia: d.potencia || 0,
        nivel: d.nivel || 0,
        shiny: !!d.shiny,
        // O que só o digimon tem, e é o que se olha nele.
        poder: d.poder || 0,
        hp: d.hp || 0,
        hpMax: d.hpMax || 0,
        // 'equipe' | 'depot' | 'colecao' | 'mercado'. O servidor manda em
        // 'local'; o grupo onde veio é a reserva para quando não mandar.
        local: d.local || grupo,
        // Quando foi capturado, para empatar a ordenação por data.
        em: d.capturadoEm || 0,
      });
    }
  }
  return out;
}

/**
 * O nome do que foi negociado no Mercado.
 *
 * O histórico manda slug de espécie ('agumon') ou id de item ('token-boss');
 * quem traduz é o catálogo, que só se baixa aqui. Devolve null quando não dá
 * para saber — o renderer então mostra o id cru, que ainda é melhor que nada.
 */
async function nomeDoNegocio(a) {
  if (!a) return null;
  try {
    if (a.oque === 'digimon' || a.oque === 'ovo') {
      if (!a.especie) return null;
      const esp = await especiePorId();
      return esp[a.especie] ? esp[a.especie].nome : null;
    }
    if (a.item && a.item !== 'diamantes') {
      const j = await carregar('itens');
      for (const c of Object.keys(j)) {
        if (!Array.isArray(j[c])) continue;
        for (const i of j[c]) if (i && i.id === a.item) return i.nome || null;
      }
    }
  } catch { /* sem catálogo, o renderer usa o id cru */ }
  return null;
}

module.exports = { enriquecer, enriquecerBolsa, enriquecerDigimons, nomeDoNegocio };
