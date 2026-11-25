#!/usr/bin/env node
'use strict';

/**
 * Teste de Fase C: Validação contra servidor DigiIdle real
 * 
 * Uso:
 *   node test-fase-c.js --proxy host:port:user:pass
 *   node test-fase-c.js --proxy host:port:user:pass --batch
 */

const path = require('path');
const { net, session } = require('electron');

// Parse arguments
const args = process.argv.slice(2);
const proxyArg = args.find(a => a.startsWith('--proxy='));
const isBatch = args.includes('--batch');

if (!proxyArg) {
  console.error('❌ Uso: node test-fase-c.js --proxy=host:port:user:pass [--batch]');
  process.exit(1);
}

const proxyStr = proxyArg.split('=')[1];
const { host, port, user, pass } = parseProxyString(proxyStr);

if (!host || !port) {
  console.error('❌ Proxy inválido:', proxyStr);
  process.exit(1);
}

function parseProxyString(str) {
  if (!str) return {};
  const parts = str.split(':');
  return {
    host: parts[0],
    port: parseInt(parts[1], 10),
    user: parts[2] || '',
    pass: parts[3] || '',
  };
}

// ============================================================================
// TESTE 1: Validar proxy (testar IP de saída)
// ============================================================================

async function testarProxy() {
  console.log('\n📋 TESTE 1: Validar Proxy');
  console.log(`   Host: ${host}:${port}`);
  
  const testSession = session.fromPartition('digideck-proxy-test-fase-c');
  
  try {
    const proxyUrl = `http://${host}:${port}`;
    await testSession.setProxy({ proxyRules: proxyUrl, proxyBypassRules: '<-loopback>' });
    testSession.forceReloadProxyConfig();
    
    const data = await new Promise((resolve, reject) => {
      const req = net.request({ url: 'https://api.ipify.org?format=json', session: testSession });
      const timer = setTimeout(() => { req.abort(); reject(new Error('timeout')); }, 15000);
      
      req.on('login', (authInfo, cb) => {
        if (user && pass) cb(user, pass);
        else { clearTimeout(timer); req.abort(); reject(new Error('proxy pediu auth')); }
      });
      
      req.on('response', (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          clearTimeout(timer);
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
          } else {
            try { resolve(JSON.parse(body)); } catch { reject(new Error('JSON inválido')); }
          }
        });
      });
      
      req.on('error', (err) => { clearTimeout(timer); reject(err); });
      req.end();
    });
    
    console.log(`   ✅ Proxy funciona! IP: ${data.ip}`);
    return true;
  } catch (err) {
    console.error(`   ❌ Proxy falhou: ${err.message}`);
    return false;
  } finally {
    try { await testSession.setProxy({ mode: 'direct' }); } catch { }
  }
}

// ============================================================================
// TESTE 2: Validar criação de conta (1 prova)
// ============================================================================

async function testarCriacao() {
  console.log('\n📋 TESTE 2: Validar Criação de Conta (1 Prova)');
  
  const rede = require('./src/headless/rede');
  const proxyGuard = require('./src/proxy-guard');
  
  const nick = `testec${Date.now() % 10000}`;
  const email = `${nick}@gmail.com`;
  const senha = 'TestC1234!';
  const partition = `persist:acc-${nick}`;
  
  console.log(`   Email: ${email}`);
  console.log(`   Nick:  ${nick}`);
  
  try {
    // Aplicar proxy
    const ses = session.fromPartition(partition);
    proxyGuard.arm(ses);
    const proxyObj = { host, port, user, pass: pass || '' };
    const ok = await proxyGuard.apply(ses, proxyObj);
    
    if (!ok) {
      console.error('   ❌ Não consegui aplicar proxy');
      return false;
    }
    
    console.log('   ✓ Proxy aplicado');
    
    // Criar conta
    const corpo = {
      email,
      senha,
      termos: true,
      lang: 'pt',
    };
    
    const buffer = await rede.requisitar('https://digiidle.com/auth/criar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      partition,
    });
    
    const resultado = JSON.parse(buffer.toString('utf8'));
    
    if (!resultado.ok) {
      console.error(`   ❌ Criação falhou: ${resultado.erro} - ${resultado.mensagem}`);
      return false;
    }
    
    console.log('   ✅ Conta criada com sucesso');
    
    // Aguardar um pouco para cookies serem persistidos
    await new Promise(r => setTimeout(r, 2000));
    
    // Verificar
    const bufferVerif = await rede.requisitar('https://digiidle.com/auth/conta', {
      method: 'GET',
      partition,
    });
    
    const verif = JSON.parse(bufferVerif.toString('utf8'));
    
    if (!verif.nick) {
      console.error('   ❌ Verificação falhou: nick não foi definido');
      return false;
    }
    
    console.log(`   ✅ Verificação OK - Nick: ${verif.nick}`);
    return { email, senha, nick: verif.nick };
    
  } catch (err) {
    console.error(`   ❌ Erro: ${err.message}`);
    return false;
  }
}

