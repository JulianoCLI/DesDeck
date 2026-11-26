#!/usr/bin/env node
/**
 * O Painel novo funciona mesmo?
 *
 * Roda o index.html + app.js DE VERDADE num BrowserWindow (com um 'deck' falso
 * no lugar do preload: sem IPC, sem rede, sem webview). Depois empurra os
 * eventos do headless que o processo principal emitiria e confere o que a tela
 * passa a mostrar.
 *
 * Por que assim e nao recortando o app.js: um recorte testa uma copia. Aqui o
 * que roda e o arquivo que o usuario executa - se renderDash() quebrar, o teste
 * quebra.
 *
 * Nao fala com o jogo e nao toca no perfil real: usa um userData temporario.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-painel2.js
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SAIDA = path.join(__dirname, 'painel2-report.txt');
// Perfil descartavel: o teste nao pode ler nem sujar o estado real do usuario.
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'dd-painel2-')));

// Um "resumo" como o painel.js monta. Os numeros sao os que o teste confere.
const painelDe = (over = {}) => ({
  nick: 'desum', nivel: 42, bits: 123456, ddol: 789,
  onde: 'Caçando em File Island · nv 30', online: 2921,
  hunt: { slug: 'bloomlordmon', nome: 'Bloomlordmon', nivel: 30 },
  labs: 2,
  digimon: { nome: 'Agumon', especie: 'agumon', nivel: 50, hp: 80, hpMax: 100, hpPct: 80, shiny: false, poder: 9, img: null },
  alvo: { nome: 'Bloomlordmon', especie: 'bloomlordmon', certo: true, img: null },
  farm: { abates: 900, capturas: 12, xpTamer: 450000, bits: 90000, shinyVistos: 1, desde: Date.now() - 3600000, caca: 3600000 },
  taxas: { xpTamerH: 450000, bitsH: 90000, killsH: 900, capturasH: 12 },
  evp: 0, evpMax: 0, evento: null,
  ...over,
});

// Um ovo da bolsa, como enriquecerBolsa() devolve: sem 'img' (o retrato vem do
// cache por especie) e sem 'scanner' (o pacote 'ovos' nao traz esse campo).
let proxId = 1;
const ovo = (o) => ({ id: proxId++, tipo: 'ovo', especie: 'agumon', nome: 'Agumon', letra: 'C', nota: 2.5, potencia: 1, shiny: false, travado: false, protegido: false, data: 0, nivel: 1, em: Date.now(), ...o });

// Um digimon, como enriquecerDigimons() devolve. Medido em conta real: o
// servidor manda 'nota' e 'faixa' prontas, e NAO manda 'u' - por isso a letra
// vem do corte da nota, nao de notaOvo().
const digi = (d) => ({
  id: proxId++, tipo: 'digi', especie: 'agumon', nome: 'Agumon', letra: 'B', nota: 3.5,
  faixa: 'Razoável', potencia: 1, nivel: 112, shiny: false, poder: 409, hp: 2664, hpMax: 2664,
  local: 'equipe', em: Date.now(), ...d,
});

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 1400, height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'test-painel2-preload.js'),
      contextIsolation: true, nodeIntegration: false, webviewTag: true,
    },
  });

  await win.loadFile(path.join(__dirname, 'src/renderer/index.html'));
  // O boot() do app.js e assincrono (deck.info, deck.getState): sem esta espera
  // o teste leria uma tela que ainda nao existe.
  await new Promise((r) => setTimeout(r, 1200));

  const PAINEL = JSON.stringify(painelDe());
  // A bolsa de uma conta: 1 SSS P5 shiny travado, 1 SS P4, 2 B.
  const bolsaDe = () => JSON.stringify([
    ovo({ letra: 'SSS', nota: 9.4, potencia: 5, shiny: true, travado: true, em: Date.now() - 1000 }),
    ovo({ letra: 'SS', nota: 6.8, potencia: 4, em: Date.now() - 2000 }),
    ovo({ letra: 'B', nota: 2.1, potencia: 1, em: Date.now() - 3000 }),
    ovo({ letra: 'B', nota: 2.2, potencia: 1, em: Date.now() - 4000 }),
  ]);
  const OVOS = bolsaDe();
  const OVOS2 = bolsaDe();
  // Os digimons de uma conta, um por lugar onde podem estar.
  const DIGIS = JSON.stringify([
    digi({ especie: 'wargrowlmon', nome: 'Wargrowlmon', letra: 'B', nota: 3.526, local: 'depot' }),
    digi({ letra: 'SSS', nota: 9.9, faixa: 'Divino', local: 'colecao', nivel: 90, poder: 1200 }),
    digi({ nome: 'Gabumon', especie: 'gabumon', letra: 'C', nota: 2.4, local: 'equipe' }),
  ]);

  const r = await win.webContents.executeJavaScript(`(async () => {
    const out = [];
    const ok = (c, t) => out.push((c ? 'OK    ' : 'FALHA ') + t);
    const esperar = (ms) => new Promise(r => setTimeout(r, ms));
    const $ = (s) => document.querySelector(s);
    const txt = (s) => { const e = $(s); return e ? e.textContent : ''; };
    const viva = (k) => { const e = document.querySelector('[data-live="' + k + '"]'); return e ? e.textContent : null; };
    // Igualdade exata nos de fabrica; os filtros do usuario carregam o '×' de
    // apagar dentro do proprio botao, entao para esses vale o comeco do texto.
    const chip = (raiz, rot) => [...document.querySelectorAll(raiz + ' .chip')]
      .find(b => b.textContent.trim() === rot || b.textContent.trim().replace(/×$/, '') === rot);

    try {
      // ---- 0. a tela do Painel montou
      ok($('#dash') && $('#dash').children.length > 0, 'o Painel montou');
      ok(!!$('#ovoList'), 'a caixa dos Ovos nas contas existe');
      ok(!!$('#logList'), 'a caixa de Atividade existe');

      // ---- 1. os botoes saiiram e o duplo clique entrou
      const card = $('.acc-card');
      ok(!!card, 'o card da conta existe');
      const rotulos = [...document.querySelectorAll('.acc-card button')].map(b => b.textContent.trim());
      ok(!rotulos.some(t => /Focar|Recarregar|Editar/.test(t)), 'os botoes Focar/Recarregar/Editar NAO estao mais no card (achei: ' + JSON.stringify(rotulos) + ')');
      ok(/[Dd]ois cliques/.test(card.getAttribute('title') || ''), 'o card avisa que focar e com dois cliques');

      // ---- 2. as metricas pedidas estao no card, e as removidas nao
      const chaves = [...document.querySelectorAll('.acc-card .kv [data-live]')].map(e => e.dataset.live.split(':')[0]);
      for (const k of ['xph','bitsh','killsh','bits','ddol','labs','hunt','caca'])
        ok(chaves.includes(k), 'o card tem a metrica ' + k);
      for (const k of ['up','total','drops','recov','mem','cpu'])
        ok(!chaves.includes(k), 'o card NAO tem mais ' + k + ' (online/quedas/memoria/CPU sairam)');

      // ---- 3. sem painel, tudo '-' (e nao 0, que seria uma afirmacao falsa)
      ok(viva('xph:a1') === '—', 'sem dados do jogo, XP/h mostra travessao (veio: ' + viva('xph:a1') + ')');
      ok(viva('labs:a1') === '—', 'sem dados, Labs mostra travessao');

      // ---- 4. chega o resumo do headless
      window.tst.emitir('hl:painel', { index: 'a1', painel: ${PAINEL} });
      await esperar(60);
      ok(viva('xph:a1') === '450.000', 'XP/h = 450.000 (veio: ' + viva('xph:a1') + ')');
      ok(viva('bitsh:a1') === '90.000', 'Bits/h = 90.000 (veio: ' + viva('bitsh:a1') + ')');
      ok(viva('killsh:a1') === '900', 'Kills/h = 900 (veio: ' + viva('killsh:a1') + ')');
      ok(viva('bits:a1') === '123.456', 'Bits = 123.456 (veio: ' + viva('bits:a1') + ')');
      ok(viva('ddol:a1') === '789', 'D-Dol = 789, o campo gemas (veio: ' + viva('ddol:a1') + ')');
      ok(viva('labs:a1') === '2', 'Labs = 2 (veio: ' + viva('labs:a1') + ')');
      ok(viva('hunt:a1') === 'Bloomlordmon', 'hunt pelo NOME da area, nao pelo slug (veio: ' + viva('hunt:a1') + ')');
      ok(viva('caca:a1') === '1h 00m' || /1h/.test(viva('caca:a1')), 'cacando ha ~1h (veio: ' + viva('caca:a1') + ')');
      // A outra conta nao pode ter sido contaminada pelo evento da primeira.
      ok(viva('xph:a2') === '—', 'o resumo da conta a1 nao vazou para a a2');

      // ---- 5. taxa null = travessao (menos de 1 min de caca, corte do jogo)
      const curto = ${PAINEL};
      curto.taxas = { xpTamerH: null, bitsH: null, killsH: null, capturasH: null };
      curto.farm = { ...curto.farm, caca: 30000 };
      window.tst.emitir('hl:painel', { index: 'a2', painel: curto });
      await esperar(60);
      ok(viva('xph:a2') === '—', 'com 30s de caca, XP/h mostra travessao em vez de inventar numero (veio: ' + viva('xph:a2') + ')');
      ok(viva('bits:a2') === '123.456', 'mas os totais, que nao dependem do tempo, aparecem');

      // ---- 6. os retratos dos digi, como no modo foco
      const faces = document.querySelector('[data-live="faces:a1"]');
      ok(!!faces && faces.children.length === 3, 'o card mostra meu digi vs o alvo (3 pecas: eu, vs, ele)');
      ok(faces.textContent.includes('vs'), 'tem o separador vs');
      // Sem img o retrato cai na inicial do nome - um card com buraco pareceria defeito.
      ok(faces.textContent.includes('A') && faces.textContent.includes('B'), 'sem sprite, sobram as iniciais (Agumon / Bloomlordmon)');

      // ---- 7. a bolsa das contas: substitui, nao acumula
      ok($('#ovoList').textContent.includes('Ligue as contas'), 'sem conta ligada, a lista explica o que fazer');
      window.tst.emitir('hl:bolsa', { index: 'a1', ovos: ${OVOS} });
      await esperar(80);
      ok($('#ovoList').children.length === 4, 'os 4 ovos da bolsa entraram (veio: ' + $('#ovoList').children.length + ')');
      ok(txt('#ovosCount').includes('4'), 'o contador diz 4');
      // O servidor manda a bolsa INTEIRA a cada vez: reenviar nao pode duplicar.
      window.tst.emitir('hl:bolsa', { index: 'a1', ovos: ${OVOS} });
      await esperar(80);
      ok($('#ovoList').children.length === 4, 'a MESMA bolsa reenviada nao duplicou (veio: ' + $('#ovoList').children.length + ')');
      // Cada conta tem a sua bolsa: as duas somam na lista.
      window.tst.emitir('hl:bolsa', { index: 'a2', ovos: ${OVOS2} });
      await esperar(80);
      ok($('#ovoList').children.length === 8, 'a bolsa da outra conta soma (veio: ' + $('#ovoList').children.length + ')');
      // O ovo vendido SAI da lista: e exatamente o que esta tela precisa fazer,
      // e o que o historico acumulado nao fazia.
      window.tst.emitir('hl:bolsa', { index: 'a2', ovos: [] });
      await esperar(80);
      ok($('#ovoList').children.length === 4, 'bolsa vazia: os ovos daquela conta sairam da lista (veio: ' + $('#ovoList').children.length + ')');
      window.tst.emitir('hl:bolsa', { index: 'a2', ovos: ${OVOS2} });
      await esperar(80);

      // ---- 8. filtros de ovo, um por vez
      ok(!!chip('#ovoChips', 'SSS'), 'tem o filtro SSS');
      chip('#ovoChips', 'SSS').click();
      await esperar(40);
      ok($('#ovoList').children.length === 2, 'filtro SSS deixa so os 2 SSS (um por conta) (veio: ' + $('#ovoList').children.length + ')');
      chip('#ovoChips', 'B').click();
      await esperar(40);
      ok($('#ovoList').children.length === 4, 'filtro B deixa os 4 B (veio: ' + $('#ovoList').children.length + ')');
      // O filtro UX saiu: o pacote 'ovos' nao traz 'scanner' (medido em conta
      // real), e um filtro que esconde tudo sem explicar e pior que nenhum.
      ok(!chip('#ovoChips', 'UX'), 'o filtro UX saiu (a bolsa nao tem o campo scanner)');
      ok(!!chip('#ovoChips', '🔒 Travado'), 'no lugar dele ha o filtro de travados');
      chip('#ovoChips', '🔒 Travado').click();
      await esperar(40);
      ok($('#ovoList').children.length === 2, 'filtro Travado deixa os 2 ovos com cadeado (veio: ' + $('#ovoList').children.length + ')');
      chip('#ovoChips', 'P5').click();
      await esperar(40);
      ok($('#ovoList').children.length === 2, 'filtro P5 deixa os de potencia 5 (veio: ' + $('#ovoList').children.length + ')');
      chip('#ovoChips', 'D').click();
      await esperar(40);
      ok($('#ovoList').children.length === 1 && $('#ovoList').textContent.includes('Nada com este filtro'), 'filtro sem resultado avisa, em vez de ficar vazio');
      chip('#ovoChips', 'Tudo').click();
      await esperar(40);
      ok($('#ovoList').children.length === 8, 'Tudo volta aos 8');
      // Os melhores primeiro: a pergunta que se faz olhando a bolsa e "sobrou
      // algo bom?", nao "o que entrou agora".
      ok($('#ovoList').firstElementChild.textContent.includes('SSS'), 'o melhor ovo (SSS) e a primeira linha');

      // ---- 8b. os DIGIMONS entram na MESMA lista
      // O pedido: nao so os ovos. A conta tem equipe + DigiBank + colecao, e o
      // pacote 'depot' chega sozinho no login (medido: +0,2s).
      window.tst.emitir('hl:digimons', { index: 'a1', digimons: ${DIGIS} });
      await esperar(80);
      ok($('#ovoList').children.length === 11, 'os 3 digimons somaram aos 8 ovos (veio: ' + $('#ovoList').children.length + ')');
      // Os dois tipos moram juntos, e cada filtro separa um.
      chip('#ovoChips', 'Digimons').click();
      await esperar(40);
      ok($('#ovoList').children.length === 3, 'o filtro Digimons deixa so os 3 digimons (veio: ' + $('#ovoList').children.length + ')');
      ok(!$('#ovoList').textContent.includes('🥚'), 'e nenhum ovo passou (o 🥚 marca os ovos)');
      chip('#ovoChips', '🥚 Ovos').click();
      await esperar(40);
      ok($('#ovoList').children.length === 8, 'o filtro Ovos deixa so os 8 ovos (veio: ' + $('#ovoList').children.length + ')');
      // A letra vale para os dois: o SSS do digimon aparece junto com o do ovo.
      chip('#ovoChips', 'SSS').click();
      await esperar(40);
      ok($('#ovoList').children.length === 3, 'filtro SSS pega os 2 ovos SSS E o digimon SSS (veio: ' + $('#ovoList').children.length + ')');
      chip('#ovoChips', 'Tudo').click();
      await esperar(40);

      // ---- 8c. a linha do digimon diz o que so ele tem
      const ld = [...$('#ovoList').children].find(e => e.textContent.includes('Wargrowlmon'));
      ok(!!ld, 'ha uma linha do digimon');
      ok(!ld.textContent.includes('🥚'), 'o digimon NAO leva o 🥚 (ele nao e um ovo)');
      ok(ld.textContent.includes('Nv 112'), 'mostra o nivel (veio: ' + ld.textContent + ')');
      ok(ld.textContent.includes('409'), 'mostra o poder');
      ok(ld.textContent.includes('DigiBank'), 'e diz ONDE o digimon esta guardado');
      ok(ld.getAttribute('title').includes('Razoável'), 'a dica traz a faixa que o jogo mostra por extenso');
      const lo = [...$('#ovoList').children].find(e => e.textContent.includes('🥚'));
      ok(!!lo, 'e os ovos continuam marcados com 🥚');
      // Digimon desaparecido (evoluiu, foi vendido) sai da lista.
      window.tst.emitir('hl:digimons', { index: 'a1', digimons: [] });
      await esperar(80);
      ok($('#ovoList').children.length === 8, 'digimons sumiram: sobraram os 8 ovos (veio: ' + $('#ovoList').children.length + ')');
      window.tst.emitir('hl:digimons', { index: 'a1', digimons: ${DIGIS} });
      await esperar(80);
      ok($('#ovoList').children.length === 11, 'e voltaram quando o pacote chegou de novo');
      window.tst.emitir('hl:digimons', { index: 'a1', digimons: [] });
      await esperar(80);

      // ---- 9. a linha do ovo mostra letra, potencia e shiny
      const linha = [...$('#ovoList').children].find(e => e.textContent.includes('SSS'));
      ok(!!linha, 'ha uma linha SSS');
      ok(linha.querySelector('.ovo-tier.tSSS'), 'a letra SSS tem a classe de cor propria');
      ok(linha.querySelector('.ovo-pot.p5'), 'P5 tem destaque proprio (0,005% das capturas)');
      ok(linha.textContent.includes('✦'), 'o shiny aparece com a marca ✦');
      ok(linha.textContent.includes('9.40'), 'a nota de 0 a 10 aparece');
      // Qual das duas contas e a primeira SSS depende da ordem de empate no
      // 'em'; o que importa e que a linha diga de QUAL conta o ovo veio.
      ok(/desum|desdois/.test(linha.textContent), 'a linha diz de qual conta veio o ovo');

      // ---- 10. os ovos NAO sao salvos em disco
      // Era a causa medida do app travar: 2000 capturas com o retrato embutido
      // davam 17,23 MB, e o estado inteiro era regravado a cada 10 s. A bolsa
      // chega do servidor a cada conexao, entao guardar nao serve para nada.
      // 'salvo' pode ser null aqui, e isso JA e a prova: receber 8 ovos nao
      // sujou o estado, entao nao houve gravacao nenhuma. Antes, cada lote
      // chamava save() e regravava o arquivo inteiro.
      const s = window.tst.salvo();
      ok(!s || !s.ovos, 'os ovos NAO foram para o estado salvo (a bolsa vem do servidor)');
      ok(!JSON.stringify(s || {}).includes('data:image'), 'nenhum retrato em data-URL no estado salvo');

      // ---- 11. atividades: o que deve virar linha
      const antes = $('#logList').children.length;
      window.tst.emitir('hl:atividade', { index: 'a1', atividade: { tipo: 'captura', em: Date.now(), ovo: ovoSSS } });
      window.tst.emitir('hl:atividade', { index: 'a1', atividade: { tipo: 'chocou', em: Date.now(), txt: 'O ovo chocou! Agumon nasceu.' } });
      // 'raro' vem marcado do processo principal, pelo catalogo do jogo.
      window.tst.emitir('hl:atividade', { index: 'a1', atividade: { tipo: 'drop', em: Date.now(), item: 'Boss Token', de: 'Bloomlordmon', raro: true } });
      window.tst.emitir('hl:atividade', { index: 'a1', atividade: { tipo: 'drop', em: Date.now(), item: 'Peca de Chip AoE', de: 'Bloomlordmon', raro: true } });
      window.tst.emitir('hl:atividade', { index: 'a1', atividade: { tipo: 'sniper', em: Date.now() } });
      window.tst.emitir('hl:atividade', { index: 'a1', atividade: { tipo: 'ferramenta', em: Date.now(), tool: 'sniper', txt: 'comprei #42 (Boss Token) por 1200 gemas' } });
      await esperar(80);
      const L = $('#logList').textContent;
      ok($('#logList').children.length > antes, 'as atividades viraram linhas');
      ok(/ovo SSS P5 \\[UX\\]/.test(L), 'a captura mostra letra, potencia e UX (' + L.slice(0,0) + ')');
      ok(L.includes('O ovo chocou'), 'o ovo chocado aparece (e um toast, nao um log do jogo)');
      ok(L.includes('Boss Token'), 'o item raro dropado aparece');
      ok(L.includes('Chip AoE'), 'o AoE dropado aparece');
      ok(L.includes('sniper comprou Boss Token por 1.200 D-Dol'), 'a compra do sniper aparece com item e valor em D-Dol');

      // A venda de ovos da ferramenta e 'ovo.vender': o NPC da Loja, nao o
      // Mercado entre players. Nao pode mais virar linha.
      const nv = $('#logList').children.length;
      window.tst.emitir('hl:atividade', { index: 'a1', atividade: { tipo: 'ferramenta', em: Date.now(), tool: 'eggs', txt: 'vendeu 7 (tiers D/D/C)' } });
      await esperar(60);
      ok($('#logList').children.length === nv, 'a venda de ovos ao NPC NAO vira linha (nao e o Mercado)');
      ok(!$('#logList').textContent.includes('vendeu 7'), 'e nao sobrou nada dela na tela');

      // ---- 11b. o Mercado da Comunidade: vendas e compras ENTRE PLAYERS
      window.tst.emitir('hl:atividade', { index: 'a1', atividade: {
        tipo: 'mercado', em: Date.now(), vendi: true, oque: 'digimon', especie: 'agumon',
        nome: 'Agumon', qtd: 1, preco: 25000, moeda: 'bits', outro: 'fulano', potencia: 5, shiny: true } });
      window.tst.emitir('hl:atividade', { index: 'a1', atividade: {
        tipo: 'mercado', em: Date.now(), vendi: false, oque: 'item', item: 'token-boss',
        nome: 'Boss Token', qtd: 3, preco: 400, moeda: 'gemas', outro: 'sicrano' } });
      await esperar(80);
      const M = $('#logList').textContent;
      ok(/vendeu Agumon P5 ✦ por 25\.000 bits para fulano/.test(M), 'a VENDA entre players aparece inteira (veio: ' + M.slice(0, 0) + ')');
      ok(/comprou 3× Boss Token por 1\.200 D-Dol de sicrano/.test(M), 'a COMPRA mostra quantidade, total (3x400) e D-Dol');

      // A Protecao de Ovo esta no bolso dos raros, mas cai a toda hora.
      const n1 = $('#logList').children.length;
      window.tst.emitir('hl:atividade', { index: 'a1', atividade: { tipo: 'drop', em: Date.now(), item: 'Proteção de Ovo', de: 'Bloomlordmon', raro: true } });
      await esperar(60);
      ok($('#logList').children.length === n1, 'a Protecao de Ovo e IGNORADA mesmo marcada como rara (cai demais)');
      // O que o jogo NAO chama de raro tambem nao entra: a "Energia de Ovo" e
      // categoria 'datas' e cai a cada poucos abates.
      window.tst.emitir('hl:atividade', { index: 'a1', atividade: { tipo: 'drop', em: Date.now(), item: 'Energia de Ovo Bird Instável', de: 'Bloomlordmon', raro: false } });
      await esperar(60);
      ok($('#logList').children.length === n1, 'drop comum (raro:false) nao vira linha');
      ok(!$('#logList').textContent.includes('Energia de Ovo'), 'e a Energia de Ovo nao aparece');
      // Um log de ferramenta que nao e venda nem compra tambem nao vira linha.
      window.tst.emitir('hl:atividade', { index: 'a1', atividade: { tipo: 'ferramenta', em: Date.now(), tool: 'hunt', txt: 'passo falhou: timeout' } });
      await esperar(60);
      ok($('#logList').children.length === n1, 'ruido das ferramentas ("passo falhou") nao enche a Atividade');

      // ---- 12. filtros da Atividade
      ok(!!chip('#logChips', 'Ovos'), 'tem o filtro Ovos');
      chip('#logChips', 'Ovos').click();
      await esperar(40);
      ok([...$('#logList').children].every(e => e.className.includes('ovo')), 'o filtro Ovos deixa so linhas de ovo');
      chip('#logChips', 'Mercado').click();
      await esperar(40);
      const m = [...$('#logList').children];
      // A venda e a compra entre players, mais a compra do sniper.
      ok(m.length === 3, 'o filtro Mercado deixa as 2 negociacoes e a compra do sniper (veio: ' + m.length + ')');
      chip('#logChips', 'Chocados').click();
      await esperar(40);
      ok($('#logList').textContent.includes('chocou'), 'o filtro Chocados acha o ovo chocado');
      chip('#logChips', 'Tudo').click();
      await esperar(40);

      // ---- 12b. filtro personalizado dos ovos
      // O pedido: "SSS P1 ao P5, SS P4 ao P5". E um OU entre regras, porque
      // nenhum ovo e SSS e SS ao mesmo tempo.
      ok(!!chip('#ovoChips', '+ Filtro'), 'ha um botao para criar um filtro proprio');
      chip('#ovoChips', '+ Filtro').click();
      await esperar(120);
      const ed = $('#modalRoot');
      ok(ed && ed.children.length > 0, 'o editor de filtro abriu');
      const linhas = [...ed.querySelectorAll('.ovof-linha')];
      ok(linhas.length === 7, 'tem uma linha por letra, SSS ate D (veio: ' + linhas.length + ')');

      const porLetra = (L) => linhas.find(l => l.querySelector('.ovo-tier').textContent.trim() === L);
      // SSS: P1 ao P5 (o padrao ja e 1..5, so marcar).
      porLetra('SSS').querySelector('input[type=checkbox]').click();
      // SS: so P4 e P5.
      porLetra('SS').querySelector('input[type=checkbox]').click();
      const selsSS = porLetra('SS').querySelectorAll('select');
      selsSS[0].value = '4'; selsSS[0].dispatchEvent(new Event('change'));
      await esperar(40);
      const resumoEd = () => [...ed.querySelectorAll('.help')].map(e => e.textContent).join(' | ');
      ok(ed.textContent.includes('SSS P1–P5'), 'o resumo descreve a regra SSS (veio: ' + resumoEd() + ')');
      ok(ed.textContent.includes('SS P4–P5'), 'e a regra SS P4-P5');
      ok(/4 de 8 ovo/.test(resumoEd()), 'e diz quantos ovos das contas passariam, antes de salvar (veio: ' + resumoEd() + ')');

      ed.querySelector('input.inp').value = 'Os bons';
      [...ed.querySelectorAll('button')].find(b => b.textContent.includes('Salvar')).click();
      await esperar(700);
      ok(!!chip('#ovoChips', 'Os bons'), 'o filtro salvo virou um botao com o nome dado');
      ok(chip('#ovoChips', 'Os bons').classList.contains('active'), 'e ja ficou selecionado (foi para isso que ele o criou)');
      const sf = window.tst.salvo();
      ok(sf && Array.isArray(sf.ovoFiltros) && sf.ovoFiltros.length === 1, 'o filtro foi SALVO no estado (sobrevive ao reinicio)');
      ok(sf && sf.ovoFiltros[0].regras.length === 2, 'com as duas regras');

      // As duas contas mandaram os mesmos 4 ovos: 2 SSS P5, 2 SS P4 e 4 B.
      // A regra SSS P1-P5 pega os 2 SSS; a SS P4-P5 pega os 2 SS P4. Os B
      // ficam de fora. Total: 4.
      const vistos = [...$('#ovoList').children].map(e => e.textContent);
      ok(vistos.length === 4, 'o filtro pega os 2 SSS e os 2 SS P4 (veio: ' + vistos.length + ')');
      ok(!vistos.some(t => t.includes('nota 2.')), 'e nenhum B passou pelo filtro');

      // Um SS P1 nao pode entrar; um SS P5 pode. Prova a faixa de potencia.
      // A bolsa substitui: mando os 4 de antes MAIS os dois novos.
      window.tst.emitir('hl:bolsa', { index: 'a1', ovos: ${OVOS}.concat([
        { id: 901, especie: 'agumon', nome: 'Agumon', letra: 'SS', nota: 7, potencia: 1, shiny: false, travado: false, data: 0, nivel: 1, em: Date.now() + 10 },
        { id: 902, especie: 'agumon', nome: 'Agumon', letra: 'SS', nota: 7, potencia: 5, shiny: false, travado: false, data: 0, nivel: 1, em: Date.now() + 11 },
      ]) });
      await esperar(120);
      const vistos2 = [...$('#ovoList').children].map(e => e.textContent);
      ok(vistos2.length === 5, 'o SS P5 entrou (4+1) e o SS P1 ficou de fora (veio: ' + vistos2.length + ')');
      ok(!vistos2.some(t => t.includes('P1')), 'nenhum ovo P1 esta na lista: a faixa de potencia vale');

      // Apagar o filtro: o X do proprio chip.
      chip('#ovoChips', 'Os bons').querySelector('.chip-x').click();
      await esperar(120);
      const cxf = $('#modalRoot');
      ok(cxf && cxf.textContent.includes('Os bons'), 'apagar o filtro pergunta antes, dizendo qual');
      [...cxf.querySelectorAll('button')].find(b => b.textContent.trim() === 'Apagar').click();
      await esperar(700);
      ok(!chip('#ovoChips', 'Os bons'), 'o filtro sumiu dos botoes');
      ok((window.tst.salvo().ovoFiltros || []).length === 0, 'e do estado salvo');
      ok($('#ovoList').children.length === 10, 'e a lista voltou a mostrar todos os ovos (veio: ' + $('#ovoList').children.length + ')');

      // ---- 13. nao ha botao de apagar
      // Nao existe nada guardado para apagar: a lista esvazia sozinha quando a
      // venda automatica leva os ovos (testado no passo 7).
      ok(!$('#ovosClear'), 'nao ha botao de apagar (nada e guardado em disco)');
      ok(txt('#dash').includes('Ovos e digimons nas contas'), 'o titulo diz o que a lista e: o que as contas TEM agora, ovo e digimon');
    } catch (e) {
      out.push('FALHA excecao: ' + ((e && e.stack) || e));
    }
    return out.join('\\n');
  })()`.replace('ovoSSS', JSON.stringify(ovo({ letra: 'SSS', potencia: 5, shiny: true, scanner: 'ux', nome: 'Agumon' }))));

  fs.writeFileSync(SAIDA, r + '\n');
  console.log(r);
  const falhas = (r.match(/^FALHA/gm) || []).length;
  console.log(falhas ? `\n=== FALHOU: ${falhas} caso(s) ===` : '\n=== PASS: o Painel novo funciona ===');
  app.exit(falhas ? 1 : 0);
}).catch((e) => { console.log('FATAL ' + ((e && e.stack) || e)); app.exit(1); });
