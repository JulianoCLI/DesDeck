# Sistema de Cadastro em Lote — Status Geral

**Data:** 24 de Novembro de 2026  
**Versão:** Fase A + Fase B (pronto p/ integração)

---

## 📊 Status por Fase

### ✅ **Fase A: Offline (Completo)**

#### Arquitetura Implementada
- **Gerador** (`src/cadastro/gerador.js`): Identidades (email, nick, senha)
- **Agente** (`src/cadastro/agente.js`): Máquina de estados para 1 conta
- **Fila** (`src/cadastro/fila.js`): Orquestra lote de 10

#### Testes (34 total ✅)
- `test-cadastro-gerador.js`: 23 testes ✅
  - Validação de senha (mín 12, strong)
  - Bloco de 4 (base incremental)
  - E-mail derivado do nick
  - 10 presets + customizado
  - Lote de 10 nicks únicos

- `test-cadastro-agente.js`: 6 testes ✅
  - Fluxo completo (sucesso)
  - E-mail duplicado → falha controlada
  - PIN inesperado → detectado
  - Verificação 100%
  - Starter aleatório/fixo

- `test-cadastro-fila.js`: 5 testes ✅
  - Lote de 10 contas
  - Nicks e e-mails únicos
  - Ritmo respeitado
  - Relatório final

#### Regras Validadas
✅ Sem PIN (confirmado safe)  
✅ E-mail: `{nick}@gmail.com` (sempre)  
✅ Senha: 12+ chars, maiúscula + número + símbolo  
✅ Nick: bloco de 4 (base → base2 → base3)  
✅ Nenhum ponto/carácter especial no nick  
✅ 100% verificação por batch  

#### 10 Presets
1. numeros: 1–10
2. numerosZero: 01–10
3. minusculas: a–j
4. maiusculas: A–J
5. romanos: I–X
6. anosCurtos: 21–30
7. duplas: 11, 22, ..., 00
8. animais: tigre, leao, lobo, ...
9. cores: red, blue, gold, ...
10. elementos: fogo, agua, terra, ...

---

### 🔄 **Fase B: Integração IPC + UI (Pronto p/ código)**

#### Arquivos Criados
- `src/cadastro/ipc-handlers.js`: Handlers para IPC Main (6 canais)
- `src/renderer/cadastro.js`: UI renderer (form + progresso + log)
- `src/renderer/cadastro.css`: Estilos (gradiente, animações, responsive)
- `FASE-B-INTEGRACAO.md`: Instruções paso a paso

#### O que falta (Integração simples)
1. **main.js**: Adicionar 3 linhas
   ```javascript
   const { registrarHandlersCadastro } = require('./cadastro/ipc-handlers');
   // ...
   registrarHandlersCadastro(handle, net);
   ```

2. **index.html**: Adicionar aba + importar CSS/JS
   ```html
   <div id="cadastro-container"></div>
   <link rel="stylesheet" href="cadastro.css" />
   ```

3. **index.js (renderer)**: Montar UI
   ```javascript
   const { CadastroUI } = require('./cadastro');
   new CadastroUI().mount('#cadastro-container');
   ```

#### Canais IPC Implementados
| Canal | Input | Output | Status |
|-------|-------|--------|--------|
| `cadastro:start` | config | { id, status } | ✅ Pronto |
| `cadastro:status` | id | relatorio | ✅ Pronto |
| `cadastro:stop` | id | { ok } | ✅ Pronto |
| `cadastro:presets` | — | { presets } | ✅ Pronto |
| `cadastro:validar-senha` | senha | { ok, erro } | ✅ Pronto |
| `cadastro:validar-custom` | sufixos | { ok, erro } | ✅ Pronto |

#### UI Features
- ✅ Form com inputs validados
- ✅ Seleção de preset + custom
- ✅ Validação em tempo real (senha, sufixos)
- ✅ Progresso com barra
- ✅ Log de cada conta em tempo real
- ✅ Stats (confirmadas/falhadas)
- ✅ Responsivo (mobile-friendly)

---

### ⏳ **Fase C: Prova de Conceito Real (Próxima)**

#### O que será feito
1. Teste com 1 conta real (prova)
   - E-mail pessoal
   - Verificar se cria de verdade
   - Sem PIN obrigatório

2. Teste com lote de 10
   - Base: "prova"
   - Preset: "numeros"
   - Starter: Guilmon (fixo)

3. Verificação 100%
   - Todos 10 criados?
   - Todos persistidos em vault?
   - Relatório completo

#### Pré-requisitos
- [ ] Fase B integrada e testada
- [ ] Cliente WS real (headless/client.js) funcionando
- [ ] Servidor DigiIdle acessível (ou mock completo)
- [ ] Partições de session funcionando

---

## 📁 Estrutura de Arquivos

