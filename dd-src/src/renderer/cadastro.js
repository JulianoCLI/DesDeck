/**
 * UI do sistema de cadastro em lote.
 * - Form de configuração (base, preset, senha, starter, proxies)
 * - Modal de gerenciamento de proxies (colar, testar, distribuir)
 * - Log de progresso
 * - Relatório final
 */

class CadastroUI {
  constructor() {
    this.container = null;
    this.loteAtivo = null;
    this.updateInterval = null;
    this.listaProxys = []; // lista salva de proxies { host, port, user, pass }
    this.proxysTestados = {}; // { 'host:port': { ok: true, ip: '...' } ou { ok: false, erro: '...' } }
    this.tamanho = 10;
    this.telasDaFila = Math.ceil(this.tamanho / 4);
    // Uma base de nick por tela, na ordem dos blocos de 4.
    this.bases = [];
    this._carregarListaSalva();
  }

  mount(selector) {
    this.container = document.querySelector(selector);
    if (!this.container) {
      console.error('Contenedor não encontrado:', selector);
      return;
    }

    this.render();
    this.attachEventos();
    this.carregarPresets();
    this.atualizarDisplayProxys();
  }

  render() {
    // A janela pode ter sido fechada com o lote rodando: o polling continua,
    // mas não há onde desenhar.
    if (!this.container) return;
    // Sem <h2> aqui: o modal que hospeda esta UI já tem o título "Cadastro em
    // Lote", e os dois juntos apareciam repetidos.
    this.container.innerHTML = `
      <div class="cadastro-panel">
        ${!this.loteAtivo ? this.renderForm() : this.renderProgresso()}
      </div>
      ${this.renderModalProxys()}
    `;
  }

  renderModalProxys() {
    return `
      <div id="modal-proxys" class="modal" style="display: none;">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Gerenciar Proxies</h3>
            <button type="button" class="close-btn" id="close-modal-btn">✕</button>
          </div>

          <div class="modal-body">
            <div class="section">
              <label for="proxy-textarea">Lista de proxies — um por linha</label>
              <textarea id="proxy-textarea" class="mono" spellcheck="false"
                placeholder="104.253.82.90:6511:usuario:senha&#10;161.123.154.27:6557:usuario:senha"></textarea>
              <small>Aceita <code>host:port:user:pass</code> ou <code>user:pass@host:port</code>. Comentários após <code>//</code> são ignorados. A distribuição entre telas é automática, e um proxy que bater limite (429) é trocado sozinho.</small>
            </div>

            <div class="section buttons">
              <button type="button" id="salvar-lista-btn" class="btn-primary">Salvar lista</button>
              <button type="button" id="test-proxys-btn" class="btn-secondary">Testar todos</button>
            </div>

            <div id="lista-info" class="section"></div>

            <div id="test-status" class="test-status" style="display: none;">
              <div id="test-progress" class="test-progress"></div>
              <div id="test-results" class="test-results mono"></div>
            </div>
          </div>

          <div class="modal-footer">
            <button type="button" id="cancel-proxys-btn" class="btn-secondary">Fechar</button>
          </div>
        </div>
      </div>
    `;
  }

  // Uma base de nick por bloco de 4 contas. Cada base nomeia a tela que vai
  // receber aquelas 4 contas no deck, por isso são campos separados e não um só.
  renderBases() {
    const campos = [];
    for (let i = 0; i < this.telasDaFila; i++) {
      const valor = this.bases[i] || '';
      campos.push(`
        <label class="base-campo">
          <span class="base-num">Tela ${i + 1}</span>
          <input type="text" class="base-input" data-bloco="${i}"
                 value="${valor}" maxlength="12" placeholder="ex: tamer${i + 1}"
                 autocomplete="off" spellcheck="false" required />
        </label>
      `);
    }
    return campos.join('');
  }

