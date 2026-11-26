'use strict';
// Cofre do DigiDeck: todos os dados do app ficam criptografados no disco.
//
// - Dados: AES-256-GCM com uma chave aleatória de 256 bits (autenticado: detecta adulteração).
// - A chave é protegida de um destes jeitos:
//     "dpapi"    -> pela proteção de dados do Windows (só o seu usuário, neste PC, abre)
//     "password" -> pela sua senha mestra, derivada com scrypt (N=2^17, r=8, p=1)
//     "raw"      -> só se o Windows não oferecer criptografia (raro); o app avisa
// - Backups: arquivo .digideck criptografado com uma senha escolhida na hora (scrypt + AES-256-GCM).
//   O arquivo pode viajar por e-mail, nuvem, pen drive: só quem tem a senha abre.
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const KDF = { alg: 'scrypt', N: 1 << 17, r: 8, p: 1 };
const MAXMEM = 512 * 1024 * 1024;
const AAD_STATE = 'digideck/state/v2';
const AAD_KEY = 'digideck/key/v2';
const AAD_BACKUP = 'digideck/backup/v2';
const LEGACY_SECRETS = ['discordWebhook', 'telegramToken'];

const b64 = (b) => Buffer.from(b).toString('base64');
const unb64 = (s) => Buffer.from(String(s), 'base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function seal(key, plaintext, aad) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return { iv: b64(iv), tag: b64(c.getAuthTag()), ct: b64(ct) };
}

function open(key, box, aad) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, unb64(box.iv));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(unb64(box.tag));
  return Buffer.concat([d.update(unb64(box.ct)), d.final()]);
}

