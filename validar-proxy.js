#!/usr/bin/env node
'use strict';

const http = require('http');

const PROXY_HOST = '142.111.227.116';
const PROXY_PORT = 6311;
const PROXY_USER = 'namqzjdj';
const PROXY_PASS = 'x3au9mgsuwz6';

console.log('\n🧪 Validando proxy Webshare');
console.log('=' .repeat(60));
console.log(`\n📍 Proxy: ${PROXY_HOST}:${PROXY_PORT}`);
console.log(`   User: ${PROXY_USER}`);

console.log('\n⏳ Testando conexão ao proxy...\n');

// Tentar conectar ao proxy diretamente
const socket = require('net').createConnection({
  host: PROXY_HOST,
  port: PROXY_PORT,
});

const timeout = setTimeout(() => {
  socket.destroy();
  console.error('❌ Timeout: Proxy não respondeu em 10 segundos');
  process.exit(1);
}, 10000);

socket.on('connect', () => {
  clearTimeout(timeout);
  console.log('✅ Conectado ao proxy com sucesso!');
  console.log('=' .repeat(60));
  console.log('\n   ✓ Host:port está acessível');
  console.log('   ✓ Proxy está online e respondendo');
  console.log('\n🚀 Pronto para testar no DesDeck!');
  console.log('=' .repeat(60) + '\n');
  socket.destroy();
});

socket.on('error', (err) => {
  clearTimeout(timeout);
  console.error('❌ Erro ao conectar:', err.message);
  console.error('\n💡 Possíveis causas:');
  console.error('   - Proxy está offline');
  console.error('   - Host:port incorreto');
  console.error('   - Firewall bloqueando conexão');
  console.error('   - IP do proxy expirou (se temporário)');
  process.exit(1);
});
