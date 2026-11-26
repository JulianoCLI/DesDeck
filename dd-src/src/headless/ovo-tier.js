'use strict';
// Tier do ovo, para a ferramenta headless de venda.
//
// Por que isto existe: o pacote 'ovos' do servidor NÃO traz o tier. Ele manda
// especie, ivs, u, potencia e data; a letra (D..SSS) é calculada no cliente por
// js/ovo-tier.js, a partir de js/regras.js. A versão da ferramenta que roda no
// webview simplesmente importa esses módulos do jogo (são ES modules e a página
// está no mesmo origin). No headless não há página, então a conta dessa matemática
// é portada aqui.
//
// A regra do porte: copiar letra a letra, sem "melhorar" nada. Qualquer divergência
// aqui vende o ovo errado — e ovo vendido não volta. Cada bloco cita a origem.
//
// Conferido em https://digiidle.com/js/regras.js?v=6 e /js/ovo-tier.js?v=4.

// ---- regras.js
const STATS = ['hp', 'atk', 'def', 'spAtk', 'spDef', 'spd'];
const EXPO = [0.95, 0.8, 0.8, 0.8, 0.8, 0.95];
const POTENCIAS = [
  { n: 1, chance: 74.495, bonus: 0 }, { n: 2, chance: 20, bonus: 0.05 }, { n: 3, chance: 5, bonus: 0.1 },
  { n: 4, chance: 0.5, bonus: 0.25 }, { n: 5, chance: 0.005, bonus: 1 },
];
const multPot = (p) => 1 + (POTENCIAS[p - 1]?.bonus ?? 0);
const MULT_SHINY = 3;

const ivsDeSoma = (s) => {
  const m = Math.floor(s / 6), r = s - m * 6;
  return STATS.map((_, i) => m + (i < r ? 1 : 0));
};
const comoIvs = (iv) => (Array.isArray(iv) ? iv : ivsDeSoma(iv));

// Potência x Shiny x lendário, na ordem do servidor (regras.ValorStatL).
function multNascenca(p, shiny, lendario = false) {
  let m = multPot(p);
  if (shiny) m *= MULT_SHINY;
  if (lendario) m *= 4; // MULT_LENDARIO
  return m;
}

const parcela = (bases, ivs, q, mult, i) => Math.round((bases[STATS[i]] + 2 * ivs[i]) * q ** EXPO[i] * mult);

function somaNascimento(bases, ivs, q, p, shiny) {
  const mult = multNascenca(p, shiny);
  return STATS.reduce((s, _, i) => s + parcela(bases, ivs, q, mult, i), 0);
}

const REF = { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, spd: 80 };
const LIM = [somaNascimento(REF, ivsDeSoma(6), 0.8, 1, false), somaNascimento(REF, ivsDeSoma(192), 1.8, 5, true)];

function score(bases, ivs, q, p, shiny) {
  const [min, max] = LIM;
  const s = Math.max(min, Math.min(max, somaNascimento(bases, ivs, q, p, shiny)));
  const n = Math.round(Math.max(0, Math.min(10, (10 * (Math.log(s) - Math.log(min))) / (Math.log(max) - Math.log(min)))) * 1000) / 1000;
  return n / 10;
}

// Nota de 0 a 10 dentro da espécie.
function nota(bases, ivs, q, p, shiny) {
  const lo = score(bases, ivsDeSoma(6), 0.8, 1, false);
  const hi = score(bases, ivsDeSoma(192), 1.8, 5, true);
  if (hi <= lo) return 0;
  const s = Math.max(lo, Math.min(hi, score(bases, comoIvs(ivs), q, p, shiny)));
  return Math.round(((10 * (s - lo)) / (hi - lo)) * 1000) / 1000;
}

// ---- ovo-tier.js
const BANDAS_Q = [
  [0.8, 0.9, 5], [0.9, 1.0, 5], [1.0, 1.1, 34.03846], [1.1, 1.2, 20], [1.2, 1.3, 10],
  [1.3, 1.4, 10], [1.4, 1.5, 10], [1.5, 1.6, 5], [1.7, 1.8, 0.67308], [1.8, 1.8, 0.28846],
];
const TIERS_OVO = [
  ['D', 0.8], ['C', 1.4], ['B', 2], ['A', 3], ['S', 4.2], ['SS', 6], ['SSS', Infinity],
];

/**
 * A letra D..SSS de uma nota de 0 a 10.
 *
 * Existe separada porque os DIGIMONS (pacotes 'estado'.equipe e 'depot') já
 * chegam com 'nota' pronta do servidor, na mesma escala dos ovos — medido em
 * conta real: um wargrowlmon veio nota 3.526 / faixa "Razoável". Eles NÃO
 * trazem 'u' (o sorteio de qualidade), então notaOvo() devolveria null e a
 * letra sairia '?' para todos. Reaproveitar o corte aqui é o que faz o filtro
 * "SSS" significar a mesma coisa para um ovo e para um digimon.
 */
function letraDeNota(n) {
  if (n == null || !Number.isFinite(n)) return '?';
  return (TIERS_OVO.find((t) => n < t[1]) || TIERS_OVO[TIERS_OVO.length - 1])[0];
}

/**
 * Monta o calculador de tier a partir dos catálogos públicos do jogo.
 * @param {Array} especies conteúdo de /shared/especies.json
 * @param {object} itens conteúdo de /shared/itens.json
 * @returns {{ letraOvo: (ovo:object) => string }}
 */
function criarTierOvo(especies, itens) {
  const porId = new Map((especies || []).map((e) => [e.id, e]));
  const cfgOvo = () => itens.ovoConfig;
  const tetoOvo = (data) => cfgOvo().tetoTamanho[Math.max(0, Math.min(5, data || 0))];

  // A qualidade do ovo: o mesmo corte do servidor (QualidadeAteU) com os dois
  // números guardados no ovo. O arredondamento imita o do Go (QualidadeDoTamanho):
  // 200 * 0.009 dá 1,7999… e perde a faixa de 1,8.
  const qSorte = (data, [u1, u2]) => {
    const max = Math.round(tetoOvo(data) * 9) / 1000;
    const cortes = [];
    let tot = 0;
    for (const [lo, hi, ch] of BANDAS_Q) {
      if (lo > max) continue;
      const h = Math.min(hi, max);
      const peso = hi > lo ? (ch * (h - lo)) / (hi - lo) : ch;
      if (peso > 0) { cortes.push([lo, h, peso]); tot += peso; }
    }
    let x = tot * u1;
    for (const [lo, h, peso] of cortes) {
      if (x < peso) return Math.round((lo + u2 * (h - lo)) * 1000) / 1000;
      x -= peso;
    }
    return cortes.length ? cortes[cortes.length - 1][1] : 0.85;
  };

  // Ovo sem o sorteio (o servidor completa os antigos ao entrar) fica sem tier.
  const notaOvo = (o, data = cfgOvo().max) => {
    const bases = porId.get(o.especie)?.bases;
    if (!bases || !o.ivs || !o.u) return null;
    return nota(bases, o.ivs, qSorte(data, o.u), o.potencia || 3, !!o.shiny);
  };

  // A letra do card é a do +N máximo (a qualidade só sobe com o +N).
  const letraOvo = (o) => letraDeNota(notaOvo(o));

  return { letraOvo, notaOvo };
}

module.exports = { criarTierOvo, letraDeNota, TIERS: TIERS_OVO.map((t) => t[0]) };
