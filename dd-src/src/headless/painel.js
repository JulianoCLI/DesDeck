'use strict';
const { especiePorId, especiesDaArea } = require('./catalogo');
const { retrato } = require('./sprites');

// O resumo que o card de uma conta headless mostra: quem esta lutando, contra
// quem, ha quanto tempo e com que resultado.
//
// Existe porque o modo headless nao tem tela. O estado cru do socket tem a
// informacao, mas espalhada e em codigo (ativoId numerico, huntSlug, ids de
// especie): aqui ela vira nome, retrato e numeros prontos.

/** Quem esta lutando: o membro da equipe apontado por ativoId. */
function ativo(estado) {
  const eq = estado.equipe || [];
  if (!eq.length) return null;
  return eq.find((d) => d && d.id === estado.ativoId) || eq[0];
}

/**
 * Contra quem a conta luta.
 *
 * Duas fontes, nesta ordem:
 *  1. o ultimo abate, que traz o nome exato de quem caiu agora;
 *  2. a area da hunt, que diz quem mora la - serve enquanto nada morreu ainda.
 *
 * A 1a e a verdade do momento; a 2a e uma previsao. O campo 'certo' diz qual
 * das duas, para a UI nao afirmar o que nao sabe.
 */
function alvo(estado, areas, especies) {
  const recente = estado.ultimoAbate && Date.now() - estado.ultimoAbate.em < 60000;
  if (recente) {
    const nome = estado.ultimoAbate.nome;
    // Do nome para o id, para achar o sprite. O catalogo tem 301 especies:
    // comparar sem acento e sem caixa evita errar por detalhe de escrita.
    const chave = String(nome).toLowerCase().replace(/[^a-z0-9]/g, '');
    const achou = Object.values(especies).find(
      (e) => String(e.nome).toLowerCase().replace(/[^a-z0-9]/g, '') === chave,
    );
    return { id: achou ? achou.id : null, nome, certo: true };
  }

  const area = estado.huntSlug ? areas[estado.huntSlug] : null;
  if (area && area.especies.length) {
    const id = area.especies[0];
    return { id, nome: especies[id] ? especies[id].nome : id, certo: false };
  }
  return null;
}

/**
 * O nome da ilha a partir do slug ('file-island' -> 'File Island').
 *
 * O catalogo de areas so traz o slug; nao ha um catalogo de ilhas publicado.
 * Formatar o slug evita uma lista fixa que ficaria velha quando o jogo soltar
 * uma ilha nova.
 */
