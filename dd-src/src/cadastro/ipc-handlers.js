'use strict';

/**
 * Parseia proxy do formato "host:port:user:pass" ou "user:pass@host:port" ou "host:port"
 * Remove comentário ("// Leveling" ou similar) antes de parsear.
 */
function parseProxyString(str) {
  if (!str || typeof str !== 'string') return null;
  
  str = str.trim();
  
  // Cortar comentário (tudo depois de //)
  const hashIdx = str.indexOf('//');
  if (hashIdx >= 0) {
    str = str.substring(0, hashIdx).trim();
  }
  
  if (!str) return null;
  
  let host, port, user, pass;
  
  // Formato "user:pass@host:port"
  if (str.includes('@')) {
    const [creds, addr] = str.split('@');
    const [u, p] = creds.split(':');
    user = u.trim();
    pass = p?.trim() || '';
    const [h, po] = addr.split(':');
    host = h.trim();
    port = parseInt(po, 10);
  } else {
    // Formato "host:port:user:pass" (Webshare) ou "host:port"
    const parts = str.split(':');
    if (parts.length >= 2) {
      host = parts[0].trim();
      port = parseInt(parts[1], 10);
      if (parts.length === 4) {
        user = parts[2].trim();
        pass = parts[3].trim();
      }
    }
  }
  
  if (!host || !port || isNaN(port) || port < 1 || port > 65535) return null;
  
  return { host, port, user: user || '', pass: pass || '' };
}

/**
 * Handlers IPC para o sistema de cadastro em lote.
 * Registram em ipcMain os seguintes canais:
 * - cadastro:start(config) → { id, evento }
 * - cadastro:status(id) → { status, progresso, ... }
 * - cadastro:stop(id) → { ok }
 * - cadastro:presets() → { presets }
 * - cadastro:validar-senha(senha) → { ok, erro }
 */

const { ipcMain, session } = require('electron');
const { FilaCadastro } = require('./fila');
const { Gerador } = require('./gerador');
const rede = require('../headless/rede');
const proxyGuard = require('../proxy-guard');

// Mapa de filas ativas por ID (para suportar múltiplos lotes em paralelo)
const filas = new Map();
let proximoId = 1;