  renderForm() {
    return `
      <form class="cadastro-form" id="cadastro-form">
        <!-- Linha 1: as opções do lote, lado a lado -->
        <div class="form-linha">
          <div class="campo campo-sm">
            <label for="quantidade-input">Quantidade</label>
            <input type="number" id="quantidade-input" value="${this.tamanho}" min="1" max="100" step="1" required />
            <small>${this.telasDaFila} tela(s)</small>
          </div>

          <div class="campo">
            <label for="preset-select">Variação do nick</label>
            <select id="preset-select" required>
              <option value="">Carregando…</option>
            </select>
          </div>

          <div class="campo">
            <label for="starter-select">Starter</label>
            <select id="starter-select" required>
              <option value="">Escolha…</option>
              <option value="guilmon">Guilmon</option>
              <option value="renamon">Renamon</option>
              <option value="terriermon">Terriermon</option>
              <option value="demidevimon">Demidevimon</option>
            </select>
          </div>

          <div class="campo">
            <label for="senha-input">Senha do lote</label>
            <input type="password" id="senha-input" placeholder="mín. 12 caracteres" required />
            <small id="senha-status">Maiúscula + número + símbolo</small>
          </div>
        </div>

        <!-- Bases de nick: uma por tela -->
        <div class="bloco">
          <div class="bloco-head">
            <h3>Bases de nick</h3>
            <span class="bloco-nota">Cada base dá nome à sua tela e vira o nick das 4 contas dela.</span>
          </div>
          <div class="bases-grid" id="bases-grid">${this.renderBases()}</div>
        </div>

        <div class="bloco" id="custom-group" style="display: none;">
          <div class="bloco-head"><h3>Sufixos personalizados</h3></div>
          <textarea id="custom-input" placeholder="ex1, ex2, ex3, ex4"></textarea>
          <small>Até 10 sufixos, separados por vírgula, só letras e números.</small>
        </div>

        <!-- Proxies -->
        <div class="bloco">
          <div class="bloco-head">
            <h3>Proxies</h3>
            <button type="button" id="open-proxys-btn" class="btn-secondary btn-mini">Gerenciar</button>
          </div>
          <div class="proxy-resumo" id="proxy-resumo-input">${this.formatListaResumo()}</div>
          <small id="lista-detail"></small>
        </div>

        <div class="form-acoes">
          <small id="bloqueio-msg" class="texto-erro"></small>
          <button type="submit" class="btn-primary" id="submit-btn" disabled>Iniciar lote</button>
        </div>
      </form>
    `;
  }

