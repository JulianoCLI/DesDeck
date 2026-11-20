#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/renderer/app.js');
let content = fs.readFileSync(filePath, 'utf8');

console.log('Adding Phase 4 UI for bootHeadless...\n');

// Add bootHeadless checkbox input
const addInputPatch = `    economy: cb('economy'),`;
const addInputNew = `    economy: cb('economy'),
    bootHeadless: cb('bootHeadless'),`;

content = content.replace(addInputPatch, addInputNew);
console.log('✓ Added bootHeadless input');

// Add to collect list
const collectPatch = `for (const k of ['closeToTray', 'preventSleep', 'openAtLogin', 'sound', 'notifications', 'flash', 'notifyEveryDrop', 'reloadAfterOutage', 'remotePrivacy', 'economy']) s[k] = inputs[k].checked;`;

const collectNew = `for (const k of ['closeToTray', 'preventSleep', 'openAtLogin', 'sound', 'notifications', 'flash', 'notifyEveryDrop', 'reloadAfterOutage', 'remotePrivacy', 'economy', 'bootHeadless']) s[k] = inputs[k].checked;`;

content = content.replace(collectPatch, collectNew);
console.log('✓ Added bootHeadless to collect list');

// Add UI checkRow after economy
const uiPatch = `        checkRow(inputs.economy, 'Economia de recursos (recomendado)', 'Conta que não está na tela (outra tela, atrás da principal, painel, bloqueio, janela minimizada ou na bandeja) para de desenhar e segue jogando. No DigiIdle o servidor continua caçando e manda só o estado. Bem menos CPU, GPU e rede. Contas de outros jogos já vêm com "Sempre desenhar" marcado (dá para desmarcar na conta, se o jogo seguir rodando oculto).'),`;

const uiNew = `        checkRow(inputs.economy, 'Economia de recursos (recomendado)', 'Conta que não está na tela (outra tela, atrás da principal, painel, bloqueio, janela minimizada ou na bandeja) para de desenhar e segue jogando. No DigiIdle o servidor continua caçando e manda só o estado. Bem menos CPU, GPU e rede. Contas de outros jogos já vêm com "Sempre desenhar" marcado (dá para desmarcar na conta, se o jogo seguir rodando oculto).'),
        checkRow(inputs.bootHeadless, 'Iniciar todas as contas em modo headless', 'Sem renderizar a interface: apenas WebSocket. Reduz RAM de 2.5 GB para 600 MB com 5 contas. Pode usar o botão de poder em cada conta para alternar dinamicamente.'),`;

content = content.replace(uiPatch, uiNew);
console.log('✓ Added bootHeadless UI row');

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nPhase 4 UI added successfully!');
