#!/usr/bin/env node
/**
 * O Auto Seller contra o servidor REAL. Por padrao, SEM ANUNCIAR NADA.
 *
 * Por que este teste existe, tendo os outros tres:
 *   - test-seller-tool.js e test-seller-headless.js provaram a LOGICA, mas
 *     contra um mercado de mentira que eu mesmo escrevi. Se a minha ideia do
 *     pacote estiver errada, o mock esta errado do mesmo jeito e o teste passa
 *     feliz. Foi exatamente assim que ids inventados (chip-fogo) sobreviveram a
 *     85 verificacoes.
 *   - test-seller-form.js provou a TELA, com um `deck` falso.
 *
 * Este fecha o buraco: servidor de verdade. Ele responde a UMA pergunta que
 * nenhum mock pode responder — a media de 7 dias chega mesmo no campo
 * media[moeda] da resposta de 'mercado.listar'? Toda a ferramenta depende disso.
 *
 * DOIS MODOS:
 *
 *   (padrao, so leitura)  electron.exe test-seller-vivo.js
 *     Le a mochila, pede a media de cada item que a conta tem e mostra o que a
 *     ferramenta anunciaria. 'mercado.anunciar' e INTERCEPTADO: nada e enviado.
 *
 *   (--anunciar)          electron.exe test-seller-vivo.js --anunciar
 *     Anuncia UMA unidade de UM item de verdade e depois CANCELA, dentro da
 *     janela de 2 min em que o anuncio fica retido e ninguem pode compra-lo.
 *     Confirmado na fonte do jogo (menus2.js):
 *       L359  todo anuncio fica retido 2 min;
 *       L1169 item nao paga pensao nem prazo (so Digimon paga, 100k bits/dia);
 *       L936  'mercado.cancelar' devolve o que estava a venda.
 *     Ou seja: reversivel e sem custo. Ainda assim, so roda se voce pedir.
 *
 * Uso: .\node_modules\electron\dist\electron.exe test-seller-vivo.js [persist:...] [--anunciar]
 */
'use strict';
const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');

const DATA_DIR = require('./perfil-real').usar();
const SAIDA = path.join(__dirname, 'seller-vivo.txt');
const out = [];
// Esta sonda fica minutos no ar. Se quem a chamou fechar a saida antes disso, o
// console.log seguinte escreve num cano sem a outra ponta e estoura EPIPE — e
// como ninguem trata, o Electron levanta o dialogo de "erro no processo
// principal" sem relacao nenhuma com o que a sonda media.
process.stdout.on('error', () => {});
process.stderr.on('error', () => {});
const log = (...a) => { const t = a.join(' '); out.push(t); try { console.log(t); } catch {} try { fs.writeFileSync(SAIDA, out.join('\n') + '\n'); } catch {} };

const { SESSION_COOKIE } = require('./src/headless/cookies');
const particaoPedida = process.argv.find((a) => a.startsWith('persist:')) || null;
const ANUNCIAR = process.argv.includes('--anunciar');

let falhas = 0;
const ok = (cond, txt) => { log(`  ${cond ? 'OK  ' : 'FALHA'} ${txt}`); if (!cond) falhas++; };
const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function particoesComSessao() {
  const dir = path.join(DATA_DIR, 'Partitions');
  if (!fs.existsSync(dir)) return [];
  const achadas = [];
  for (const nome of fs.readdirSync(dir)) {
    const part = `persist:${nome}`;
    try {
      const cks = await session.fromPartition(part).cookies.get({ url: 'https://digiidle.com/' });
      if (cks.some((c) => c.name === SESSION_COOKIE)) achadas.push(part);
    } catch {}
  }
  return achadas;
}

