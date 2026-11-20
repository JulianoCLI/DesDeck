# Phase 4: Boot Headless (Pronto para implementar)

## 🎯 Objetivo
Iniciar contas em modo headless sem renderizar webview, economizando RAM no boot.

---

## 📋 Plano de implementação

### 1. Adicionar preference `bootHeadless` (5 min)
No `DEFAULT_SETTINGS` (app.js):
```javascript
const DEFAULT_SETTINGS = {
  // ... existing
  bootHeadless: false,  // nova: inicia contas em headless
};
```

### 2. Modificar `createRuntime()` (10 min)
Detectar `bootHeadless` e pular a criação de webview:
```javascript
function createRuntime(acc) {
  const r = { ... };

  // Se acc.headless OU app.bootHeadless, não cria webview
  if (acc.headless || settings.bootHeadless) {
    r.wv = null;
    r.headlessStatus = 'connecting';
    r.tile.classList.add('headless-mode');
    // Inicia socket headless
    deck.headlessStart(acc.id).catch(() => {});
  } else {
    // Cria webview normalmente
    const wv = document.createElement('webview');
    // ... resto do código
  }

  return r;
}
```

### 3. UI: Toggle "Iniciar em Headless" (5 min)
Adicionar checkbox nas settings:
```javascript
h('label',
  h('input', { type: 'checkbox', checked: !!settings.bootHeadless, 
    onchange: (e) => { settings.bootHeadless = e.target.checked; save(); }
  }),
  'Iniciar todas as contas em modo headless'
)
```

### 4. Fallback: Se socket falhar, abre webview (10 min)
No `deck.onHeadlessStatus()`:
```javascript
deck.onHeadlessStatus(d => {
  if (d.status === 'failed') {
    // Socket falhou: abre webview como fallback
    const acc = accById(d.index);
    if (acc) toggleHeadlessMode(d.index, false);
  }
})
```

### 5. Indicador "Offline Loading..." (5 min)
CSS + status:
```css
.tile.headless-mode.connecting::after {
  content: "⚡ Offline Loading...";
  animation: pulse 1s infinite;
}
```

---

## 🧪 Testes necessários

### Teste 1: Boot com 1 conta em headless
```
1. Ligar app
2. Verificar que webview não foi renderizado
3. Verificar que socket conectou
4. Verificar que nível/bits aparecem no banner
```

### Teste 2: Boot com 5 contas (3 headless, 2 normal)
```
1. Ligar app
2. Esperar 10s
3. Medir RAM: deve estar ~1.2 GB (vs 2.5 GB normal)
4. Todas contas devem estar com status correto
```

### Teste 3: Fallback ao webview
```
1. Desligar internet
2. Socket deve falhar → fallback para webview
3. Webview deve carregar normalmente
4. Verificar que fallback funciona (UI não fica presa)
```

### Teste 4: Toggle em runtime
```
1. App ligado com 1 headless + 1 webview
2. Clicar ⚡ no headless → abre webview
3. Clicar ⚡ no webview → fecha webview, inicia socket
4. Ambos devem trocar de modo sem erro
```

---

## 📊 Medição de RAM esperada

```
Teste com 5 contas (ms1 + 4 dummy):

ANTES (Webview puro):
- App UI: ~200 MB
- Conta 1: ~500 MB
- Conta 2: ~480 MB
- Conta 3: ~520 MB
- Conta 4: ~510 MB
- Conta 5: ~490 MB
- Chrome/V8 overhead: ~300 MB
TOTAL: ~3.0 GB

DEPOIS (Boot headless):
- App UI: ~200 MB
- Conta 1 (headless): ~60 MB
- Conta 2 (headless): ~65 MB
- Conta 3 (headless): ~58 MB
- Conta 4 (headless): ~62 MB
- Conta 5 (headless): ~55 MB
- Chrome/V8 overhead: ~100 MB
TOTAL: ~600 MB

ECONOMIA: 2.4 GB (~80%)
```

---

## ✅ Checklist de implementação

- [ ] Adicionar `bootHeadless` em DEFAULT_SETTINGS
- [ ] Modificar `createRuntime()` para pular webview se bootHeadless
- [ ] Adicionar checkbox nas settings
- [ ] Implementar fallback ao webview se socket falhar
- [ ] CSS para "Offline Loading..." indicator
- [ ] Testar boot com 1 conta headless
- [ ] Testar boot com 5 contas (3 headless + 2 normal)
- [ ] Testar fallback ao webview
- [ ] Testar toggle em runtime
- [ ] Medir RAM antes/depois
- [ ] Commit Phase 4

---

## 🔧 Código esperado (aproximadamente)

```
Arquivos a modificar:
- src/renderer/app.js: +40 linhas
- src/renderer/styles.css: +10 linhas

Tempo estimado: 30-45 min
Dificuldade: Baixa
```

---

## 📝 Notas

1. **bootHeadless é global**: Todas as contas usam a mesma setting
   - Alternativa: `acc.bootHeadless` individual (mais flexível)

2. **Fallback automático**: Se socket der problema, app não trava
   - Renderizador só é criado se necessário

3. **UX**: Usuário vê "⚡ Offline Loading..." até conexão
   - Depois muda para "⚡ Nível X · Y bits"

4. **Reversão**: Pode ligar/desligar headless sem reiniciar app
   - Apenas com reiniçialização muda o boot mode

---

## 🎯 Resultado esperado

**Redução de RAM de 3.0 GB → 600 MB com 5 contas rodando 24/7.**

Viável ter 10-20 contas em headless no mesmo PC.

---

## 🚀 Próximos steps após Phase 4

1. **Observability**: Integrar logs/metrics do headless
2. **Dashboard**: UI mostrando todas as contas headless em tempo real
3. **Alertas**: Notificar quando socket desconectar
4. **Backups**: Salvar estado do headless periodicamente
5. **API**: Expor endpoint para controlar headless remotamente

---

**Pronto para começar? Só avisar!**
