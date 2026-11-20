# Modo headless

O modo headless roda a conta pelo WebSocket do jogo, sem webview. O objetivo é
RAM: cada webview é um processo Chromium completo, e um socket não é.

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

# O porte do tier contra o módulo do próprio jogo, em 4005 ovos.
.\node_modules\electron\dist\electron.exe verify-tier.js

# As 4 ferramentas numa conta real, em MODO SEGURO: sendCommand é
# substituído por um espião que registra em vez de enviar, então
# nenhum scanner, bit ou ovo é gasto.
.\node_modules\electron\dist\electron.exe test-tools-headless.js <login> <senha> 150
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

### O que ainda não foi medido

**A redução de RAM.** É a razão de o modo existir e continua sendo uma estimativa:
falta medir com 5 contas, webview contra headless. Qualquer número de economia
que você vir em doc antigo deste repositório era chute, não medição.

## Histórico

Este arquivo substitui oito relatórios de fase (`HEADLESS_PHASE3_COMPLETE.md`,
`PHASE4_COMPLETE.md`, `FINAL_SUMMARY.md` e outros). Eles se contradiziam e
afirmavam que as ferramentas estavam prontas quando nenhuma das 4 funcionava: duas
eram stubs que nunca agiam, o refill pedia quantidades impossíveis e a venda de
ovos ignorava o filtro de tier, vendendo SSS com a configuração padrão. O que
aconteceu em cada fase está nos commits, que é onde esse histórico pertence.
