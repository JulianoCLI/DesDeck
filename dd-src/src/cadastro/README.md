# Fase A: Cadastro em Lote (Offline)

## Status
✅ **Completo** — 34 testes passando (gerador, agente, fila)

## Arquitetura

```
Fila (FilaCadastro)
  ├─ Gerador (identidades)
  │   └─ email, nick (bloco-de-4), senha
  │
  └─ Agente (1 conta)
      ├─ 1. POST /auth/criar
      ├─ 2. Conectar WS
      ├─ 3. nick.set
      ├─ 4. visual.set + starter.pick
      ├─ 5. GET /auth/conta (verificar 100%)
      └─ 6. Persistir cofre/deck
```

## Módulos

### `gerador.js`
- **Propósito:** Gerar identidade (email, nick, senha) para conta
- **Entrada:** `config = { base, preset, customNicks, senha }`
- **Saída:** `{ email, nick, senha }`
- **Regras:**
  - E-mail: `{nick}@gmail.com` (derivado, sem _, sem .)
  - Senha: mín 12 chars, maiúscula + número + símbolo
  - Nick: `{base}{sufixo}` para bloco 0–3; `{base}2{sufixo}` para bloco 4–7; `{base}3{sufixo}` para bloco 8–9
  - 10 presets ou customizado

### `agente.js`
- **Propósito:** Máquina de estados para 1 conta
- **Estados:** pendente → criada → nick_ok → starter_ok → confirmada | falhou
- **Entrada:** `config = { indice, identidade, partition, net, session, starterFixo }`
- **Saída:** evento `confirmada` ou `falhou`
- **Eventos:** `status`, `confirmada`, `falhou`

### `fila.js`
- **Propósito:** Orquestra lote de 10 contas
- **Entrada:** `config = { base, preset, customNicks, senha, starterFixo, ritmo, net, session }`
- **Ritmo:** `{ entre: 5000, cooldown: 2000 }` (ms entre contas)
- **Saída:** evento `fim` com relatório
- **Eventos:** `inicio`, `conta`, `conta:status`, `fim`

## Testes

### `test-cadastro-gerador.js` (23 testes ✅)
- Validação de senha (comprimento, caracteres)
- Regra de nick por bloco
- E-mail derivado
- Presets e customização
- Lote de 10

### `test-cadastro-agente.js` (6 testes ✅)
- Fluxo completo (sucesso)
- E-mail duplicado
- PIN inesperado
- Verificação falha
- Starter aleatório/fixo

### `test-cadastro-fila.js` (5 testes ✅)
- Lote de 10 contas
- Relatório resumido
- Nicks únicos
- E-mails únicos
- Ritmo respeitado

## 10 Presets de Nick

| # | Nome | Variações |
|---|---|---|
| 1 | numeros | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 |
| 2 | numerosZero | 01, 02, 03, 04, 05, 06, 07, 08, 09, 10 |
| 3 | minusculas | a, b, c, d, e, f, g, h, i, j |
| 4 | maiusculas | A, B, C, D, E, F, G, H, I, J |
| 5 | romanos | I, II, III, IV, V, VI, VII, VIII, IX, X |
| 6 | anosCurtos | 21, 22, 23, 24, 25, 26, 27, 28, 29, 30 |
| 7 | duplas | 11, 22, 33, 44, 55, 66, 77, 88, 99, 00 |
| 8 | animais | tigre, leao, lobo, foca, bode, touro, lince, morsa, anta, puma |
| 9 | cores | red, blue, gold, gray, green, cyan, lime, teal, plum, rose |
| 10 | elementos | fogo, agua, terra, vento, raio, gelo, luz, trevas, metal, veneno |

## Exemplo de Uso

```javascript
const { FilaCadastro } = require('./cadastro/fila');

const fila = new FilaCadastro({
  base: 'tamer',
  preset: 'numeros',
  senha: 'Abcdefgh1234!',  // 12+ chars, maiúscula, número, símbolo
  starterFixo: null,       // null = aleatório
  ritmo: { entre: 5000, cooldown: 2000 },
  net: (url, opts) => fetch(url, opts),
  session: session.fromPartition('persist:lote-1'),
});

fila.on('inicio', (ev) => console.log(`Iniciando lote de ${ev.tamanho}`));
fila.on('conta', (ev) => console.log(`Conta ${ev.indice}: ${ev.status}`));
fila.on('fim', (relatorio) => {
  console.log(`✅ ${relatorio.confirmadas}/${relatorio.tamanho} confirmadas`);
});

await fila.processar();
```

## Próximas Etapas (Fase B)

1. **IPC handlers** em `src/main.js`:
   - `cadastro:start` — inicia fila
   - `cadastro:config` — configura (preset, base, senha)

2. **UI** em `src/renderer/cadastro.js`:
   - Entrada de senha
   - Seleção de preset/custom
   - Seleção de starter (fixo/aleatório)
   - Log de progresso
   - Relatório final

3. **Integração de vault**:
   - Persistir credenciais cifradas

4. **Integração de cliente real**:
   - Conectar `headless/client.js` real
   - Usar WS real, não mock

## Notas

- **Sem PIN:** As contas não precisam confirmação por PIN (confirmado pelo admin).
- **Bloco de 4:** A cada 4 contas, o `base` incrementa (tamer → tamer2 → tamer3).
- **Teste offline:** Fase A usa mocks para HTTP e WS; nenhum contato com servidor real.
- **Fase C:** Teste real com 1 conta de prova, depois lote de 10 em modo ensaio.
