#!/usr/bin/env node
/**
 * O lado do processo principal: o roteador de pacotes do client, o resumo do
 * painel.js e o enriquecimento dos ovos.
 *
 * O test-painel2.js prova a TELA, alimentada com dados que eu mesmo escrevi.
 * Este prova que o que chega do socket vira aqueles dados. Sem ele, eu estaria
 * confiando que os campos existem porque a probe disse que existem.
 *
 * Os pacotes abaixo sao copias do que a probe ao vivo mediu em conta real
 * (painel2-campos.txt / painel2-tier.txt). Nada de rede: nenhum socket e aberto.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-painel2-client.js
 */
'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dd-cli-')));

const out = [];
const ok = (c, t) => { out.push((c ? 'OK    ' : 'FALHA ') + t); };

app.whenReady().then(async () => {
  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const { resumo } = require('./src/headless/painel');

  // Um client sem socket: so o roteador. connect() nunca e chamado.
  const c = new DigiiIdleHeadlessClient('a1', 'persist:teste-nao-existe', { name: 'teste' });
  const eventos = [];
  for (const e of ['atividade', 'historico', 'update', 'lab']) c.on(e, (x) => eventos.push([e, x]));
  const manda = (msg) => c.onMessage({ data: JSON.stringify(msg) });
  const atividades = () => eventos.filter((e) => e[0] === 'atividade').map((e) => e[1]);

  // ---- 1. 'estado': o D-Dol vem de gemas, nao de diamantes
  manda({
    t: 'estado', nivel: 42, bits: 123456, gemas: 789, diamantes: 50,
    local: 'hunt', huntSlug: 'bloomlordmon', ativoId: 7, itens: {},
    sessao: { inicio: Date.now() - 3600000, caca: 3600000, xpTamer: 450000, bits: 90000, abates: 900, capturas: 12, shinyVistos: 1 },
    equipe: [{ id: 7, especie: 'agumon', nivel: 50, hp: 80, hpMax: 100 }],
    online: 2921,
  });
  ok(c.state.gemas === 789, 'o D-Dol (gemas=789) foi guardado');
  ok(c.state.gemas !== c.state.diamantes, 'nao confundiu com diamantes=50, que e o DCoin da Shop');

  // ---- 2. 'welcome': os 60 ovos que semeiam o historico
  const ovoCru = { especie: 'agumon', nivel: 1, shiny: false, potencia: 1, qualidade: 1.1, nota: 2.3, scanner: 'ux', em: Date.now(), ovo: 'Rookie', ivs: [10, 10, 10, 10, 10, 10], u: [0.5, 0.5] };
  manda({ t: 'welcome', passe: null, historico: [ovoCru, { ...ovoCru, em: Date.now() - 1 }] });
  const hist = eventos.filter((e) => e[0] === 'historico');
  ok(hist.length === 1, 'o welcome emitiu o historico uma vez');
  ok(hist[0][1].length === 2, 'com os 2 ovos do lote');

  // ---- 3. 'captura': ok:true entra, ok:false NAO
  manda({ t: 'captura', ok: true, esp: 'agumon', historico: { ...ovoCru, potencia: 5, shiny: true } });
  ok(atividades().some((a) => a.tipo === 'captura'), 'a captura bem-sucedida virou atividade');
  const antes = atividades().length;
  // Medido em conta real: a falha nao traz 'ovo' nem 'historico'. Trata-la como
  // sucesso encheria o historico de entradas vazias (7 falhas em 90s).
  manda({ t: 'captura', ok: false, esp: 'agumon', corpo: 1, scanner: 'ux' });
  ok(atividades().length === antes, 'a captura FALHADA (ok:false) nao gerou nada');
  ok(c.historicoOvos.length === 3, 'o historico do client tem 3 ovos (2 do welcome + 1 capturado)');

  // ---- 4. o item dropado vem no TEXTO do abate, nao em pacote proprio
  manda({ t: 'log', tipo: 'abate', em: Date.now(), txt: 'Bloomlordmon derrotado! +11265 xp tamer, +900 bits · drop: Energia de Ovo Bird Instável' });
  const drop = atividades().find((a) => a.tipo === 'drop');
  ok(!!drop, 'o drop foi extraido do texto do abate');
  ok(drop && drop.item === 'Energia de Ovo Bird Instável', 'com o nome exato do item (veio: ' + (drop && drop.item) + ')');
  ok(drop && drop.de === 'Bloomlordmon', 'e de quem caiu');
  ok(c.state.ultimoAbate && c.state.ultimoAbate.nome === 'Bloomlordmon', 'o ultimo abate continua sendo registrado');
  // Abate sem drop nao pode inventar um.
  const nd = atividades().filter((a) => a.tipo === 'drop').length;
  manda({ t: 'log', tipo: 'abate', em: Date.now(), txt: 'Agumon derrotado! +100 xp tamer' });
  ok(atividades().filter((a) => a.tipo === 'drop').length === nd, 'abate SEM drop nao gera atividade de drop');

  // ---- 5. o ovo chocado e um 'toast', nao um 'log'
  manda({ t: 'toast', txt: 'O ovo chocou! Agumon nasceu.' });
  ok(atividades().some((a) => a.tipo === 'chocou'), 'o ovo chocado foi reconhecido no toast');
  const nc = atividades().filter((a) => a.tipo === 'chocou').length;
  manda({ t: 'toast', txt: 'Voce subiu de nivel!' });
  ok(atividades().filter((a) => a.tipo === 'chocou').length === nc, 'outro toast qualquer nao e confundido com ovo chocado');

  // ---- 6. 'lab': os baus do dia
  manda({ t: 'lab', bauHoje: 1, cfg: { bauPorDia: 3 } });
  ok(c.state.labBauHoje === 1 && c.state.labBauPorDia === 3, 'os baus do dia foram guardados');

  // ---- 7. o resumo que a UI recebe
  const p = await resumo(c.state);
  ok(p.ddol === 789, 'o resumo leva o D-Dol = 789 (veio: ' + p.ddol + ')');
  ok(p.bits === 123456, 'e os bits');
  ok(p.labs === 2, 'labs disponiveis = 3 por dia - 1 usado = 2 (veio: ' + p.labs + ')');
  ok(p.hunt && p.hunt.slug === 'bloomlordmon', 'a hunt atual esta no resumo');
  ok(p.hunt && p.hunt.nome && p.hunt.nome !== 'bloomlordmon', 'e vem pelo NOME da area, nao pelo slug (veio: ' + (p.hunt && p.hunt.nome) + ')');
  ok(p.farm.caca === 3600000, 'o tempo de caca veio da sessao (veio: ' + p.farm.caca + ')');
  ok(p.taxas.xpTamerH === 450000, 'XP/h = 450000 xp em 1h (veio: ' + p.taxas.xpTamerH + ')');
  ok(p.taxas.bitsH === 90000, 'Bits/h = 90000 (veio: ' + p.taxas.bitsH + ')');
  ok(p.taxas.killsH === 900, 'Kills/h = 900 (veio: ' + p.taxas.killsH + ')');

  // ---- 8. o corte de 1 minuto, que e do proprio jogo
  const curto = { ...c.state, sessao: { ...c.state.sessao, caca: 30000, xpTamer: 7500 } };
  const pc = await resumo(curto);
  ok(pc.taxas.xpTamerH === null, 'com 30s de caca a taxa e null, nao "900.000/h" (veio: ' + pc.taxas.xpTamerH + ')');
  ok(pc.bits === 123456, 'mas os totais continuam valendo');

  // ---- 9. caca=0 com a conta online ha 48min (medido em conta real)
  const paradо = { ...c.state, online: 2921, sessao: { ...c.state.sessao, caca: 0 } };
  const pp = await resumo(paradо);
  ok(pp.farm.caca === 0, 'caca=0 e respeitado: nao se usa o tempo conectado no lugar');
  ok(pp.taxas.bitsH === null, 'e sem tempo de caca nao se inventa taxa');

  // ---- 10. labs: 0 e uma afirmacao; null e a ausencia dela
  const semLab = { ...c.state, labBauHoje: null, labBauPorDia: null };
  ok((await resumo(semLab)).labs === null, 'sem resposta do lobby, labs e null (a UI mostra travessao)');
  const cheio = { ...c.state, labBauHoje: 3, labBauPorDia: 3 };
  ok((await resumo(cheio)).labs === 0, 'com 3/3 usados, labs e 0 (e um fato, nao uma ausencia)');

  // ---- 11. o timer do lab existe (o pacote nunca chega sozinho)
  ok(typeof c.startLabTimer === 'function', 'o client sabe pedir lab.info periodicamente');
  const enviados = [];
  c.send = (m) => { enviados.push(m); return true; };
  // NAO se inventa aqui um 'estou conectado'. Era isso que escondia o bug: o
  // teste definia c.isConnected = () => true, entao o client chamava o metodo
  // que o TESTE criou. Em producao esse metodo nao existe e o app morria com
  // "this.isConnected is not a function". Aqui so se monta o que o client de
  // verdade le: status + um ws com readyState 1.
  c.status = 'connected';
  c.ws = { readyState: 1 };
  ok(c.connected === true, "o client se da por conectado pelo getter 'connected'");
  ok(typeof c.isConnected !== 'function', 'e NAO existe isConnected(): quem chamar derruba o processo');
  c.startLabTimer();
  await new Promise((r) => setTimeout(r, 9000));
  ok(enviados.some((m) => m.t === 'lab.info'), 'e pediu lab.info depois de conectar (veio: ' + JSON.stringify(enviados) + ')');
  c.stopLabTimer();

  // ---- 12. o log das ferramentas vira atividade
  const { HeadlessTool } = require('./src/headless/tools');
  const t = new HeadlessTool(c, 'eggs', {});
  const nt = atividades().length;
  t.log('vendeu 7 (tiers D/D/C)');
  const fer = atividades()[nt];
  ok(fer && fer.tipo === 'ferramenta', 'o log da ferramenta emitiu uma atividade');
  ok(fer && fer.tool === 'eggs', 'dizendo qual ferramenta falou');
  ok(fer && fer.txt === 'vendeu 7 (tiers D/D/C)', 'com o texto inteiro (veio: ' + (fer && fer.txt) + ')');

  // ---- 13. o enriquecimento do ovo: a letra NAO vem do servidor
  const { enriquecer } = require('./src/headless/ovos');
  const e1 = await enriquecer(ovoCru);
  ok(!!e1, 'o ovo foi enriquecido');
  ok(e1.nome === 'Agumon', 'o id da especie virou nome (veio: ' + e1.nome + ')');
  ok(/^(D|C|B|A|S|SS|SSS)$/.test(e1.letra), 'e ganhou uma letra de tier valida (veio: ' + e1.letra + ')');
  ok(e1.scanner === 'ux', 'o scanner UX foi preservado (e um dos filtros do Painel)');
  // 'ovo: "Rookie"' e o ESTAGIO, nao o tier: nao pode virar a letra.
  ok(e1.letra !== 'Rookie', 'o campo ovo="Rookie" (estagio) NAO foi confundido com o tier');
  ok(e1.nota === 2.3, 'a nota do servidor foi mantida');
  // Ovo antigo, sem o sorteio guardado: sem letra, mas ainda e uma linha util.
  const e2 = await enriquecer({ especie: 'agumon', em: 1, potencia: 1 });
  ok(e2 && e2.letra === '?', 'ovo sem ivs/u fica com letra "?" em vez de estourar (veio: ' + (e2 && e2.letra) + ')');
  // Potencia maior = nota maior, com o resto igual. Prova que a conta e real.
  const p1 = await enriquecer({ ...ovoCru, potencia: 1, nota: null });
  const p5 = await enriquecer({ ...ovoCru, potencia: 5, nota: null });
  ok(p5.nota > p1.nota, 'P5 da nota maior que P1 com os mesmos IVs (' + p1.nota + ' -> ' + p5.nota + ')');

  // ---- 13b. a BOLSA: os ovos que a conta tem agora
  //
  // O ovo abaixo e uma copia fiel de um ovo real da bolsa, medido numa conta
  // (bolsa-campos.txt). Note o que o pacote 'ovos' NAO traz: 'scanner' (por
  // isso o filtro UX saiu da tela) e 'nota' (calculada aqui).
  const { enriquecerBolsa } = require('./src/headless/ovos');
  const daBolsa = {
    id: 6023, especie: 'candmon', de: 'desconhecido-551', estagio: 0,
    familia: 'devil', nivel: 48, data: 0, potencia: 4,
    ivs: [28, 18, 14, 11, 22, 22], u: [0.4687347163591573, 0.5495661211673422],
    em: 1795659530816,
  };
  const b = await enriquecerBolsa([daBolsa]);
  ok(b.length === 1, 'o ovo da bolsa foi enriquecido (veio: ' + b.length + ')');
  ok(b[0].id === 6023, 'o id do servidor foi preservado (e a identidade da linha)');
  ok(b[0].nome === 'Candmon', 'o slug virou nome (veio: ' + b[0].nome + ')');
  ok(b[0].letra === 'A', 'a letra foi calculada e e a medida na conta real (veio: ' + b[0].letra + ')');
  ok(b[0].nota != null && Math.abs(b[0].nota - 2.293) < 0.01, 'e a nota tambem (veio: ' + b[0].nota + ')');
  // O retrato NAO pode estar aqui: foi o que inflou o estado para 24 MB.
  ok(b[0].img === undefined, 'a bolsa NAO carrega retrato (vem do cache por especie)');
  ok(!JSON.stringify(b).includes('data:image'), 'nenhum data-URL na bolsa enriquecida');
  // Campos que so existem quando o ovo os tem: nao podem virar undefined.
  ok(b[0].travado === false && b[0].shiny === false, 'travado/shiny ausentes viram false, nao undefined');
  const b2 = await enriquecerBolsa([{ ...daBolsa, travado: true, shiny: true, data: 3 }]);
  ok(b2[0].travado === true && b2[0].shiny === true && b2[0].data === 3, 'e quando existem, chegam na tela');
  // Ovo sem o sorteio: ainda e uma linha util, com letra '?'.
  const b3 = await enriquecerBolsa([{ id: 1, especie: 'agumon', potencia: 1 }]);
  ok(b3[0].letra === '?', 'ovo sem ivs/u fica com letra "?" (veio: ' + b3[0].letra + ')');
  ok((await enriquecerBolsa(null)).length === 0, 'bolsa nula nao estoura');
  ok((await enriquecerBolsa([null, undefined])).length === 0, 'bolsa com lixo nao gera linha');

  // ---- 13c. os DIGIMONS: nao so os ovos
  //
  // O digimon abaixo e copia fiel de um digimon real, medido numa conta
  // (depot-campos.txt). Note o que ele NAO traz: 'u', o sorteio de qualidade.
  // Passa-lo por notaOvo() devolveria null e a letra sairia '?' para todos os
  // digimons da conta. Em troca o servidor manda 'nota' e 'faixa' prontas, na
  // mesma escala de 0 a 10 dos ovos - e dai sai a letra.
  const { enriquecerDigimons } = require('./src/headless/ovos');
  const wargrow = {
    id: 26473, especie: 'wargrowlmon', max: 'wargrowlmon', linha: ['guilmon', 'growlmon', 'wargrowlmon'],
    nivel: 112, xp: 22584574, ivs: [18, 20, 25, 31, 19, 31], ivTotal: 144,
    qualidade: 1.58, qualPct: 2, potencia: 2, shiny: false, hp: 2664, hpMax: 2664,
    stats: [222, 237, 219, 270, 181, 258], nota: 3.526, faixa: 'Razoável', poder: 409,
    local: 'equipe', ordem: 0, starter: true, capturadoEm: 1795045062346,
    capturadoPor: 'ms3', precoVenda: 88255, tamanho: 175.6,
  };
  ok(wargrow.u === undefined, 'o digimon real NAO traz "u" (por isso a letra nao vem de notaOvo)');
  const g = await enriquecerDigimons({ equipe: [wargrow] });
  ok(g.length === 1, 'o digimon foi enriquecido (veio: ' + g.length + ')');
  ok(g[0].tipo === 'digi', 'marcado como digimon: e o que separa as duas naturezas da mesma lista');
  ok(g[0].nome === 'Wargrowlmon', 'o slug virou nome (veio: ' + g[0].nome + ')');
  // nota 3.526 cai na faixa 3.0-4.2 do corte TIERS_OVO: letra S.
  ok(g[0].letra === 'S', 'a letra sai do corte da nota do servidor (veio: ' + g[0].letra + ')');
  ok(g[0].nota === 3.526, 'a nota do servidor passa intacta');
  ok(g[0].faixa === 'Razoável', 'e a faixa por extenso, que a dica da linha mostra');
  ok(g[0].nivel === 112 && g[0].poder === 409, 'nivel e poder, que so o digimon tem');
  ok(g[0].em === 1795045062346, 'capturadoEm virou "em", para empatar a ordenacao com os ovos');
  // O retrato NAO pode estar aqui, pelo mesmo motivo da bolsa.
  ok(g[0].img === undefined, 'o digimon NAO carrega retrato (vem do cache por especie)');
  ok(!JSON.stringify(g).includes('data:image'), 'nenhum data-URL nos digimons enriquecidos');
  // Os tres grupos somam, como todosDigimons do cliente do jogo.
  const g3 = await enriquecerDigimons({
    equipe: [wargrow],
    depot: [{ id: 2, especie: 'agumon', nota: 9.9 }],
    colecao: [{ id: 3, especie: 'gabumon', nota: 0.1 }],
  });
  ok(g3.length === 3, 'equipe + DigiBank + colecao somam (veio: ' + g3.length + ')');
  ok(g3[1].letra === 'SSS' && g3[2].letra === 'D', 'os extremos da nota dao SSS e D');
  // O grupo onde veio e a reserva quando o servidor nao manda 'local'.
  ok(g3[1].local === 'depot' && g3[2].local === 'colecao', 'sem "local", vale o grupo onde o digimon veio');
  // O mesmo bicho pode estar na equipe E marcado como colecao: uma linha so.
  const gdup = await enriquecerDigimons({ equipe: [wargrow], colecao: [wargrow] });
  ok(gdup.length === 1, 'o mesmo digimon em dois grupos nao duplica a linha (veio: ' + gdup.length + ')');
  // Digimon sem nota: ainda e uma linha util, com letra '?'.
  const gsn = await enriquecerDigimons({ depot: [{ id: 9, especie: 'agumon' }] });
  ok(gsn[0].letra === '?', 'digimon sem nota fica com letra "?" (veio: ' + gsn[0].letra + ')');
  ok((await enriquecerDigimons()).length === 0, 'chamada sem grupos nao estoura');
  ok((await enriquecerDigimons({ equipe: [null], depot: [{ semId: 1 }] })).length === 0, 'lixo nao gera linha');

  // ---- 14. o item raro vem do CATALOGO, nao de uma lista escrita a mao
  const raros = await require('./src/headless/catalogo').nomesRaros();
  ok(raros.has('Boss Token'), 'Boss Token e raro (esta no bolso Itens Raros)');
  ok(raros.has('Chip AoE'), 'Chip AoE e raro');
  ok(raros.has('D-Skill Fogo'), 'os D-Skills entram, mesmo morando em zmoves');
  ok(raros.has('Proteção de Ovo'), 'a Protecao de Ovo ESTA na lista do jogo (a excecao e da interface)');
  // O erro que a lista a mao cometia: isto cai a cada poucos abates.
  ok(!raros.has('Energia de Ovo Bird Instável'), 'a Energia de Ovo NAO e rara (categoria datas)');
  ok(!raros.has('Small Potion'), 'nem as pocoes');
  ok(!raros.has('Scanner Ultra'), 'nem os scanners');

  // ---- 15. o Mercado ENTRE PLAYERS
  const mk = new DigiiIdleHeadlessClient('a9', 'persist:nao-existe', { name: 'mk' });
  const atos = [];
  mk.on('atividade', (a) => atos.push(a));
  const mandaMk = (m) => mk.onMessage({ data: JSON.stringify(m) });

  const venda = { em: 1000, tipo: 'digimon', vendi: true, qtd: 1, preco: 25000, moeda: 'bits', outro: 'fulano', resumo: { especie: 'agumon', potencia: 5, shiny: true, nivel: 50 } };
  // A PRIMEIRA resposta e so marco: anuncia-la encheria a Atividade com o
  // historico inteiro da conta na hora do login.
  mandaMk({ t: 'mercado.meus', historico: [venda], abertos: [] });
  ok(atos.length === 0, 'a primeira resposta do mercado NAO vira atividade (e so o marco do login)');

  const compra = { em: 2000, tipo: 'item', item: 'token-boss', vendi: false, qtd: 3, preco: 400, moeda: 'gemas', outro: 'sicrano', resumo: {} };
  mandaMk({ t: 'mercado.meus', historico: [venda, compra], abertos: [] });
  ok(atos.length === 1, 'so a negociacao NOVA virou atividade (veio: ' + atos.length + ')');
  const n = atos[0];
  ok(n.tipo === 'mercado', 'com o tipo mercado');
  ok(n.vendi === false, 'dizendo que foi uma COMPRA');
  ok(n.item === 'token-boss' && n.qtd === 3 && n.preco === 400, 'com item, quantidade e preco unitario');
  ok(n.moeda === 'gemas', 'e a moeda (gemas = D-Dol)');
  ok(n.outro === 'sicrano', 'e com quem foi negociado');

  // A mesma lista de novo: nao pode repetir.
  mandaMk({ t: 'mercado.meus', historico: [venda, compra], abertos: [] });
  ok(atos.length === 1, 'a mesma resposta duas vezes nao duplica a linha');

  // O 'mercado.mudou' nao traz conteudo: o client tem que PEDIR.
  const pedidos = [];
  mk.send = (m) => { pedidos.push(m); return true; };
  mk.status = 'connected';
  mk.ws = { readyState: 1 };
  mandaMk({ t: 'mercado.mudou' });
  await new Promise((r) => setTimeout(r, 5000));
  ok(pedidos.some((m) => m.t === 'mercado.meus'), 'ao saber que o mercado mexeu, pediu mercado.meus (veio: ' + JSON.stringify(pedidos) + ')');
  // Em horario cheio o aviso chega varias vezes por segundo.
  const antesN = pedidos.length;
  for (let i = 0; i < 20; i++) mandaMk({ t: 'mercado.mudou' });
  await new Promise((r) => setTimeout(r, 5000));
  ok(pedidos.length - antesN === 1, '20 avisos seguidos geram UM pedido, nao 20 (veio: ' + (pedidos.length - antesN) + ')');
  mk.stopMercadoMarco();

  // ---- 16. o nome bonito do que foi negociado
  const { nomeDoNegocio } = require('./src/headless/ovos');
  ok(await nomeDoNegocio({ oque: 'digimon', especie: 'agumon' }) === 'Agumon', 'o slug da especie vira nome');
  ok(await nomeDoNegocio({ oque: 'item', item: 'token-boss' }) === 'Boss Token', 'o id do item vira nome');
  ok(await nomeDoNegocio({ oque: 'item', item: 'nao-existe-xyz' }) === null, 'item desconhecido devolve null (a UI mostra o id cru)');

  fs.writeFileSync(path.join(__dirname, 'painel2-client-report.txt'), out.join('\n') + '\n');
  console.log(out.join('\n'));
  const falhas = out.filter((l) => l.startsWith('FALHA')).length;
  console.log(falhas ? `\n=== FALHOU: ${falhas} caso(s) ===` : '\n=== PASS: o headless entrega o que o Painel precisa ===');
  app.exit(falhas ? 1 : 0);
}).catch((e) => { console.log('FATAL ' + ((e && e.stack) || e)); app.exit(1); });