```
dd-src/
├── src/
│   ├── cadastro/
│   │   ├── gerador.js ✅ (335 linhas, 23 testes)
│   │   ├── agente.js ✅ (243 linhas, 6 testes)
│   │   ├── fila.js ✅ (209 linhas, 5 testes)
│   │   ├── ipc-handlers.js ✅ (200 linhas, pronto)
│   │   └── README.md ✅ (documentação)
│   ├── renderer/
│   │   ├── cadastro.js ✅ (280 linhas, pronto)
│   │   └── cadastro.css ✅ (280 linhas, pronto)
│   └── main.js (precisa integração)
├── test-cadastro-gerador.js ✅ (23 testes)
├── test-cadastro-agente.js ✅ (6 testes)
├── test-cadastro-fila.js ✅ (5 testes)
├── FASE-B-INTEGRACAO.md ✅
└── CADASTRO-STATUS.md ✅ (este arquivo)
```

---

## 🚀 Como Usar (Usuário Final)

### Antes de Fase B estar integrada
```bash
# Testar offline
cd dd-src
node test-cadastro-gerador.js
node test-cadastro-agente.js
node test-cadastro-fila.js
# Todos devem passar ✅
```

### Depois de Fase B integrada
1. Abrir DesDeck
2. Ir para aba "Cadastro"
3. Preencher form:
   - Base: "tamer" (default)
   - Preset: "numeros" (default)
   - Senha: "Abcdefgh1234!" (exemplo)
   - Starter: "Aleatório" (default)
4. Clicar "Iniciar Lote"
5. Monitorar progresso em tempo real
6. Relatório ao final

### Customizar sufixos
1. Mudar Preset para "-- Customizado --"
2. Digitar sufixos: `alfa, beta, gama, delta, epsilon, zeta, eta, theta, iota, kappa`
3. Sistema valida automaticamente
4. Iniciar lote

---

## 📋 Decisões Arquiteturais

| Decisão | Razão |
|---------|-------|
| Sem PIN | Admin aprovou, simplifica fluxo |
| Bloco de 4 | Permite 40+ nicks únicos com 1 preset |
| Partição por conta | Isolamento completo de sessões |
| Fila sequencial | Simplicidade, ritmo configurável, observabilidade |
| Mock WS em Fase A | Teste offline rápido, sem servidor |
| IPC async/await | Melhor integração com Electron modern |
| Relatorio em memória | Dados disponíveis até restart (OK para lotes) |

---

## 🔍 Verificação Pré-Integração

### Checklist
- [x] Todos os 34 testes passam offline
- [x] Gerador valida entrada corretamente
- [x] Agente implementa máquina de estados completa
- [x] Fila injeta mocks automaticamente
- [x] IPC handlers implementados e validam config
- [x] UI renderer tem form completo + validação
- [x] CSS é responsivo e profissional
- [x] Documentação clara (README + FASE-B-INTEGRACAO)
- [x] Nenhum ponto/símbolo especial no nick
- [x] E-mail sempre `@gmail.com`
- [x] Senha validação correta (12+ chars)
- [x] Relatório detalhado por conta

---

## ⚠️ Considerações Importantes

### Segurança
- Senha validada no main process (nunca fica em renderer)
- Credenciais persistidas cifradas via vault
- Sessões isoladas por partição
- IPC protegido (apenas file:// autorizado)

### Performance
- Lote de 10 ~50s (5s entre contas + latência de criação)
- Paralelo não necessário (sequencial é rápido o suficiente)
- Polling de status: 1s (configurável)
- Mocks não usam I/O real

### Escalabilidade
- Suporta múltiplos lotes em paralelo (mapa de filas por ID)
- 10 presets + customizado = 11 combinações
- Até 40+ contas por lote (bloco de 4 reutilizável)
- Tokens/rate-limit: a ser testado em Fase C

---

## 📞 Próximas Etapas

### Imediato
1. Revisar este documento
2. Integrar Fase B (3 mudanças em main.js + HTML)
3. Testar IPC com mock
4. Ajustar CSS conforme necessário

### Curto Prazo
1. Integrar cliente WS real
2. Teste Fase C com 1 conta
3. Teste Fase C com lote de 10
4. Monitorar servidor para erros

### Longo Prazo
1. Histórico de lotes (persistir relatórios)
2. Resumo de lotes (UI dashboard)
3. Auto-retry com backoff exponencial
4. Cancelamento mid-lote

---

## 📚 Referências

- **Código:** `src/cadastro/{gerador,agente,fila}.js`
- **Testes:** `test-cadastro-{gerador,agente,fila}.js`
- **Integração:** `FASE-B-INTEGRACAO.md`
- **Documentação API:** `src/cadastro/README.md`

---

**Fase A ✅ Completa**  
**Fase B 🔄 Pronto para integração (3 mudanças)**  
**Fase C ⏳ Aguarda Fase B + teste real**
