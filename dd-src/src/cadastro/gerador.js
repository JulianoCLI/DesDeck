'use strict';

/**
 * Gerador de identidades de conta para cadastro em lote.
 * - E-mail: nick@gmail.com (ou nick+suffixo@gmail.com com o nick sem _./ etc)
 * - Senha: validada (mín 12, forte: maiúscula + número + símbolo)
 * - Nick: base + sufixo de uma lista (até 10 sufixos), bloco de 4
 * - Nenhum ponto, nenhum carácter especial: só letras e números
 */

// Presets de variações de nick (10)
const PRESETS_NICK = {
  numeros: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
  numerosZero: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'],
  minusculas: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
  maiusculas: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
  romanos: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'],
  anosCurtos: ['21', '22', '23', '24', '25', '26', '27', '28', '29', '30'],
  duplas: ['11', '22', '33', '44', '55', '66', '77', '88', '99', '00'],
  animais: ['tigre', 'leao', 'lobo', 'foca', 'bode', 'touro', 'lince', 'morsa', 'anta', 'puma'],
  cores: ['red', 'blue', 'gold', 'gray', 'green', 'cyan', 'lime', 'teal', 'plum', 'rose'],
  elementos: ['fogo', 'agua', 'terra', 'vento', 'raio', 'gelo', 'luz', 'trevas', 'metal', 'veneno'],
};

// Como cada preset aparece na tela: nome em português e os primeiros sufixos,
// porque "numerosZero" não diz nada e "Números com zero (01, 02, 03, 04)" diz tudo.
const ROTULOS_PRESET = {
  numeros: 'Números',
  numerosZero: 'Números com zero',
  minusculas: 'Letras minúsculas',
  maiusculas: 'Letras maiúsculas',
  romanos: 'Romanos',
  anosCurtos: 'Anos curtos',
  duplas: 'Duplas',
  animais: 'Animais',
  cores: 'Cores',
  elementos: 'Elementos',
};

const rotuloPreset = (nome) => {
  const lista = PRESETS_NICK[nome];
  const titulo = ROTULOS_PRESET[nome] || nome;
  if (!lista) return titulo;
  return `${titulo} (${lista.slice(0, 4).join(', ')})`;
};

class Gerador {
  constructor(config = {}) {
    // config: { base, bases, preset, customNicks, senha, seed }
    this.base = config.base || 'tamer';
    // Uma base por bloco de 4 contas, na ordem em que a pessoa digitou. O nome
    // da tela no deck é essa base, então ela não pode ser inventada aqui.
    this.bases = Array.isArray(config.bases) ? config.bases.filter(Boolean) : null;
    this.preset = config.preset || 'numeros'; // nome do preset ou lista customizada
    this.customNicks = config.customNicks || null; // se preset === 'custom', array de sufixos
    this.senha = config.senha || ''; // senha do lote (validada externamente)
    this.seed = config.seed || Math.random(); // para testes determinísticos
    this.rng = this._criarRng(this.seed);
    this.usados = new Set(); // e-mails/nicks já gerados, para evitar colisão
    this.basePorBloco = {}; // cache de base por bloco de 4
  }

  _criarRng(seed) {
    // RNG seeded simples (xorshift32) para testes
    let s = Math.floor(seed * 0xffffffff) || 1;
    return () => {
      s ^= s << 13;
      s ^= s >> 17;
      s ^= s << 5;
      return ((s >>> 0) % 65536) / 65536;
    };
  }

