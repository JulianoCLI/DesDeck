'use strict';
/**
 * Headless Mode Management (Fase 2)
 * 
 * Funções para alternar entre:
 * - Modo webview (normal, renderizando interface)
 * - Modo headless (sem webview, apenas WebSocket)
 */

/**
 * Alterna uma conta entre headless e webview.
 * @param {string} accId - ID da conta
 * @param {boolean} enable - true = ativar headless, false = desativar
 */
async function toggleHeadlessMode(accId, enable) {
  const acc = accById(accId);
  const r = rt.get(accId);

  if (!acc || !r) return false;

  try {
    if (enable && !acc.headless) {
      // ---- Entrando em headless
      console.log(`[headless] ativando modo headless para ${acc.name}`);

      // 1. Marca na config
      acc.headless = true;
      save();

      // 2. Inicia cliente headless
      await deck.headlessStart(accId);

      // 3. Remove webview do DOM (renderizador será destruído)
      if (r.wv && r.wv.parentElement) {
        r.wv.remove();
        r.wv = null;
        r.wcId = null;
      }

      // 4. Marca tile como headless
      r.tile.classList.add('headless-mode');

      log('info', acc, 'Modo headless ativado');
    } else if (!enable && acc.headless) {
      // ---- Saindo de headless
      console.log(`[headless] desativando modo headless para ${acc.name}`);

      // 1. Para o cliente headless
      await deck.headlessStop(accId);

      // 2. Marca na config
      acc.headless = false;
      save();

      // 3. Recria webview
      const url = acc.url || '';
      if (!/^https?:\/\//i.test(url)) {
        raiseAlert(acc, 'URL inválida', 'Configure a URL antes de sair do headless');
        return false;
      }

      const wv = document.createElement('webview');
      wv.setAttribute('partition', `persist:acc-${accId}`);
      wv.setAttribute('allowpopups', '');
      wv.setAttribute('webpreferences', 'backgroundThrottling=yes');

      r.wv = wv;
      r.wcId = null;
      r.ready = false;
      r.sleepOkAt = Infinity;

      // Reinsere no DOM
      const wvWrap = r.tile.querySelector('.wv-wrap');
      if (wvWrap) {
        wvWrap.insertBefore(wv, wvWrap.firstChild);
      }

      // Reconnecta eventos do jogo
      wireWebview(acc, r, wv);

      // Aplica proxy antes de carregar
      const group = groupOf(acc);
      if (group?.proxy) {
        try {
          const ok = await deck.applyProxy(`persist:acc-${accId}`, group.proxy);
          if (!ok) throw new Error('setProxy recusou');
        } catch (err) {
          console.error('[proxy] erro ao aplicar:', err);
          raiseAlert(acc, 'Proxy', 'Falha ao aplicar proxy');
          return false;
        }
      }

      // Carrega a página
      wv.setAttribute('src', url);

      // Remove classe headless
      r.tile.classList.remove('headless-mode');

      log('info', acc, 'Modo webview restaurado');
    }

    return true;
  } catch (err) {
    console.error(`[headless] erro ao alternar ${accId}:`, err);
    raiseAlert(acc, 'Erro', `Falha ao alternar modo: ${err.message}`);
    return false;
  }
}

/**
 * Renderiza um botão toggle para modo headless.
 */
function renderHeadlessToggle(accId, acc) {
  const isHeadless = !!acc.headless;

  return h('div', { class: 'headless-toggle' },
    h('label', { class: 'toggle-container', title: isHeadless ? 'Desativar modo headless' : 'Ativar modo headless' },
      h('input', {
        type: 'checkbox',
        checked: isHeadless,
        onchange: (e) => {
          toggleHeadlessMode(accId, e.target.checked);
        },
      }),
      h('span', { class: 'toggle-label' },
        isHeadless ? h('span', { class: 'mode-label' }, '⚡ Headless') : 'Normal'
      )
    )
  );
}

module.exports = { toggleHeadlessMode, renderHeadlessToggle };