function registrarHandlersCadastro(handle, net) {
  /**
   * Iniciar lote de cadastro.
   * Input: {
   *   base: string
   *   preset: string ('numeros', 'animais', etc) ou 'custom'
   *   customNicks?: array (se preset === 'custom')
   *   senha: string (validado aqui)
   *   starterFixo?: string (null = aleatório)
   *   proxys?: array de strings (formato 'host:port:user:pass')
   *   ritmo?: { entre: ms, cooldown: ms }
   * }
   * Output: { id, status: 'iniciado' }
   */
  handle('cadastro:start', async (_e, config) => {
    if (!config || typeof config !== 'object') {
      throw new Error('Config inválida');
    }

    // Validar senha
    const valSenha = Gerador.prototype._validarSenha(config.senha);
    if (!valSenha) {
      throw new Error('Senha inválida: mín 12 chars (maiúscula + número + símbolo)');
    }

    // Validar preset
    if (config.preset !== 'custom' && !Gerador.presets().includes(config.preset)) {
      throw new Error(`Preset desconhecido: ${config.preset}`);
    }

    // O starter é obrigatório: "aleatório" não é permitido.
    const STARTERS = ['guilmon', 'renamon', 'terriermon', 'demidevimon'];
    if (!STARTERS.includes(String(config.starterFixo || '').toLowerCase())) {
      throw new Error('Escolha um starter: Guilmon, Renamon, Terriermon ou Demidevimon.');
    }

    // Validar custom
    if (config.preset === 'custom') {
      if (!Array.isArray(config.customNicks)) {
        throw new Error('customNicks deve ser array');
      }
      const valCustom = Gerador.validarCustom(config.customNicks);
      if (!valCustom.ok) {
        throw new Error(`Custom inválido: ${valCustom.erro}`);
      }
    }

    // Quantidade de contas configurável (padrão 10)
    const tamanhoDaFila = (Number(config.tamanho) || 10) >> 0;
    if (tamanhoDaFila < 1 || tamanhoDaFila > 100) {
      throw new Error('Quantidade de contas inválida: use entre 1 e 100');
    }
    const telasDaFila = Math.ceil(tamanhoDaFila / 4);

    // Uma base de nick por tela: é o nick das 4 contas e também o nome que a
    // tela recebe no deck, então exige-se uma por bloco, sem repetir.
    const basesDaFila = [];
    const basesVistas = new Set();
    const basesRecebidas = Array.isArray(config.bases) ? config.bases : [config.base];
    for (let i = 0; i < telasDaFila; i++) {
      const val = Gerador.validarBase(basesRecebidas[i]);
      if (!val.ok) {
        throw new Error(`Base da tela ${i + 1}: ${val.erro}`);
      }
      const chave = val.base.toLowerCase();
      if (basesVistas.has(chave)) {
        throw new Error(`Base repetida: "${val.base}". Cada tela precisa de uma base diferente.`);
      }
      basesVistas.add(chave);
      basesDaFila.push(val.base);
    }

    // Validar e parsear a lista de proxies (lista completa, distribuída sozinha)
    const proxysArray = [];

    if (Array.isArray(config.proxys) && config.proxys.length > 0) {
      const vistos = new Set();
      for (const proxyStr of config.proxys) {
        const parsed = parseProxyString(proxyStr);
        if (!parsed) {
          throw new Error(`Proxy inválido: "${proxyStr}". Use formato host:port:user:pass`);
        }
        const chave = `${parsed.host}:${parsed.port}`;
        if (vistos.has(chave)) continue; // dedupe silencioso
        vistos.add(chave);
        proxysArray.push(parsed);
      }

      // Validar que há proxy suficiente para todas as telas
      if (proxysArray.length < telasDaFila) {
        throw new Error(`Faltam proxies: são ${telasDaFila} telas para ${tamanhoDaFila} contas, precisa de ao menos ${telasDaFila} distintos — obtido ${proxysArray.length}.`);
      }
    }

    // Criar nova fila
    const id = proximoId++;
    const partition = `persist:cadastro-${id}`;
    const sessao = session.fromPartition(partition);

    const fila = new FilaCadastro({
      base: basesDaFila[0],
      bases: basesDaFila,
      preset: config.preset || 'numeros',
      customNicks: config.customNicks || null,
      senha: config.senha,
      starterFixo: config.starterFixo || null,
      tamanho: tamanhoDaFila,
      listaProxys: proxysArray,
      ritmo: config.ritmo || { entre: 5000, cooldown: 2000 },
      net,
      session: sessao,
      rede,
      proxyGuard,
    });

    // Rastrear eventos
    const relatorio = {
      id,
      status: 'em_progresso',
      progresso: 0,
      total: tamanhoDaFila,
      confirmadas: 0,
      falhadas: 0,
      contas: [],
      erro: null,
    };

    fila.on('inicio', (ev) => {
      relatorio.total = ev.tamanho;
    });

    fila.on('conta', (ev) => {
      const idx = relatorio.contas.findIndex((c) => c.indice === ev.indice);
      const dados = {
        indice: ev.indice,
        status: ev.status,
        motivo: ev.motivo,
        tela: ev.tela,
        // O que o renderer precisa para montar a tela da conta confirmada.
        ...(ev.resultado ? {
          baseNick: ev.resultado.baseNick,
          contaId: ev.resultado.contaId,
          nick: ev.resultado.nick,
          email: ev.resultado.email,
          senha: ev.resultado.senha,
          proxy: ev.resultado.proxy,
        } : {}),
      };
      if (idx >= 0) Object.assign(relatorio.contas[idx], dados);
      else relatorio.contas.push(dados);
      relatorio.progresso = relatorio.contas.length;
      relatorio.confirmadas = relatorio.contas.filter((c) => c.status === 'confirmada').length;
      relatorio.falhadas = relatorio.contas.filter((c) => c.status === 'falhou').length;
    });

    fila.on('fim', (rel) => {
      relatorio.status = 'finalizado';
      relatorio.confirmadas = rel.confirmadas;
      relatorio.falhadas = rel.falhadas;
      relatorio.contas = rel.contas;
    });

    filas.set(id, { fila, relatorio });

    // Iniciar em background
    fila.processar().catch((err) => {
      relatorio.status = 'erro';
      relatorio.erro = err.message;
    });

    return { id, status: 'iniciado' };
  });

  /**
   * Obter status de um lote.
   * Input: { id }
   * Output: relatorio completo
   */
  handle('cadastro:status', (_e, id) => {
    const entry = filas.get(id);
    if (!entry) {
      throw new Error(`Lote ${id} não encontrado`);
    }
    return entry.relatorio;
  });

  /**
   * Parar um lote.
   * Input: { id }
   * Output: { ok, mensagem }
   */
  handle('cadastro:stop', (_e, id) => {
    const entry = filas.get(id);
    if (!entry) {
      return { ok: false, mensagem: `Lote ${id} não encontrado` };
    }
    // Em produção, implementar cancel flag na FilaCadastro
    return { ok: true, mensagem: 'Parada solicitada' };
  });

  /**
   * Listar presets disponíveis.
   * Input: (nenhum)
   * Output: { presets: [ { nome, sufixos }, ... ] }
   */
  handle('cadastro:presets', () => ({
    // nome continua por compatibilidade; rotulo é o texto já pronto da tela.
    presets: Gerador.presetsDetalhados().map((p) => ({
      nome: p.id,
      rotulo: p.rotulo,
      sufixos: p.sufixos,
    })),
  }));

  /**
   * Validar senha.
   * Input: { senha }
   * Output: { ok, erro? }
   */
  handle('cadastro:validar-senha', (_e, senha) => {
    if (typeof senha !== 'string') {
      return { ok: false, erro: 'Senha deve ser string' };
    }
    if (senha.length < 12) {
      return { ok: false, erro: 'Mínimo 12 caracteres' };
    }
    const temMaiuscula = /[A-Z]/.test(senha);
    const temNumero = /[0-9]/.test(senha);
    const temSimbolo = /[!@#$%^&*()_+=\-\[\]{};':"\\|,.<>\\/?]/.test(senha);
    if (!temMaiuscula || !temNumero || !temSimbolo) {
      return { ok: false, erro: 'Deve conter maiúscula, número e símbolo' };
    }
    return { ok: true };
  });

  /**
   * Validar sufixos customizados.
   * Input: { sufixos: array }
   * Output: { ok, erro? }
   */
  handle('cadastro:validar-custom', (_e, sufixos) => {
    const val = Gerador.validarCustom(sufixos);
    return val;
  });
}

module.exports = { registrarHandlersCadastro };
