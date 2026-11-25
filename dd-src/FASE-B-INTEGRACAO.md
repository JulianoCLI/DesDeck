# Fase B: Integração IPC + UI + Produção

## Status
🔄 **Em andamento** — Arquivos criados, pronto para integrar em `main.js` e HTML

## O que foi criado

### 1. Handlers IPC (`src/cadastro/ipc-handlers.js`)
Funções registradas:
- `cadastro:start(config)` → Inicia lote
- `cadastro:status(id)` → Retorna status
- `cadastro:stop(id)` → Para lote
- `cadastro:presets()` → Lista presets
- `cadastro:validar-senha(senha)` → Valida senha
- `cadastro:validar-custom(sufixos)` → Valida custom

### 2. UI do Renderer (`src/renderer/cadastro.js` + `cadastro.css`)
- Form de configuração
- Log em tempo real
- Relatório final
- Validação de entrada

## Próximas etapas

### A. Integrar IPC em `src/main.js`

Encontre `function registerIpc()` (linha ~197) e adicione, logo antes do fechamento:

```javascript
// Importar handlers de cadastro
const { registrarHandlersCadastro } = require('./cadastro/ipc-handlers');

// ... dentro de registerIpc()

// Registrar cadastro
registrarHandlersCadastro(handle, net);
```

**Verificar:**
- O `handle` já existe (função helper)
- O `net` é passado para `registrarHandlersCadastro`

### B. Importar UI no HTML

No seu `src/renderer/index.html`, adicione uma aba para cadastro:

```html
<!-- Na seção de tabs -->
<div class="tab-cadastro" id="tab-cadastro">
  <div id="cadastro-container"></div>
</div>
```

E no seu `src/renderer/index.js` (ou equivalente), inicialize a UI:

```javascript
const { CadastroUI } = require('./cadastro');

const cadastroUI = new CadastroUI();
// Esperar DOM pronto
document.addEventListener('DOMContentLoaded', () => {
  cadastroUI.mount('#cadastro-container');
});
```

**Lembrar:**
- Incluir `cadastro.css` no HEAD do HTML: `<link rel="stylesheet" href="cadastro.css" />`
- Ou importar no JS: `require('./cadastro.css')`

### C. Integrar com cliente WebSocket real

Atualmente, `FilaCadastro._processarConta()` injeta um **mock** de WS.

Para produção:
1. Importar `HeadlessManager` em `src/cadastro/fila.js`
2. Passar instância real do manager na config
3. Substituir mock por cliente real

```javascript
// Em fila.js, _processarConta():
if (!agente.wsClient) {
  // Em produção, usar headless manager
  if (config.headlessManager) {
    agente.wsClient = config.headlessManager.getClient(); // ou equivalente
  }
}
```

### D. Testar integração

**Testes de integração** (manuais por enquanto):

```javascript
// Em um teste de integração
const { FilaCadastro } = require('./cadastro/fila');
const { HeadlessManager } = require('./headless/manager');

const manager = new HeadlessManager();
const fila = new FilaCadastro({
  base: 'tamer',
  preset: 'numeros',
  senha: 'Abcdefgh1234!',
  headlessManager: manager,
  net,
  session,
});

// ... rest
```

## Fluxo completo (Fase B)

```
Usuário preenchendo form
        ↓
ipcRenderer.invoke('cadastro:start', config)
        ↓
Main process recebe via ipcMain.handle
        ↓
registrarHandlersCadastro valida config
        ↓
Cria nova FilaCadastro com net real + session real
        ↓
Injeta wsClient real (headless manager)
        ↓
fila.processar() roda em background
        ↓
Eventos emitidos (conta, conta:status, fim)
        ↓
ipcRenderer.invoke('cadastro:status') polls a cada 1s
        ↓
UI atualiza progresso/log em tempo real
        ↓
Fim: 10/10 confirmadas ou relatorio com falhas
```

## Checklist Fase B

- [ ] Adicionar `registrarHandlersCadastro(handle, net)` em `main.js`
- [ ] Incluir CSS do cadastro no HTML
- [ ] Importar `CadastroUI` no renderer
- [ ] Montar UI em container
- [ ] Testar form básico (validações)
- [ ] Testar IPC `cadastro:presets()`
- [ ] Testar IPC `cadastro:start(config)` com mock (net fake)
- [ ] Verificar polling de status funciona
- [ ] Integrar `headless` para WS real
- [ ] Testar fluxo completo com 1 conta de prova

## Fase C (Prova de Conceito Real)

Depois que Fase B estiver funcional:

1. Teste com 1 conta real
   - Usar e-mail pessoal (prova de conceito)
   - Verificar se cria de verdade
   - Sem PIN obrigatório

2. Teste com lote de 10
   - Base: "prova"
   - Preset: "numeros"
   - Starter: Guilmon (fixo para reproduzibilidade)
   - Monitorar servidor para erros

3. Relatório final
   - Todos 10 criados?
   - Todos 100% verificados?
   - Dados persistidos em vault?

## Notas Importantes

### Segurança
- Senha nunca fica em memória do renderer (é validada/usada apenas no main)
- Credenciais são persistidas cifradas via `vault.js`
- Sessões isoladas por partição (uma conta = uma sessão)

### Performance
- Lote de 10 com ritmo de 5s entre = ~50s total
- Paralelo não é necessário (sequencial já é rápido)
- WebSocket reutiliza conexão por partição

### Tolerância a Falhas
- Se 1 conta falhar, lote continua (10 tentativas por conta)
- Relatório mostra exatamente qual falhou e por quê
- Re-tentar = gerar novo email/nick e repetir fluxo

## Referências

- **Gerador:** `src/cadastro/gerador.js` — 23 testes ✅
- **Agente:** `src/cadastro/agente.js` — 6 testes ✅
- **Fila:** `src/cadastro/fila.js` — 5 testes ✅
- **Handlers:** `src/cadastro/ipc-handlers.js` — pronto p/ integração
- **UI:** `src/renderer/cadastro.js` + `.css` — pronto p/ integração