function ilhaNome(slug) {
  return String(slug)
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/** Onde a conta esta, em portugues. */
function ondeEsta(estado, areas) {
  const local = estado.local;
  if (local === 'hunt') {
    const area = estado.huntSlug ? areas[estado.huntSlug] : null;
    if (!area) return 'Caçando';
    // A área se chama como o Digimon que mora nela ("Caçando em Gaomon"), o
    // mesmo nome que o painel já mostra do lado do alvo. A ilha é o que
    // acrescenta: diz em que parte do mapa a conta está.
    const ilha = area.ilha ? ilhaNome(area.ilha) : null;
    return ilha ? `Caçando em ${ilha} · nv ${area.nivel}` : `Caçando em ${area.nome}`;
  }
  if (local === 'hospital') return 'No Hospital';
  if (local === 'lab' || estado.lab) return 'No Labirinto';
  if (local === 'praca') return 'Na Praça';
  if (local === 'torre') return 'Na Torre';
  return local ? String(local) : '—';
}

/**
 * O tempo CACANDO da sessao, em ms.
 *
 * Copiado do cliente do jogo (app.js: `const msCaca = (s) => s.caca ?? ...`).
 * Nao e o tempo conectado: Hospital, praca e menus fora da hunt nao contam.
 * Medido em conta real: online=2921 s com caca=0 - usar o tempo conectado
 * dividiria o ganho por um tempo em que a conta nao estava cacando, e toda taxa
 * sairia menor do que o jogo mostra.
 */
const msCaca = (s) => (s.caca != null ? s.caca : Math.max(0, Date.now() - (s.inicio || Date.now())));

/**
 * A taxa por hora de um ganho da sessao, ou null.
 *
 * O servidor NAO manda xph/bitsph: o cliente do jogo divide pelo tempo de caca
 * (app.js porHora()). O corte de 1 min e do proprio jogo, e e o que impede uma
 * conta com 10 s de caca de anunciar "900.000 bits/h". null = "ainda nao da
 * para dizer", e a UI mostra '-' como o jogo faz.
 */
function porHora(s, v) {
  const ms = msCaca(s);
  return ms >= 60000 ? (v || 0) / (ms / 3600000) : null;
}

/**
 * O resumo completo de uma conta, pronto para desenhar.
 * Nunca lanca: sem catalogo, devolve o que da para saber sem ele.
 */
async function resumo(estado) {
  if (!estado) return null;

  let especies = {};
  let areas = {};
  try {
    [especies, areas] = await Promise.all([especiePorId(), especiesDaArea()]);
  } catch {
    // Sem catalogo da para mostrar numeros, so nao nome nem retrato.
  }

  const meu = ativo(estado);
  const inimigo = alvo(estado, areas, especies);
  const s = estado.sessao || {};

  // Os retratos sao buscados em paralelo e nunca derrubam o resumo.
  const [imgMeu, imgInimigo] = await Promise.all([
    meu && meu.especie ? retrato(meu.especie, especies[meu.especie]).catch(() => null) : null,
    inimigo && inimigo.id ? retrato(inimigo.id, especies[inimigo.id]).catch(() => null) : null,
  ]);

  const areaAtual = estado.huntSlug ? areas[estado.huntSlug] : null;

  return {
    nick: estado.nick || null,
    nivel: estado.nivel || 0,
    bits: estado.bits || 0,
    // D-Dol. Conferido em conta real: 'gemas' e o D-Dol do Mercado; o
    // 'diamantes' e o DCoin da Shop. Sao moedas diferentes.
    ddol: estado.gemas || 0,
    onde: ondeEsta(estado, areas),
    online: estado.online || 0,

    // A hunt atual pelo nome, nao pelo slug: 'bloomlordmon' no card nao diz
    // onde a conta esta para quem le de relance.
    hunt: estado.huntSlug ? {
      slug: estado.huntSlug,
      nome: areaAtual ? areaAtual.nome : estado.huntSlug,
      nivel: areaAtual ? areaAtual.nivel : 0,
    } : null,

    // Quantos labirintos ainda cabem hoje. null = nao sabemos ainda: o pacote
    // 'lab' so chega em resposta a 'lab.info', e nem toda conta tem guild.
    // Zero e uma afirmacao ("acabaram"); null e a ausencia dela.
    labs: (estado.labBauPorDia != null && estado.labBauHoje != null)
      ? Math.max(0, estado.labBauPorDia - estado.labBauHoje)
      : null,

    digimon: meu ? {
      nome: especies[meu.especie] ? especies[meu.especie].nome : (meu.especie || '—'),
      especie: meu.especie || null,
      nivel: meu.nivel || 0,
      hp: meu.hp || 0,
      hpMax: meu.hpMax || 0,
      // O quanto de vida resta, que e o que se olha de relance.
      hpPct: meu.hpMax ? Math.round((meu.hp / meu.hpMax) * 100) : 0,
      shiny: !!meu.shiny,
      poder: meu.poder || 0,
      img: imgMeu,
    } : null,

    alvo: inimigo ? {
      nome: inimigo.nome,
      especie: inimigo.id,
      // false = "quem mora na area", nao "quem esta na frente agora".
      certo: inimigo.certo,
      img: imgInimigo,
    } : null,

    // O resultado da sessao: e o que responde "esta rendendo?".
    farm: {
      abates: s.abates || 0,
      capturas: s.capturas || 0,
      xpTamer: s.xpTamer || 0,
      bits: s.bits || 0,
      shinyVistos: s.shinyVistos || 0,
      desde: s.inicio || 0,
      // O tempo de caca da sessao, que e o denominador das taxas abaixo.
      // Mandado junto para o card poder mostrar "ha 1h12 cacando" e para a UI
      // saber por que uma taxa veio null.
      caca: msCaca(s),
    },

    // As taxas por hora. null = menos de 1 min de caca, e a UI mostra '-'.
    // Calculadas aqui e nao no renderer porque o denominador (o tempo de caca)
    // so existe no estado do socket.
    taxas: {
      xpTamerH: porHora(s, s.xpTamer),
      bitsH: porHora(s, s.bits),
      killsH: porHora(s, s.abates),
      capturasH: porHora(s, s.capturas),
    },

    evp: estado.evp || 0,
    evpMax: estado.evpMax || 0,
    evento: estado.eventoXP ? { nome: estado.eventoXP.rotulo || estado.eventoXP.nome, pct: estado.eventoXP.pct || 0 } : null,
  };
}

module.exports = { resumo };