// ============================================================================
// TESTE 3: Testar login (prova de que conta é funcional)
// ============================================================================

async function testarLogin(email, senha) {
  console.log('\n📋 TESTE 3: Testar Login');
  console.log(`   Email: ${email}`);
  
  const rede = require('./src/headless/rede');
  const proxyGuard = require('./src/proxy-guard');
  
  const partition = `persist:login-test-${Date.now()}`;
  
  try {
    // Aplicar proxy
    const ses = session.fromPartition(partition);
    proxyGuard.arm(ses);
    const proxyObj = { host, port, user, pass: pass || '' };
    const ok = await proxyGuard.apply(ses, proxyObj);
    
    if (!ok) {
      console.error('   ❌ Não consegui aplicar proxy');
      return false;
    }
    
    // Fazer login
    const corpo = {
      email,
      senha,
    };
    
    const buffer = await rede.requisitar('https://digiidle.com/auth/entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      partition,
    });
    
    const resultado = JSON.parse(buffer.toString('utf8'));
    
    if (!resultado.ok) {
      console.error(`   ❌ Login falhou: ${resultado.erro}`);
      return false;
    }
    
    console.log('   ✅ Login bem-sucedido!');
    
    // Verificar conta pós-login
    const bufferConta = await rede.requisitar('https://digiidle.com/auth/conta', {
      method: 'GET',
      partition,
    });
    
    const conta = JSON.parse(bufferConta.toString('utf8'));
    
    console.log(`   ✅ Conta funcional:`);
    console.log(`      - Nick: ${conta.nick || '(indefinido)'}`);
    console.log(`      - Nível: ${conta.nivel || 0}`);
    console.log(`      - Bits: ${conta.bits || 0}`);
    
    return true;
    
  } catch (err) {
    console.error(`   ❌ Erro: ${err.message}`);
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🧪 Teste de Fase C: Prova de Conceito Real\n');
  console.log(`Configuração: Proxy ${host}:${port}`);
  
  // Teste 1: Validar proxy
  const proxyOK = await testarProxy();
  if (!proxyOK) {
    console.log('\n❌ Proxy não funciona. Parar aqui.');
    process.exit(1);
  }
  
  // Teste 2: Criar 1 conta prova
  const criacao = await testarCriacao();
  if (!criacao) {
    console.log('\n❌ Criação de conta falhou. Parar aqui.');
    process.exit(1);
  }
  
  // Teste 3: Testar login
  const login = await testarLogin(criacao.email, 'TestC1234!');
  if (!login) {
    console.log('\n❌ Login falhou. Conta pode estar com problema.');
    process.exit(1);
  }
  
  // Resumo
  console.log('\n' + '='.repeat(60));
  console.log('✅ TODOS OS TESTES PASSARAM!');
  console.log('='.repeat(60));
  console.log('\nProva de Conceito validada:');
  console.log(`  ✓ Proxy funciona e é aplicado na partição`);
  console.log(`  ✓ Conta criada via ${host}:${port}`);
  console.log(`  ✓ Conta totalmente funcional (login bem-sucedido)`);
  console.log('\n🚀 Sistema pronto para Fase C completa (lote de 10 contas)');
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err.message);
  process.exit(1);
});