async function main() {
  await app.whenReady();
  log('--- O AUTO SELLER no MERCADO REAL ---');
  log(ANUNCIAR
    ? '(modo --anunciar: UM anuncio de 1 unidade, cancelado em seguida)\n'
    : '(modo seguro: mercado.anunciar e interceptado, NADA e enviado)\n');

  const todas = await particoesComSessao();
  if (!todas.length) { log('nenhuma conta com sessao. Entre numa conta pelo app primeiro.'); return fim(1); }
  const partition = particaoPedida || todas[0];
  log(`contas com sessao: ${todas.length} | usando: ${partition}\n`);

  // O catalogo, como o renderer carrega (e de onde saem os nomes bonitos).
  const win = {};
  new Function('window', fs.readFileSync(path.join(__dirname, 'src/renderer/tools.js'), 'utf8'))(win);
  const DDTools = win.DDTools;
  const nomeDe = (id) => (DDTools.MERCADO_ITENS.find((i) => i.id === id) || {}).nome || id;

  const { DigiiIdleHeadlessClient } = require('./src/headless/client');
  const c = new DigiiIdleHeadlessClient('seller', partition, { name: 'seller-vivo' });

  await new Promise((r) => {
    let f = 0; const go = () => { if (!f++) r(); };
    c.on('update', go); c.on('error', (m) => { log('erro: ' + m); go(); });
    setTimeout(go, 30000); c.connect();
  });
  if (!c.connected) { log('nao conectou. Feche a conta no app, se estiver aberta.'); return fim(1); }
  log(`conta: ${c.state.nick} | bits ${fmt(c.state.bits)} | D-Dol ${fmt(c.state.gemas)}\n`);

  // ----------------------------------------------- 1. A MOCHILA, de verdade
  log('=== 1. A MOCHILA (o que o manager.mochila() devolveria) ===');
  const itens = c.state.itens || {};
  const vendaveis = Object.entries(itens)
    .filter(([id, n]) => n > 0 && DDTools.vendavel(id))
    .sort((a, b) => b[1] - a[1]);
  log(`  itens na mochila: ${Object.keys(itens).length} | negociaveis no Mercado: ${vendaveis.length}`);
  for (const [id, n] of vendaveis.slice(0, 15)) log(`    ${fmt(n).padStart(6)} × ${nomeDe(id)}  (${id})`);
  if (!vendaveis.length) log('    (nenhum item negociavel — o Auto Seller nao teria o que anunciar nesta conta)');

  // ------------------------------- 2. A MEDIA DE 7 DIAS, direto do servidor
  // Esta e a pergunta que nenhum mock responde: o campo existe mesmo?
  log('\n=== 2. A MEDIA DE 7 DIAS (a pergunta que o mock nao responde) ===');
  const pedir = (item, moeda) => new Promise((resolve) => {
    const fim2 = (r) => { c.removeListener('mercado', ouvir); clearTimeout(t); resolve(r); };
    const ouvir = (m) => fim2(m);
    const t = setTimeout(() => fim2(null), 10000);
    c.on('mercado', ouvir);
    if (!c.sendCommand('mercado.listar', { tipo: 'item', especie: item, moeda })) fim2(null);
  });

  const amostra = vendaveis.slice(0, 5);
  const medidos = [];
  let temCampoMedia = false;
  for (const [id, qtd] of amostra) {
    for (const moeda of ['bits', 'gemas']) {
      const m = await pedir(id, moeda);
      if (!m) { log(`  ${nomeDe(id)} / ${moeda}: o servidor NAO respondeu em 10 s`); continue; }
      const md = (m.media || {})[moeda];
      if (m.media && typeof m.media === 'object' && Object.keys(m.media).length) temCampoMedia = true;
      const lista = (m.lista || []).filter((a) => a.item === id && a.moeda === moeda);
      const meu = lista.find((a) => a.meu);
      const outros = lista.filter((a) => !a.meu);
      const nm = moeda === 'gemas' ? 'D-Dol' : 'bits';
      if (md && md.media > 0) {
        const preco = Math.round(md.media);
        medidos.push({ id, qtd, moeda, preco, mediaQtd: md.qtd || 0, menor: (outros[0] || {}).preco || 0, meu: meu || null });
        log(`  ${nomeDe(id)} / ${nm}: media ${fmt(preco)} (sobre ${fmt(md.qtd || 0)} venda(s))`
          + ` | abertos ${lista.length}${outros[0] ? `, mais barato ${fmt(outros[0].preco)}` : ''}`
          + `${meu ? ` | VOCE JA TEM ${fmt(meu.qtd)} a ${fmt(meu.preco)}` : ''}`);
      } else {
        log(`  ${nomeDe(id)} / ${nm}: SEM media (ninguem vendeu em 7 dias) | abertos ${lista.length}`);
      }
      await espera(400);   // sem martelar o servidor
    }
  }

  log('\n=== 3. VEREDITO DA LEITURA ===');
  ok(c.connected, 'a conta conectou e o estado chegou');
  ok(Object.keys(itens).length > 0, 'a mochila chegou no estado (e o que manager.mochila() devolve)');
  if (amostra.length) {
    ok(temCampoMedia, "a resposta de 'mercado.listar' traz o campo media[moeda] — a base de toda a ferramenta");
    ok(medidos.length > 0, `o servidor deu media para ${medidos.length} par(es) item/moeda`);
  } else {
    log('  (sem item negociavel na mochila: nao deu para medir a media. Nao e falha da ferramenta.)');
  }

  // ------------------------------------ 4. O QUE A FERRAMENTA FARIA, em seco
  log('\n=== 4. O QUE O AUTO SELLER ANUNCIARIA (nada foi enviado) ===');
  const { ToolSeller } = require('./src/headless/tools');
  const cfgSeco = {
    itens: vendaveis.slice(0, 5).map(([id]) => ({ item: id, moeda: 'bits', precoManual: 0, precoMinimo: 0 })),
    intervaloSec: 300, maxPorHora: 0,
  };
  const tentativas = [];
  const realSend = c.sendCommand.bind(c);
  c.sendCommand = (t, d) => {
    if (t === 'mercado.anunciar') {
      // A trava do modo seguro: a ferramenta acha que anunciou, o servidor
      // nunca soube.
      tentativas.push(d);
      log(`  >>> ANUNCIARIA: ${fmt(d.qtd)}× ${nomeDe(d.item)} a ${fmt(d.preco)} ${d.moeda === 'gemas' ? 'D-Dol' : 'bits'} cada (NAO ENVIADO)`);
      return true;
    }
    return realSend(t, d);
  };
  const seco = new ToolSeller(c, cfgSeco);
  seco.running = true; seco.pronto = true;
  if (cfgSeco.itens.length) {
    await seco.step();
    ok(tentativas.every((d) => d.preco > 0), 'nenhuma tentativa saiu com preco zero');
    ok(tentativas.every((d) => d.tipo === 'item' && d.item && d.qtd > 0), 'toda tentativa levou tipo, item e qtd');
    const semMedia = tentativas.filter((d) => !medidos.some((m) => m.id === d.item && m.moeda === d.moeda && m.preco === d.preco));
    ok(semMedia.length === 0, 'todo preco tentado bate com a media que o servidor devolveu (sem acrescimo nem desconto)');
    if (!tentativas.length) log('  (nada a anunciar: nenhum dos itens tem media em bits)');
  } else {
    log('  (mochila sem item negociavel: nada a simular)');
  }
  seco.stop();
  c.sendCommand = realSend;

  // ------------------------------------------- 5. O ANUNCIO DE VERDADE
  if (!ANUNCIAR) {
    log('\n(para anunciar 1 unidade de verdade e cancelar em seguida: --anunciar)');
  } else {
    log('\n=== 5. UM ANUNCIO DE VERDADE, DEPOIS CANCELADO ===');
    // Escolhe o item com MAIS unidades e que ja tem media: anunciar 1 de 50
    // e o menor risco possivel, e a media prova que ha mercado para ele.
    const alvo = medidos
      .filter((m) => m.moeda === 'bits' && m.qtd >= 2 && !m.meu)
      .sort((a, b) => b.qtd - a.qtd)[0];
    if (!alvo) {
      log('  nenhum item seguro para o teste (precisa de >= 2 unidades, media em bits e nenhum anuncio seu aberto).');
      log('  Um anuncio seu ja aberto faria o jogo SOMAR as unidades nele, e o teste nao seria limpo.');
    } else {
      const antes = Math.max(0, (c.state.itens || {})[alvo.id] || 0);
      log(`  item: ${nomeDe(alvo.id)} | na mochila: ${fmt(antes)} | media: ${fmt(alvo.preco)} bits`);
      log('  anunciando 1 unidade pela media...');

      const tool = new ToolSeller(c, {
        itens: [{ item: alvo.id, moeda: 'bits', precoManual: 0, precoMinimo: 0 }],
        intervaloSec: 300, maxPorHora: 0,
      });
      tool.running = true; tool.pronto = true;
      // A ferramenta anuncia TUDO o que esta na mochila, por desenho. Para o
      // teste, 1 unidade basta: o que se quer provar e que o servidor aceita o
      // comando e o item sai da mochila, nao o tamanho do lote.
      const envioReal = c.sendCommand.bind(c);
      let enviado = null;
      c.sendCommand = (t, d) => {
        if (t === 'mercado.anunciar') { enviado = { ...d, qtd: 1 }; return envioReal(t, enviado); }
        return envioReal(t, d);
      };
      await tool.step();
      c.sendCommand = envioReal;

      ok(!!enviado, 'a ferramenta montou e enviou o comando de anuncio');
      if (enviado) {
        ok(enviado.preco === alvo.preco, `o preco enviado e a media EXATA: ${fmt(enviado.preco)} (media ${fmt(alvo.preco)})`);

        // A prova de que saiu: o item DIMINUI na mochila. O jogo nao responde
        // ao comando, entao esta e a unica confirmacao que existe.
        log('  esperando a mochila confirmar (o jogo nao responde ao comando)...');
        let depois = antes;
        for (let i = 0; i < 20 && depois >= antes; i++) { await espera(500); depois = Math.max(0, (c.state.itens || {})[alvo.id] || 0); }
        ok(depois < antes, `a mochila diminuiu: ${fmt(antes)} -> ${fmt(depois)} (prova de que o anuncio saiu)`);
        ok(depois === antes - 1, `saiu exatamente 1 unidade: ${fmt(antes - depois)}`);

        // Acha o anuncio recem-criado para cancelar.
        await espera(1000);
        const m = await pedir(alvo.id, 'bits');
        const meu = ((m && m.lista) || []).find((a) => a.meu && a.item === alvo.id);
        ok(!!meu, 'o anuncio aparece no Mercado como SEU');
        if (meu) {
          const retido = meu.libera > (m.agora || Date.now());
          ok(retido, 'o anuncio esta RETIDO (os 2 min em que ninguem pode compra-lo)');
          log(`    anuncio #${meu.id}: ${fmt(meu.qtd)}× a ${fmt(meu.preco)} bits${retido ? ' · retido' : ''}`);
          ok(meu.preco === alvo.preco, `o servidor registrou o preco da media, sem mexer: ${fmt(meu.preco)}`);

          log('  cancelando (o item volta para a mochila; item nao paga pensao)...');
          c.sendCommand('mercado.cancelar', { id: meu.id });
          let volta = depois;
          for (let i = 0; i < 20 && volta <= depois; i++) { await espera(500); volta = Math.max(0, (c.state.itens || {})[alvo.id] || 0); }
          ok(volta === antes, `o item VOLTOU para a mochila: ${fmt(volta)} (era ${fmt(antes)} no comeco)`);
          if (volta !== antes) log(`    ATENCAO: a mochila esta em ${fmt(volta)}, nao ${fmt(antes)}. Confira o anuncio #${meu.id} no jogo.`);
        }
      }
      tool.stop();
    }
  }

  log(`\n=== RESULTADO: ${falhas ? falhas + ' FALHA(S)' : 'TUDO OK'} ===`);
  log(`relatorio: ${SAIDA}`);
  try { c.disconnect(); } catch {}
  fim(0);
}

function fim(c) { setTimeout(() => app.exit(c || falhas ? 1 : 0), 400); }
main().catch((e) => { log('FATAL: ' + (e.stack || e)); fim(1); });