function derive(password, kdf) {
  if (!kdf || kdf.alg !== 'scrypt') return Promise.reject(new Error('KDF desconhecido'));
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password).normalize('NFKC'), unb64(kdf.salt), 32,
      { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: MAXMEM },
      (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function sealWithPassword(password, plaintext, aad) {
  const kdf = { ...KDF, salt: b64(crypto.randomBytes(16)) };
  const key = await derive(password, kdf);
  return { kdf, box: seal(key, plaintext, aad) };
}

async function openWithPassword(password, wrapped, aad) {
  const key = await derive(password, wrapped.kdf);
  return open(key, wrapped.box, aad);
}

class Vault {
  constructor(file, safeStorage) {
    this.file = file;
    this.ss = safeStorage;
    this.key = null;       // chave de dados (Buffer de 32 bytes), só em memória
    this.mode = null;      // 'dpapi' | 'password' | 'raw'
    this.wrapped = null;   // chave protegida, como vai para o disco
    this.pending = null;   // arquivo esperando a senha mestra
    this.failures = 0;
    this.writing = null;   // a gravação em andamento (ver write)
  }

  dpapiOk() {
    try { return this.ss.isEncryptionAvailable(); } catch { return false; }
  }

  get locked() { return !!this.pending; }

  info() {
    return { mode: this.mode, locked: this.locked, dpapi: this.dpapiOk(), cipher: 'AES-256-GCM', kdf: 'scrypt' };
  }

  // Lê o arquivo. Devolve { state, locked, error }.
  load() {
    let raw;
    try {
      raw = fs.readFileSync(this.file, 'utf8').replace(/^﻿/, '');
    } catch {
      this.fresh();
      return { state: null, locked: false };
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.quarantine();
      this.fresh();
      return { state: null, locked: false, error: 'O arquivo de dados estava corrompido. Guardei uma cópia dele e comecei do zero.' };
    }

    if (parsed && parsed.format === 'digideck-vault') {
      if (parsed.mode === 'password') {
        this.mode = 'password';
        this.pending = parsed;
        return { state: null, locked: true };
      }
      try {
        if (parsed.mode === 'dpapi') this.key = Buffer.from(this.ss.decryptString(unb64(parsed.key)), 'base64');
        else if (parsed.mode === 'raw') this.key = unb64(parsed.key);
        else throw new Error('modo desconhecido');
        this.mode = parsed.mode;
        this.wrapped = parsed.key;
        return { state: JSON.parse(open(this.key, parsed.data, AAD_STATE).toString('utf8')), locked: false };
      } catch {
        this.quarantine();
        this.fresh();
        return { state: null, locked: false, error: 'Não consegui abrir os dados (foram criados em outro PC ou usuário do Windows?). Guardei uma cópia e comecei do zero.' };
      }
    }

    // Formato antigo (JSON aberto): migra para o cofre na próxima gravação.
    const s = parsed || {};
    const enc = s.settings && s.settings._enc;
    if (enc && this.dpapiOk()) {
      for (const k of LEGACY_SECRETS) {
        if (enc[k]) { try { s.settings[k] = this.ss.decryptString(unb64(enc[k])); } catch { /* outro PC */ } }
      }
    }
    if (s.settings) delete s.settings._enc;
    this.fresh();
    return { state: s, locked: false, migrated: true };
  }

  fresh() {
    this.key = crypto.randomBytes(32);
    this.pending = null;
    this.useSystemKey();
  }

  useSystemKey() {
    if (this.dpapiOk()) {
      this.mode = 'dpapi';
      this.wrapped = b64(this.ss.encryptString(b64(this.key)));
    } else {
      this.mode = 'raw';
      this.wrapped = b64(this.key);
    }
  }

  quarantine() {
    try { fs.copyFileSync(this.file, this.file.replace(/\.json$/, `.ilegivel-${Date.now()}.json`)); } catch { /* ignora */ }
  }

  async penalty() {
    if (this.failures) await sleep(Math.min(this.failures, 10) * 700);
  }

  async unlock(password) {
    if (!this.pending) return null;
    await this.penalty();
    try {
      const key = await openWithPassword(password, this.pending.key, AAD_KEY);
      const state = JSON.parse(open(key, this.pending.data, AAD_STATE).toString('utf8'));
      this.key = key;
      this.wrapped = this.pending.key;
      this.pending = null;
      this.failures = 0;
      return state;
    } catch {
      this.failures++;
      return null;
    }
  }

  async verify(password) {
    if (this.mode !== 'password') return true;
    await this.penalty();
    try {
      await openWithPassword(password, this.pending ? this.pending.key : this.wrapped, AAD_KEY);
      this.failures = 0;
      return true;
    } catch {
      this.failures++;
      return false;
    }
  }

  // Ativa ou troca a senha mestra. Gera uma chave de dados nova (rotação).
  async setPassword(current, next, state) {
    if (this.locked) return false;
    if (this.mode === 'password' && !(await this.verify(current))) return false;
    this.key = crypto.randomBytes(32);
    this.wrapped = await sealWithPassword(next, this.key, AAD_KEY);
    this.mode = 'password';
    this.write(state);
    return true;
  }

  async removePassword(current, state) {
    if (this.locked) return false;
    if (this.mode !== 'password') return true;
    if (!(await this.verify(current))) return false;
    this.key = crypto.randomBytes(32);
    this.useSystemKey();
    this.write(state);
    return true;
  }

  // Esqueceu a senha: guarda o arquivo criptografado e recomeça.
  reset() {
    this.quarantine();
    try { fs.unlinkSync(this.file); } catch { /* ignora */ }
    this.fresh();
    this.failures = 0;
  }

  // Serializa, criptografa e grava o estado.
  //
  // A gravação em si é ASSÍNCRONA. Era writeFileSync, e com o arquivo grande
  // (chegou a 24 MB) isso bloqueava o processo principal a cada gravação: a
  // janela inteira congelava junto, porque o processo principal é quem atende
  // todo o IPC. O escrever-e-renomear continua igual, então uma queda de energia
  // no meio não corrompe o arquivo: ou vale o antigo, ou vale o novo.
  //
  // As gravações são encadeadas (this.writing) para que duas não disputem o
  // mesmo .tmp — era um risco que o modo síncrono não tinha.
  write(state) {
    if (!this.key || this.pending || !state) return false;
    const file = {
      format: 'digideck-vault',
      v: 2,
      cipher: 'aes-256-gcm',
      mode: this.mode,
      key: this.wrapped,
      data: seal(this.key, Buffer.from(JSON.stringify(state), 'utf8'), AAD_STATE),
    };
    const texto = JSON.stringify(file);
    const tmp = this.file + '.tmp';
    this.writing = (this.writing || Promise.resolve())
      .then(async () => {
        await fsp.mkdir(path.dirname(this.file), { recursive: true });
        await fsp.writeFile(tmp, texto);
        await fsp.rename(tmp, this.file);
      })
      .catch((err) => { console.error('[vault] não deu para gravar:', err.message); });
    return true;
  }

  // Grava agora, bloqueando. Só para a saída do app: no 'before-quit' não há
  // tempo para esperar uma promessa, e perder a última gravação ali seria perder
  // o trabalho da sessão.
  writeSync(state) {
    if (!this.key || this.pending || !state) return false;
    const file = {
      format: 'digideck-vault',
      v: 2,
      cipher: 'aes-256-gcm',
      mode: this.mode,
      key: this.wrapped,
      data: seal(this.key, Buffer.from(JSON.stringify(state), 'utf8'), AAD_STATE),
    };
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(file));
      fs.renameSync(tmp, this.file);
      return true;
    } catch (err) {
      console.error('[vault] não deu para gravar na saída:', err.message);
      return false;
    }
  }

  /** Espera a última gravação terminar. */
  flushed() { return this.writing || Promise.resolve(); }
}

async function encryptBackup(password, payload) {
  const { kdf, box } = await sealWithPassword(password, Buffer.from(JSON.stringify(payload), 'utf8'), AAD_BACKUP);
  return JSON.stringify({ format: 'digideck-backup', v: 2, cipher: 'aes-256-gcm', kdf, data: box });
}

async function decryptBackup(password, file) {
  const buf = await openWithPassword(password, { kdf: file.kdf, box: file.data }, AAD_BACKUP);
  return JSON.parse(buf.toString('utf8'));
}

module.exports = { Vault, encryptBackup, decryptBackup };
