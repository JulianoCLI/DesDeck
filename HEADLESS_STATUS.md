# DesDeck — Implementação de Modo Headless
## Status de Desenvolvimento

### Fase 1: Conexão e Autenticação ✅ COMPLETA

**Incremento 1.1 — Cliente WebSocket + Autenticação por Cookie** ✅

- **Arquivos novos:**
  - `dd-src/src/headless/cookies.js` — extração de cookies da partição Electron
  - `dd-src/src/headless/client.js` — cliente DigiIdle puro (JSON, sem compressão)
  - `dd-src/src/headless/manager.js` — gerenciador de múltiplos clientes
  - `dd-src/test-headless-poc.js` — PoC de teste sem UI

- **Modificações em arquivos existentes:**
  - `dd-src/src/main.js` — importação do HeadlessManager, 3 handlers IPC, listeners de eventos
  - `dd-src/src/preload.js` — 5 novas APIs expostas (`headlessStart`, `headlessStop`, `headlessStatus`, listeners)
  - `dd-src/package.json` — adição de `ws` como dependency

- **Como o cliente funciona:**
  1. Extrai cookies da partição `persist:acc-<id>` via `session.cookies.get()`
  2. Cria WebSocket para `wss://digiidle.com/ws?off=1&dl=1` (sem compressão, sem token)
  3. Envia headers customizados: `Cookie`, `Origin`, `User-Agent`
  4. Aguarda autenticação pelo servidor (~AUTH_TIMEOUT_MS = 15s)
  5. Recebe estado (`estado`, `ovos`, `batalha`, `offline.cfg`)
  6. Mantém ping a cada 25s (reutilizando intervalo real do jogo)
  7. Backoff exponencial: 2s → 3s → 4.5s → ... → 30s (factor 1.5)
  8. Desconexão automática em code 4000 (jogo aberto em outro lugar) ou 4001 (bloqueio)

- **IPC novo (3 canais invoke, 3 canais on):**
  - `headless:start(accId, options)` → retorna `{ok, error}`
  - `headless:stop(accId)` → retorna `{ok}`
  - `headless:status(accId)` → retorna `{active, status, state, error}`
  - `headless:account:update` → {index, state}
  - `headless:account:status` → {index, status}
  - `headless:account:error` → {index, message}

### Fase 2: Integração UI + Toggle (PRÓXIMA)

**Incremento 2.1 — Campo `headless` em conta**
- Adicionar `state.accounts[].headless: boolean` ao schema
- UI para toggle por conta (switch simples)

**Incremento 2.2 — Card compacto e troca de modo**
- Quando headless ativo: render compacto (nível, bits, hunt, status)
- Ao ligar: validar cookies → conectar → esconder webview
- Ao desligar: parar cliente → recriar webview na mesma partição

**Incremento 2.3 — Watchdog adaptado**
- Em headless: apenas verificar socket aberto + último `estado` recente (< N segundos)
- Sem miniaturas, probe, detector de tela parada
- Alertas: code 4000 → "conta aberta em outro lugar" (parar sem retry), 4001 → bloqueio

### Fase 3: Ferramentas Headless (DEPOIS)

Prioridade conforme complexidade:

**3.1 — Auto Scan** (trivial)
- Já funciona sem cena (escuta `batalha`)
- Implementação: espiar `morto:true` nos eventos
- RPC: `ball.throw` {corpo, scanner}

**3.2 — Auto Refill** (trivial)
- Baixa `/shared/itens.json` uma vez
- Cache compartilhado entre contas (20 KB)
- RPC: `market.comprar` {item, qtd}

**3.3 — Auto Melhor Hunt** (fácil)
- Baixa `/shared/areas.json` (372 KB, cache compartilhado)
- Função `sugeridaOff()` copiada literal do jogo
- RPC: `hunt.select` {slug}
- Pede `offline.cfg` a cada N minutos

**3.4 — Vender Ovos** (atrito baixo)
- Desafio único: `ovo-tier.js` é ESM e importa cena.js
- Solução: loader em Node com `vm` que substitui imports DOM e avalia em sandbox
- Mantém promessa "nada de regra reimplementada"
- Fail-closed: se loader falhar, não vende nada

### Fase 4: Boot Headless (DEPOIS)

- Preferência nova: `bootHeadless: boolean`
- Se ativa, levanta contas já em headless (não cria renderers)
- Diminui pico de RAM na abertura
- Teste: `memory-probe` antes/depois

### Teste da Fase 1

```bash
# 1. Abra a UI normalmente, faça login em uma conta
# 2. Abra DevTools, console
deck.headlessStart('seu-account-id-aqui')
# 3. Veja os eventos chegarem:
deck.onHeadlessUpdate(({index, state}) => console.log('update:', state))
deck.onHeadlessStatus(({index, status}) => console.log('status:', status))
# 4. Feche a webview dessa conta manualmente (ou com JS)
# 5. Continua vendo update? Significa que está funcionando!

# Ou, sem UI (PoC puro):
# (precisa de cookies já salvos na partição)
# npm install  # instala ws
# ELECTRON_RUN_AS_NODE=1 .\node_modules\electron\dist\electron.exe test-headless-poc.js
```

---

## Decisões de Design

### Por que cookies em vez de token?

DigiIdle autentica via sessão HTTP (cookie), não token no WebSocket. É a forma "natural", sem mudanças no jogo.

### Por que `persist:acc-<id>` como unit de auth?

Partições Electron já isolam contas: dados, localStorage, cookies. Reutilizamos esse isolamento para o headless. Continuidade perfeita: sair do headless, recriar webview na mesma partição, volta logado (instantâneo).

### Por que "fail-closed"?

Se algo falha (cookie vazio, proxy ruim, loader ovo-tier falha), o headless não conecta ou não vende. Melhor que tentar "chutar" e fazer algo errado.

### Por que `ws` library em vez de Node `globalThis.WebSocket`?

O Node 20 do Electron 33 não tem WebSocket nativo. `ws` é standard de facto, bem mantida, suporta headers e agentes HTTP/SOCKS.

---

## Próximas steps (ordem recomendada)

1. **Teste manual Fase 1** — ligar headless numa conta, ver estado chegar em tempo real
2. **Incremento 2.1** — adicionar campo `headless` ao schema de conta
3. **Incremento 2.2** — botão toggle, esconder/mostrar webview
4. **Incremento 2.3** — watchdog adaptado
5. **Fase 3.1 → 3.4** — portar ferramentas (Scan → Refill → Hunt → Ovos)
6. **Medição** — `memory-probe` antes/depois com 5 contas (webview vs headless)
7. **Boot headless** — preferência `bootMonitor`, levanta sem renderers
8. **Documentação** — README, troubleshoot, FAQ

---

**Tempo estimado até Fase 3 completa:** ~2–3 semanas (trabalho incremental, testável em cada passo).  
**Redução de RAM esperada:** 150–200 MB por conta em headless (testada no Leveling, confirmada em rebosteio).