  _validarSenha(senha) {
    if (typeof senha !== 'string') return false;
    if (senha.length < 12) return false; // mín 12
    const temMaiuscula = /[A-Z]/.test(senha);
    const temNumero = /[0-9]/.test(senha);
    const temSimbolo = /[!@#$%^&*()_+=\-\[\]{};':"\\|,.<>\/?]/.test(senha);
    return temMaiuscula && temNumero && temSimbolo;
  }

  _variacoesPorBloco(bloco) {
    if (this.customNicks) return this.customNicks;
    const lista = PRESETS_NICK[this.preset];
    if (!lista) throw new Error(`preset desconhecido: ${this.preset}`);
    return lista;
  }

  _baseParaBloco(bloco) {
    if (this.basePorBloco[bloco] !== undefined) return this.basePorBloco[bloco];
    if (this.bases && this.bases[bloco]) {
      this.basePorBloco[bloco] = this.bases[bloco];
    } else if (bloco === 0) {
      this.basePorBloco[0] = this.base;
    } else {
      this.basePorBloco[bloco] = this.base + (bloco + 1);
    }
    return this.basePorBloco[bloco];
  }

  /**
   * Gera a identidade para a N-ésima conta do lote (0-indexed).
   * Returns { email, nick, senha }
   */
  gerar(indice) {
    if (!this._validarSenha(this.senha)) {
      throw new Error('Senha inválida: mínimo 12 caracteres, com maiúscula, número e símbolo.');
    }

    const bloco = Math.floor(indice / 4);
    const posNoBlocoLocal = indice % 4;
    const variacoes = this._variacoesPorBloco(bloco);
    const base = this._baseParaBloco(bloco);

    if (posNoBlocoLocal >= variacoes.length) {
      throw new Error(`Não há sufixo para a posição ${posNoBlocoLocal} do bloco ${bloco}. Presets têm até 10, lotes com >40 contas precisam preset customizado.`);
    }

    const sufixo = variacoes[posNoBlocoLocal];
    const nick = base + sufixo;

    // Validar nick: 3–16, só letras e números
    if (!/^[a-zA-Z0-9]{3,16}$/.test(nick)) {
      throw new Error(`Nick inválido: "${nick}" (esperado 3–16 letras/números).`);
    }

    // E-mail derivado do nick (sem _. etc para garantir Gmail válido)
    const nickSeguro = nick.replace(/[^a-zA-Z0-9]/g, '');
    let email = `${nickSeguro}@gmail.com`;
    let tentativas = 0;
    while (this.usados.has(email) && tentativas < 100) {
      // colisão: adiciona um número
      email = `${nickSeguro}${Math.floor(this.rng() * 10000)}@gmail.com`;
      tentativas++;
    }
    if (this.usados.has(email)) {
      throw new Error(`Não consegui gerar um e-mail único para "${nick}".`);
    }

    this.usados.add(email);
    this.usados.add(nick);

    return { email, nick, senha: this.senha };
  }

  /**
   * Gera lista de N identidades (para lote).
   */
  gerarLote(n) {
    const result = [];
    for (let i = 0; i < n; i++) {
      result.push(this.gerar(i));
    }
    return result;
  }

  /**
   * Lista os presets disponíveis.
   */
  static presets() {
    return Object.keys(PRESETS_NICK);
  }

  /**
   * Presets com o rótulo pronto para a tela: { id, rotulo, sufixos }.
   */
  static presetsDetalhados() {
    return Object.keys(PRESETS_NICK).map((id) => ({
      id,
      rotulo: rotuloPreset(id),
      sufixos: PRESETS_NICK[id],
    }));
  }

  /**
   * A base de nick de um bloco é o nome da tela. Vale validar igual ao nick:
   * sem pontos, sem acentos, sem espaço.
   */
  static validarBase(base) {
    if (typeof base !== 'string' || !base.trim()) return { ok: false, erro: 'Base vazia.' };
    const b = base.trim();
    if (!/^[a-zA-Z0-9]{2,12}$/.test(b)) {
      return { ok: false, erro: `Base inválida: "${b}" (2 a 12 letras ou números, sem espaços ou acentos).` };
    }
    return { ok: true, base: b };
  }

  /**
   * Info do preset (para UI).
   */
  static infoPreset(nome) {
    const lista = PRESETS_NICK[nome];
    return lista ? { nome, sufixos: lista } : null;
  }

  /**
   * Valida uma lista customizada de sufixos.
   */
  static validarCustom(sufixos) {
    if (!Array.isArray(sufixos) || sufixos.length === 0) return { ok: false, erro: 'Lista vazia.' };
    if (sufixos.length > 10) return { ok: false, erro: 'Máximo 10 sufixos.' };
    for (const s of sufixos) {
      if (!/^[a-zA-Z0-9]+$/.test(s)) return { ok: false, erro: `Sufixo inválido: "${s}" (só letras e números).` };
      if (s.length > 10) return { ok: false, erro: `Sufixo muito longo: "${s}" (máx 10 caracteres).` };
    }
    return { ok: true };
  }
}

module.exports = { Gerador, PRESETS_NICK, ROTULOS_PRESET, rotuloPreset };