  renderProgresso() {
    if (!this.loteAtivo) return '';

    const { progresso, total, confirmadas, falhadas, contas } = this.loteAtivo;
    const percentual = Math.round((progresso / total) * 100);

    return `
      <div class="cadastro-progresso">
        <h3>Lote #${this.loteAtivo.id} em andamento</h3>

        <div class="barra-progresso">
          <div class="barra-preenchida" style="width: ${percentual}%"></div>
        </div>
        <p class="progresso-texto">${progresso} / ${total} contas (${percentual}%)</p>

        <div class="stats">
          <div class="stat confirmadas">✅ ${confirmadas} confirmadas</div>
          <div class="stat falhadas">❌ ${falhadas} falhadas</div>
        </div>

        <div class="log-contas">
          <h4>Log:</h4>
          <ul class="lista-contas">
            ${contas.slice().reverse().map((c) => `
              <li class="conta-${c.status}">
                <span class="indice">#${c.indice}</span>
                <span class="tela">T${(c.tela || 0) + 1}</span>
                <span class="status">${this.iconStatus(c.status)}</span>
                ${c.motivo ? `<span class="motivo">${c.motivo}</span>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>

        <button id="parar-btn" class="btn-secondary">Parar</button>
      </div>
    `;
  }

  iconStatus(status) {
    const icons = {
      pendente: '⏳',
      criada: '📝',
      nick_ok: '✍️',
      starter_ok: '🎮',
      verificado: '✅',
      confirmada: '✅ Confirmada',
      falhou: '❌ Falhou',
    };
    return icons[status] || status;
  }

  formatProxyForDisplay(proxy) {
    if (!proxy) return '(nenhum)';
    if (proxy.user && proxy.pass) {
      return `${proxy.host}:${proxy.port} (${proxy.user}:${proxy.pass.slice(0, 2)}...${proxy.pass.slice(-2)})`;
    }
    return `${proxy.host}:${proxy.port}`;
  }

  parseProxyString(str) {
    if (!str || typeof str !== 'string') return null;
    
    str = str.trim();
    
    // Cortar comentário (tudo depois de //)
    const hashIdx = str.indexOf('//');
    if (hashIdx >= 0) {
      str = str.substring(0, hashIdx).trim();
    }
    
    if (!str) return null;
    
    let host, port, user, pass;
    
    if (str.includes('@')) {
      const [creds, addr] = str.split('@');
      const [u, p] = creds.split(':');
      user = u.trim();
      pass = p?.trim() || '';
      const [h, po] = addr.split(':');
      host = h.trim();
      port = parseInt(po, 10);
    } else {
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

  attachEventos() {
    if (!this.container) return;
    if (this.loteAtivo) {
      const btnParar = this.container.querySelector('#parar-btn');
      if (btnParar) {
        btnParar.addEventListener('click', () => this.pararLote());
      }
    } else {
      const form = this.container.querySelector('#cadastro-form');
      if (form) {
        form.addEventListener('submit', (e) => this.onSubmitForm(e));
      }

      const presetSelect = this.container.querySelector('#preset-select');
      const customGroup = this.container.querySelector('#custom-group');
      if (presetSelect && customGroup) {
        presetSelect.addEventListener('change', (e) => {
          customGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
        });
      }

      const senhaInput = this.container.querySelector('#senha-input');
      if (senhaInput) {
        senhaInput.addEventListener('input', (e) => this.validarSenhaEBloqueio(e.target.value));
      }

      const starterSelect = this.container.querySelector('#starter-select');
      if (starterSelect) {
        starterSelect.addEventListener('change', () => this.atualizarBloqueio());
      }

      // Campo de quantidade: recalcula telas, redesenha as bases e revalida.
      const quantidadeInput = this.container.querySelector('#quantidade-input');
      if (quantidadeInput) {
        quantidadeInput.addEventListener('input', (e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= 1) {
            this.tamanho = v;
            this.telasDaFila = Math.ceil(v / 4);
            this.redesenharBases();
            this.atualizarDisplayProxys();
          }
        });
      }

      this.ligarEventosBases();

      // Eventos do modal de proxies
      const openProxysBtn = this.container.querySelector('#open-proxys-btn');
      const closeModalBtn = this.container.querySelector('#close-modal-btn');
      const cancelProxysBtn = this.container.querySelector('#cancel-proxys-btn');
      const salvarListaBtn = this.container.querySelector('#salvar-lista-btn');
      const testProxysBtn = this.container.querySelector('#test-proxys-btn');
      const modal = this.container.querySelector('#modal-proxys');

      if (openProxysBtn) openProxysBtn.addEventListener('click', () => this.abrirModalProxys());
      if (closeModalBtn) closeModalBtn.addEventListener('click', () => this.fecharModalProxys());
      if (cancelProxysBtn) cancelProxysBtn.addEventListener('click', () => this.fecharModalProxys());
      if (salvarListaBtn) salvarListaBtn.addEventListener('click', () => this.salvarListaProxys());
      if (testProxysBtn) testProxysBtn.addEventListener('click', () => this.testarTodosProxys());

      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) this.fecharModalProxys();
        });
      }
    }
  }

  // Redesenha só a grade de bases (o resto do form fica como está, para não
  // perder a senha já digitada nem o foco do campo de quantidade).
  redesenharBases() {
    if (!this.container) return;
    const grid = this.container.querySelector('#bases-grid');
    if (!grid) return;
    this.bases.length = this.telasDaFila;
    grid.innerHTML = this.renderBases();
    this.ligarEventosBases();

    const nota = this.container.querySelector('#quantidade-input')?.parentElement?.querySelector('small');
    if (nota) nota.textContent = `${this.telasDaFila} tela(s)`;
  }

  ligarEventosBases() {
    if (!this.container) return;
    for (const inp of this.container.querySelectorAll('.base-input')) {
      inp.addEventListener('input', (e) => {
        const i = Number(e.target.dataset.bloco);
        this.bases[i] = e.target.value.trim();
        this.atualizarBloqueio();
      });
    }
  }

  abrirModalProxys() {
    if (!this.container) return;
    const modal = this.container.querySelector('#modal-proxys');
    const textarea = this.container.querySelector('#proxy-textarea');
    if (modal) {
      if (textarea) {
        textarea.value = this.listaProxys
          .map((p) => `${p.host}:${p.port}${p.user ? ':' + p.user + ':' + p.pass : ''}`)
          .join('\n');
      }
      this.atualizarDisplayProxys();
      modal.style.display = 'flex';
      if (textarea) textarea.focus();
    }
  }

  fecharModalProxys() {
    const modal = this.container?.querySelector('#modal-proxys');
    if (modal) modal.style.display = 'none';
  }

  _carregarListaSalva() {
    try {
      const raw = localStorage.getItem('deck_proxys_lista');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          this.listaProxys = arr.filter((p) => p && p.host && p.port);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar lista de proxies:', err);
    }
  }

  formatListaResumo() {
    const n = this.listaProxys.length;
    const telas = this.telasDaFila;
    if (n === 0) return 'Nenhum proxy salvo';
    if (n < telas) return `${n} salvo(s) — faltam ${telas - n} para as ${telas} telas`;
    return `${n} salvo(s) — distribuídos entre ${telas} tela(s)`;
  }

  salvarListaProxys() {
    const textarea = this.container?.querySelector('#proxy-textarea');
    if (!textarea) return;

    const linhas = textarea.value.split('\n').map((l) => l.trim()).filter(Boolean);
    const parseados = [];
    for (const linha of linhas) {
      const p = this.parseProxyString(linha);
      if (p) parseados.push(p);
    }

    // Dedupe por host:port
    const vistos = new Set();
    const unicos = [];
    for (const p of parseados) {
      const chave = `${p.host}:${p.port}`;
      if (!vistos.has(chave)) {
        vistos.add(chave);
        unicos.push(p);
      }
    }

    if (unicos.length === 0) {
      alert('Nenhum proxy válido foi encontrado.');
      return;
    }

    this.listaProxys = unicos;
    try {
      localStorage.setItem('deck_proxys_lista', JSON.stringify(unicos));
    } catch (err) {
      console.error('Erro ao salvar lista de proxies:', err);
    }

    this.atualizarDisplayProxys();
    this.fecharModalProxys();

    if (unicos.length < this.telasDaFila) {
      alert(`⚠️ Lista salva com ${unicos.length} proxy(s), mas são ${this.telasDaFila} telas. Faltam ${this.telasDaFila - unicos.length}. O lote não inicia até completar.`);
    } else {
      alert(`✅ Lista salva: ${unicos.length} proxy(s). Distribuição automática e rotação em caso de limite (429).`);
    }
  }

  async testarTodosProxys() {
    if (this.listaProxys.length === 0) {
      alert('Nenhum proxy salvo para testar.');
      return;
    }

    const statusEl = this.container?.querySelector('#test-status');
    const progressEl = this.container?.querySelector('#test-progress');
    const resultsEl = this.container?.querySelector('#test-results');

    if (!statusEl || !progressEl || !resultsEl) return;

    statusEl.style.display = 'block';
    resultsEl.innerHTML = '';
    this.proxysTestados = {};

    const lista = this.listaProxys;
    let testados = 0;

    for (let i = 0; i < lista.length; i++) {
      const p = lista[i];
      const chave = `${p.host}:${p.port}`;

      progressEl.textContent = `Testando ${i + 1}/${lista.length}…`;

      try {
        const result = await window.deck.testProxy(p);
        if (result.ok) {
          this.proxysTestados[chave] = { ok: true, ip: result.ip };
          resultsEl.innerHTML += `✅ ${chave} → IP ${result.ip}\n`;
        } else {
          this.proxysTestados[chave] = { ok: false, erro: result.error };
          resultsEl.innerHTML += `❌ ${chave} → ${result.error}\n`;
        }
      } catch (err) {
        this.proxysTestados[chave] = { ok: false, erro: err.message };
        resultsEl.innerHTML += `❌ ${chave} → ${err.message}\n`;
      }

      testados++;
    }

    progressEl.textContent = `✅ Testes concluídos: ${testados}`;
  }

  atualizarDisplayProxys() {
    if (!this.container) return;
    const resumo = this.container.querySelector('#proxy-resumo-input');
    if (resumo) resumo.textContent = this.formatListaResumo();

    const detail = this.container.querySelector('#lista-detail');
    if (detail) {
      const n = this.listaProxys.length;
      const telas = this.telasDaFila;
      detail.textContent = n === 0
        ? 'Nenhum proxy salvo. Abra "Gerenciar Proxies" para colar e salvar a lista.'
        : (n >= telas
            ? `Suficientes para ${telas} telas. Em limite 429, rotaciona automaticamente.`
            : `⚠️ Precisa de ao menos ${telas} proxies para ${telas} telas (hoje: ${n}).`);
    }

    const info = this.container.querySelector('#lista-info');
    if (info && this.listaProxys.length > 0) {
      info.innerHTML = `<label>Lista salva (${this.listaProxys.length})</label>
        <ul class="proxy-lista">${this.listaProxys
          .map((p) => `<li><span class="addr">${p.host}:${p.port}</span>${p.user ? `<span class="user">${p.user}</span>` : ''}</li>`)
          .join('')}</ul>`;
    } else if (info) {
      info.innerHTML = '';
    }

    this.atualizarBloqueio();
  }

  async carregarPresets() {
    try {
      const { presets } = await window.deck.cadastroPresets();
      const select = this.container?.querySelector('#preset-select');
      if (!select) return;
      // rotulo já vem pronto do main ("Números (1, 2, 3, 4)"); nome é o id.
      select.innerHTML = presets
        .map((p) => `<option value="${p.nome}">${p.rotulo || p.nome}</option>`)
        .join('') + '<option value="custom">Personalizado…</option>';
      this.atualizarBloqueio();
    } catch (err) {
      console.error('Erro ao carregar presets:', err);
    }
  }

  async validarSenhaEBloqueio(senha) {
    const statusEl = this.container?.querySelector('#senha-status');
    if (!statusEl) return;

    if (!senha) {
      statusEl.textContent = 'Maiúscula + número + símbolo';
      statusEl.className = '';
      this.senhaValida = false;
      this.atualizarBloqueio();
      return;
    }

    try {
      const { ok, erro } = await window.deck.cadastroValidarSenha(senha);
      this.senhaValida = ok;
      statusEl.textContent = ok ? 'Senha válida' : erro;
      statusEl.className = ok ? 'texto-sucesso' : 'texto-erro';
    } catch (err) {
      this.senhaValida = false;
      statusEl.textContent = err.message;
      statusEl.className = 'texto-erro';
    }
    this.atualizarBloqueio();
  }

  /**
   * O que ainda falta para o lote poder começar. Devolve a primeira pendência
   * em texto, ou null se está tudo pronto.
   */
  pendencia() {
    if (!this.senhaValida) return 'Defina uma senha válida para o lote.';

    const starter = this.container?.querySelector('#starter-select')?.value;
    if (!starter) return 'Escolha o starter: aleatório não é permitido.';

    for (let i = 0; i < this.telasDaFila; i++) {
      const b = (this.bases[i] || '').trim();
      if (!b) return `Falta a base de nick da tela ${i + 1}.`;
      if (!/^[a-zA-Z0-9]{2,12}$/.test(b)) {
        return `Base da tela ${i + 1} inválida: use 2 a 12 letras ou números.`;
      }
    }
    const unicas = new Set(this.bases.slice(0, this.telasDaFila).map((b) => b.toLowerCase()));
    if (unicas.size < this.telasDaFila) return 'As bases de nick não podem repetir.';

    if (this.listaProxys.length < this.telasDaFila) {
      return `Faltam proxies: ${this.telasDaFila} tela(s) precisam de ${this.telasDaFila}, há ${this.listaProxys.length}.`;
    }
    return null;
  }

  atualizarBloqueio() {
    const submitBtn = this.container?.querySelector('#submit-btn');
    const msg = this.container?.querySelector('#bloqueio-msg');
    if (!submitBtn) return;
    const falta = this.pendencia();
    submitBtn.disabled = !!falta;
    if (msg) msg.textContent = falta || '';
  }

  async onSubmitForm(e) {
    e.preventDefault();

    if (!this.container) return;
    const presetSelect = this.container.querySelector('#preset-select');
    const customInput = this.container.querySelector('#custom-input');
    const senhaInput = this.container.querySelector('#senha-input');
    const starterSelect = this.container.querySelector('#starter-select');

    const falta = this.pendencia();
    if (falta) {
      alert(falta);
      return;
    }

    const bases = this.bases.slice(0, this.telasDaFila).map((b) => b.trim());

    const config = {
      base: bases[0],
      bases,
      preset: presetSelect.value,
      senha: senhaInput.value,
      starterFixo: starterSelect.value,
      tamanho: this.tamanho,
      proxys: this.listaProxys.map(p =>
        `${p.host}:${p.port}${p.user ? ':' + p.user + ':' + p.pass : ''}`
      ),
    };

    if (config.preset === 'custom') {
      const sufixos = customInput.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const { ok, erro } = await window.deck.cadastroValidarCustom(sufixos);
      if (!ok) {
        alert(`Sufixos inválidos: ${erro}`);
        return;
      }
      config.customNicks = sufixos;
    }

    try {
      const { id } = await window.deck.cadastroStart(config);
      this.importado = false;
      this.loteAtivo = { id, status: 'em_progresso', progresso: 0, total: this.tamanho, confirmadas: 0, falhadas: 0, contas: [] };
      this.render();
      this.attachEventos();
      this.startPollingStatus();
    } catch (err) {
      alert(`Erro ao iniciar lote: ${err.message}`);
    }
  }

  startPollingStatus() {
    if (this.updateInterval) clearInterval(this.updateInterval);

    this.updateInterval = setInterval(async () => {
      if (!this.loteAtivo) {
        clearInterval(this.updateInterval);
        return;
      }

      try {
        const relatorio = await window.deck.cadastroStatus(this.loteAtivo.id);
        this.loteAtivo = relatorio;
        this.render();
        this.attachEventos();

        if (relatorio.status === 'finalizado' || relatorio.status === 'erro') {
          clearInterval(this.updateInterval);
          this.updateInterval = null;
          await this._importarConfirmadas(relatorio);
          setTimeout(() => {
            this.loteAtivo = null;
            this.render();
            this.attachEventos();
          }, 3000);
        }
      } catch (err) {
        console.error('Erro ao atualizar status:', err);
      }
    }, 1000);
  }

  /**
   * Fim do lote: cria as telas no deck, amarra o proxy de cada uma e liga o
   * headless. Roda uma vez só por lote (importado), porque o polling pode
   * entregar o relatório final mais de uma vez.
   */
  async _importarConfirmadas(relatorio) {
    if (this.importado) return;
    this.importado = true;

    if (typeof this.importarContas !== 'function') return;

    try {
      const { criadas, telas } = await this.importarContas(relatorio.contas || []);
      if (criadas && this.avisar) {
        this.avisar(`${criadas} conta(s) adicionadas em ${telas} tela(s), com proxy e headless ligados.`);
      }
    } catch (err) {
      console.error('[cadastro] erro ao importar contas:', err);
      if (this.avisar) this.avisar(`Não consegui criar as telas: ${err.message}`, 'warn');
    }
  }

  async pararLote() {
    if (!this.loteAtivo) return;

    try {
      await window.deck.cadastroStop(this.loteAtivo.id);
      this.loteAtivo = null;
      this.render();
      this.attachEventos();
    } catch (err) {
      alert(`Erro ao parar: ${err.message}`);
    }
  }
}

window.CadastroUI = CadastroUI;
