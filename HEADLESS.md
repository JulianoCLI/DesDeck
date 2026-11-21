# Modo headless

O modo headless roda a conta pelo WebSocket do jogo, sem webview. O objetivo é
RAM: uma conta em headless custa **10 MB**, contra **~254 MB** de cada webview
adicional ([medido](#a-economia-de-ram-medida)).

A troca é: a conta continua jogando e as automações continuam funcionando, mas
não há tela. É por conta, não global — dá para deixar a conta que você olha em
webview e as outras em headless.

## Como ligar

- **Por conta:** o botão de energia no card da conta.
- **Todas, desde a abertura:** a preferência `bootHeadless` nos ajustes. Evita o
  pico de RAM de subir 5 Chromium e derrubá-los em seguida.

A conta **precisa ter feito login na webview pelo menos uma vez**. O headless não
tem tela de login: ele reusa o cookie de sessão da partição
`persist:acc-<id>`. Sem o cookie `digiclone_sessao`, ele não conecta e diz isso.

### Os três estados de uma conta

`acc.headless` não é um booleano de dois valores — são três, porque a escolha
feita numa conta tem que poder contrariar a preferência geral:

| valor | efeito |
|---|---|
| `true` | headless, mesmo com `bootHeadless` desligado |
| `false` | webview, mesmo com `bootHeadless` **ligado** |
| `undefined` | segue `bootHeadless` |

Sem o `false` explícito não havia como tirar **uma** conta do headless com a
preferência ligada: a preferência vencia sempre e o botão de energia não saía do
modo. Contas salvas antes disso migram com `false -> undefined`, porque aquele
`false` era só o padrão antigo, não uma escolha.

### Quando não conecta

O card mostra `⚡ falhou` e o **motivo** no banner. O status vem do socket,
traduzido: `desligado`, `conectando…`, `Headless`, `reconectando…`, `falhou`.
Todo erro passa por `client.falhar()`, que guarda o motivo em `lastError` além de
emitir o evento, e `disconnect()` não sobrescreve um `failed` — senão o
diagnóstico desaparecia justamente quando a pessoa fosse ler o card.

A causa mais comum é a conta nunca ter feito login; a mensagem diz o que fazer.
Para ver isso de fora, sem abrir o app: `diag-sessoes.js` (abaixo).

## Como funciona

```
cookie da partição  ->  wss://digiidle.com/ws?off=1&dl=1  ->  estado do jogo
                                                                    |
                                               as 4 ferramentas, no processo principal
```

| Arquivo | Papel |
|---|---|
| `src/headless/cookies.js` | tira o cookie de sessão da partição da conta |
| `src/headless/client.js` | o socket: conecta, roteia mensagens, mantém o estado |
| `src/headless/manager.js` | um client por conta; agrega eventos para a UI |
| `src/headless/tools.js` | as 4 ferramentas, operando sobre o socket |
| `src/headless/catalogo.js` | os `/shared/*.json` do jogo, com cache de 1 h |
| `src/headless/ovo-tier.js` | o cálculo de tier de ovo, que o servidor não manda |

O socket é o mesmo que a página usa, com os mesmos parâmetros (`off=1&dl=1`, sem
compressão para o JSON ficar legível), ping a cada 25 s e backoff de 2 s a 30 s na
reconexão. Os códigos de fechamento 4000 (jogo aberto em outro lugar) e 4001
(bloqueio) param sem insistir — insistir não resolveria nenhum dos dois.

**O servidor aceita uma conexão por conta.** Então o DesDeck precisa estar fechado
para rodar os testes abaixo, e a mesma conta não pode estar em webview e headless
ao mesmo tempo (o toggle cuida disso).

## As ferramentas

As mesmas 4 da webview, com a mesma configuração. A diferença é onde rodam: na
webview o DesDeck injeta um script na página; em headless não há página, então a
ferramenta roda no processo principal e fala direto com o socket.

O `applyToolLive()` do renderer decide o caminho pela existência da webview, e as
ferramentas sobem quando o socket conecta e em cada reconexão.

Três coisas o headless tem que resolver sozinho, por não ter página:

- **Scan:** a versão da webview observa a cena. Com Modo Economia o servidor para
  de mandar a cena, e o headless nunca a pede. Então o scan é reativo aos eventos
  `batalha`, que chegam de todo jeito: cada inimigo morto vira um evento `corpo`.
- **Preços:** a Loja cobra o que está em `/shared/itens.json`. Sem ler de lá, o
  refill chuta e o servidor recusa a compra.
- **Tier do ovo:** **o pacote `ovos` não traz o tier.** Ele manda `especie`,
  `ivs`, `u`, `potencia` e `data`; a letra (D a SSS) é calculada no cliente. A
  versão da webview importa os módulos do jogo; o headless usa o porte em
  `ovo-tier.js`.

Se uma ferramenta não consegue carregar o que precisa, ela **não age**. Agir com
preço ou tier chutado é pior do que não agir: ovo vendido não volta.

## Testes

```powershell
cd dd-src

# A corrente UI -> preload -> main -> manager -> client -> ferramenta.
# Offline, sem conta, rápido. Pega handler IPC faltando.
node test-ipc-tools.js

# Os três estados de "esta conta roda em headless?". Extrai isHeadless()
# do app.js e testa o código de verdade, não uma cópia.
node test-modo-headless.js

# O boot com bootHeadless ligado: roda o DesDeck real num perfil
# separado e conta processos de renderer. 1 = só a janela (certo),
# 3 = a janela + as webviews das contas (o bug das duas conexões).
node test-boot-headless.js

# Qual modo e qual sessão cada conta real tem. Read-only.
.\node_modules\electron\dist\electron.exe diag-sessoes.js

# Ligar o headless na mão, pelo caminho real, mostrando os eventos que
# a UI receberia e por quê falhou. Não muta a conta.
.\node_modules\electron\dist\electron.exe test-toggle-headless.js "DigiIdle 1"

# O porte do tier contra o módulo do próprio jogo, em 4005 ovos.
.\node_modules\electron\dist\electron.exe verify-tier.js

# As 4 ferramentas numa conta real, em MODO SEGURO: sendCommand é
# substituído por um espião que registra em vez de enviar, então
# nenhum scanner, bit ou ovo é gasto.
.\node_modules\electron\dist\electron.exe test-tools-headless.js <login> <senha> 150

# A RAM nos dois modos. O DesDeck precisa estar FECHADO: o servidor
# aceita uma conexão por conta. Leva ~2,5 min.
.\node_modules\electron\dist\electron.exe measure-ram.js <login> <senha>
```

Os dois últimos escrevem em `*-report.txt`: o stdout do Electron no Windows se
perde quando o processo sai logo depois de escrever. Os relatórios estão no
`.gitignore` porque trazem o nick e o saldo da conta testada.

### O que já foi verificado

- **Tier do ovo:** 4005/4005 ovos com a mesma letra do módulo do jogo, cobrindo
  todos os tiers e os casos de borda (sem `ivs`, espécie inexistente).
- **As 4 ferramentas, em conta real:** scan em 58 de 58 mortes sem repetir corpo;
  refill comprando ao preço certo e dentro do saldo, respeitando a confirmação
  antes de insistir; `hunt.select` com a área recomendada; venda só de ovos
  dentro do filtro de tier.
- **A corrente até a UI:** os 5 canais IPC existem dos dois lados, religar uma
  ferramenta troca a config sem duplicar o laço, e sem socket nada é enviado.
- **O boot em headless:** com `bootHeadless` ligado e 2 contas, sobe 1 renderer
  (a janela) e nenhuma página de conta — nenhum `src` é setado no `<webview>`.
- **A falha sem login:** o toggle manual numa conta sem sessão termina em
  `failed`, com o motivo preservado no `lastError` para o card exibir.

## A economia de RAM, medida

Medido na mesma conta, nos dois modos, com `app.getAppMetrics()`
(`measure-ram.js`). Os números antigos deste repositório eram chute; estes não.

| | RAM |
|---|---|
| headless, por conta | **10 MB** |
| webview, cada conta a mais | **254 MB** |
| webview, a primeira conta | 1013 MB |
| base do app (paga nos dois modos) | ~195 MB |

A primeira webview custa muito mais que as seguintes porque arrasta os serviços
**compartilhados** do Chromium: a GPU salta de 67 para 366 MB, e entram áudio
(85 MB) e captura de vídeo (115 MB). Esses ~760 MB são pagos uma vez, não por
conta — o que escala é o marginal de 254 MB.

Projeção, somando base + compartilhado + N × marginal:

| contas | webview | headless | economia |
|---|---|---|---|
| 1 | 1207 MB | 204 MB | 1003 MB (83%) |
| 4 | 1970 MB | 234 MB | 1736 MB (88%) |
| 5 | 2225 MB | 244 MB | 1981 MB (89%) |
| 10 | 3497 MB | 294 MB | 3203 MB (92%) |

Com as ressalvas de sempre: é uma medida, numa máquina, e o Chromium varia com o
uso. A projeção assume que o marginal se repete igual, o que é otimista — na
prática as contas disputam cache. E a base de ~195 MB você paga em headless
também, porque o Electron continua de pé.

## Histórico

Este arquivo substitui oito relatórios de fase (`HEADLESS_PHASE3_COMPLETE.md`,
`PHASE4_COMPLETE.md`, `FINAL_SUMMARY.md` e outros). Eles se contradiziam e
afirmavam que as ferramentas estavam prontas quando nenhuma das 4 funcionava: duas
eram stubs que nunca agiam, o refill pedia quantidades impossíveis e a venda de
ovos ignorava o filtro de tier, vendendo SSS com a configuração padrão. O que
aconteceu em cada fase está nos commits, que é onde esse histórico pertence.
