# DesDeck

Navegador multi-conta para jogos idle, feito em Electron. É uma versão customizada do
DigiDeck com **proxy por tela**, **auto-update controlado** e um conjunto de
**ferramentas de automação** configuráveis por conta.

---

## Como rodar

Dois cliques em **`iniciar.bat`**.

Ele confere o ambiente antes de abrir (arquivos do programa, Electron instalado) e,
se faltar alguma dependência, tenta instalar sozinho. Se algo der errado, a janela
fica aberta explicando o quê.

Pela linha de comando, se preferir:

```bash
cd dd-src
npm install
npm start
```

Para gerar um `.exe` portátil (sai em `dd-src/dist/win-unpacked/`):

```bash
cd dd-src
npm run build
```

---

## Ferramentas

Botão **Ferramentas** na barra lateral. Cada uma liga/desliga **por conta** e tem
ajustes próprios. Alterar a configuração vale na hora, **sem recarregar a página**.

Todas vêm desligadas, menos o **Auto Passe**: ele não gasta nada nem muda o que a
conta está fazendo, e esquecer de ligá-lo custa a trilha inteira de 30 dias. Se você
desligar numa conta, a escolha fica gravada e é respeitada.

| Ferramenta | O que faz |
|---|---|
| **Auto Refill** | Compra na Loja quando um item chega ao mínimo e repõe até o máximo (scanners, poções, revives). |
| **Vender ovos** | Vende ovos dos tiers escolhidos de tempos em tempos. Por padrão **não** vende S, SS nem SSS. |
| **Auto Melhor Hunt** | Confere a hunt recomendada do Mapa e troca se não estivermos nela. Também tira a conta do Hospital quando ela fica parada lá. **Nunca** troca durante o Labirinto da Guild. |
| **Auto Scan** | Lança o scan nos corpos caídos — útil em contas sem VIP. Funciona com a cena desligada (Modo Economia). |
| **Auto Labirinto** | Inscreve a conta no lobby do Labirinto da Guild assim que ele reabre. Para de entrar quando os baús do dia acabam (o servidor manda `bauHoje` e `cfg.bauPorDia`), e dá para marcar "entrar/começar mesmo sem baú". Opcionalmente escolhe a dificuldade e começa a corrida sozinha, por três gatilhos (lobby lotado, X min após o mínimo, X min sem ninguém entrar) — só em conta dona ou sub-dona da guild. Nunca chama a guild nem sai do lobby. |
| **Auto Passe** | Resgata o Passe de Batalha todo dia — perder um dia zera a trilha de 30 dias. Pega o Premium atrasado se a conta tiver Premium; **nunca** compra o Premium. **Já vem ligada**, inclusive em conta nova. |
| **Sniper de Mercado** | Varre o Mercado e compra o que está abaixo do teto que você definir (um por moeda: bits e D-Dol). Anúncio retido entra numa fila e é comprado **no instante em que libera** (todo anúncio espera 2 min). Filtra por tier, potência, energia, espécie e moeda. |

### Sniper de Mercado

Cada **alvo** é uma procura salva: o que comprar e até que preço **em cada
moeda**. O alvo tem dois tetos, um em bits e um em D-Dol, e **0 quer dizer "não
compre nesta moeda"** — deixar o D-Dol em 0 é como se diz "isto eu quero, mas só
em bits". Por dentro, um alvo de dois tetos vira duas buscas, uma por moeda: um
teto só não poderia servir às duas, porque 5.000 é troco em bits e uma fortuna em
D-Dol. Dá para ter vários alvos, e eles convivem.

Para criar um, clique em **"Adicionar alvo"**: os campos abrem logo abaixo do
botão, e o alvo só entra na lista quando você clica **"Adicionar"**. Enquanto
isso, ele é um rascunho — não é salvo, e o botão fica travado até haver um teto
(e, se for item, até o item estar escolhido). Antes os campos apareciam no fim da
pilha de alvos, longe do botão que você acabou de clicar.

O detalhe que faz a ferramenta valer a pena é a **retenção**: no DigiIdle todo
anúncio nasce travado e só pode ser comprado 2 min depois (medido em conta real:
119.993 ms). Quem atualiza a página de minuto em minuto chega atrasado. O sniper
enfileira o anúncio e acorda no milissegundo do `libera` — e, quando acorda,
**reconfere o anúncio** antes de pagar: se alguém chegou antes, se o vendedor
retirou ou subiu o preço, ele desiste.

Para **item**, o alvo se escolhe pelo nome: digite "fogo" e a lista filtra até
sobrar o Chip de Fogo. Os nomes são os do jogo (`itens.json`), e a lista são os
**45 itens que o Mercado realmente negocia** — medido pelo comando
`mercado.itens` numa conta real. Isso não é o mesmo que o catálogo inteiro
(~110): Poção, Revive e comida não têm anúncio nenhum, e oferecê-los aqui daria
um alvo que nunca acha nada — do lado de fora, idêntico a ferramenta quebrada.
Quando a busca é ambígua, ela **não escolhe sozinha**: "chip" casa com doze, e
cravar o primeiro compraria Chip de Trevas para quem queria o de Fogo.

As travas, porque aqui se gasta dinheiro de verdade:

- **Alvo com os dois tetos em 0 não compra nada** — e nem pede a lista. É o padrão
  de fábrica, então ligar a ferramenta antes de configurá-la não gasta nem um bit
  nem um D-Dol.
- **Alvo de item sem item escolhido também não vale.** Esse é mais perigoso que o
  teto 0, porque *parece* configurado: o pedido sairia sem `especie`, o servidor
  listaria todo item do Mercado e o sniper compraria qualquer coisa abaixo do
  teto. Um alvo pela metade não vira um alvo largo.
- **Reserva** de bits e de D-Dol que ela nunca encosta.
- **Máximo de compras por hora** (5 de fábrica): é o que segura um erro de
  configuração antes de ele ficar caro.
- O **preço vai junto** no comando `mercado.comprar`, então o servidor recusa a
  compra se o vendedor mudar o valor. É impossível pagar mais do que você viu.
- Saldo curto é **dito no log**, não ignorado em silêncio — senão "nunca compra"
  fica idêntico a "não achou nada".

Vale nos dois modos: na conta com janela (`src/renderer/tools.js`, injetada na
página) e na conta sem janela (`ToolSniper` em `src/headless/tools.js`, falando
direto no socket). São duas implementações da mesma decisão, então as duas têm
teste próprio — um `>` virando `>=` num porte gasta dinheiro de verdade.

Os filtros são os **do servidor**, não nossos: `tiers`, `potencias`, `maisMin`.
Conferido em conta real — `tiers=S,SS,SSS` levou 1728 anúncios para 601;
`potencias=4,5` para 716. O anúncio nem traz a letra do tier, então calculá-la
aqui seria reimplementar regra do jogo. Vale registrar uma armadilha: **potência
não é energia**. `potencias` é o P1–P5; `maisMin` é o +N do ovo. Um pedido com
`maisMin=4` devolveu um ovo `potencia:1`, `data:5` — trocar os dois faria a
ferramenta comprar justamente o que não foi pedido.

### Como foram feitas

As ferramentas não "clicam" na tela: elas falam o mesmo protocolo WebSocket que o
jogo usa, com os comandos que os próprios botões mandam (`market.comprar`,
`ovo.vender`, `hunt.select`, `ball.throw`, `passe.resgatar`, `mercado.listar` /
`mercado.comprar`). Uma ponte
(`window.__ddGame`) escuta o socket por um canal à parte, então o cliente do jogo
segue intacto.

Os nomes dos comandos não são chutados: cada um foi conferido no cliente do jogo
e, quando possível, numa conta real antes de virar código. O Passe, por exemplo,
não tem pacote de leitura — o estado dele vem dentro do `estado`, em
`estado.passe`, e a guarda do resgate (`pode && nivel >= passe.nivel`) é a mesma
condição que liga o botão na tela. Os scripts dessa investigação ficaram no repo
(`test-passe-*.js`), todos somente-leitura.

O Sniper foi levantado do mesmo jeito, e os scripts estão no repo:

| Script | O que prova |
|---|---|
| `test-mercado-grep.js` | Lê o cliente do jogo e extrai os comandos do Mercado. Só baixa arquivos públicos. |
| `test-mercado-campos.js` | Em conta real, os campos de um anúncio e os 2 min de retenção. **Não compra.** |
| `test-mercado-filtros.js` | Que `tiers`/`potencias`/`maisMin` filtram no servidor, e que potência ≠ energia. **Não compra.** |
| `test-sniper-tool.js` | A lógica da ferramenta, contra um mercado de mentira: 21 casos, inclusive os que **não** devem comprar. Sem rede. |
| `test-sniper-vivo.js` | A ferramenta real no mercado real, com a compra interceptada. Prova que o servidor aceita os filtros que ela monta. |
| `test-sniper-real.js` | O protocolo de compra, com uma compra real e barata. |
| `test-sniper-fila.js` | A ferramenta comprando de verdade: `--comprar` para valer, sem a flag é ensaio. |
| `test-sniper-headless.js` | O `ToolSniper` do modo sem janela: 60 casos, com o relógio do servidor controlado — é onde a fila da retenção é exercitada de ponta a ponta. Sem rede. |
| `test-sniper-form.js` | A tela de configuração num `BrowserWindow` de verdade: 43 checagens — o rascunho abrindo abaixo do botão, os dois tetos, o filtro de itens filtrando e o alvo pela metade sendo recusado. Sem rede. |

Vale dizer o que **não** está provado: a compra pela fila foi exercitada contra
um mercado de mentira (`test-sniper-tool.js` e `test-sniper-headless.js`), com o
relógio controlado — inclusive o caso do relógio local fora de hora, que é o que
faria o sniper chegar adiantado e levar recusa do servidor. Nas
rodadas reais, todo anúncio barato já estava liberado há horas, então o caminho
"esperar o `libera` e comprar no instante" ainda não aconteceu em produção. O
código dele é o mesmo nos dois casos, mas a honestidade pede a distinção.

Duas decisões que vale registrar:

- **Nada de regra reimplementada.** O tier do ovo vem do módulo do próprio jogo
  (`/js/ovo-tier.js`) e a hunt recomendada é a função `sugeridaOff()` do cliente,
  copiada sem alterações. Se algo falhar ao carregar, a ferramenta **não age** em vez
  de adivinhar.
- **Configuração ao vivo.** A config fica num objeto mutável na ponte, então salvar
  um ajuste troca os valores do laço que já está rodando — sem criar um segundo laço
  (o que duplicaria compras).

---

## Painel

A tela **Painel** (Ctrl+D) é onde se acompanha o conjunto das contas em modo
headless, que não têm tela para olhar.

**Card de cada conta.** Oito métricas, todas vindas do socket do jogo:

| Campo | De onde vem |
|---|---|
| XP/h, Bits/h, Kills/h | calculadas sobre o **tempo de caça** da sessão |
| Bits | saldo atual |
| D-Dol | `gemas` (não confundir com DCoin, que é a moeda da Shop) |
| Labs | labirintos que ainda cabem hoje (baús por dia − usados) |
| hunt | nome da área onde a conta está caçando |
| caçando há | tempo de caça, que **não** é o tempo conectado |

As taxas aparecem como `—` enquanto a sessão tiver menos de 1 minuto de caça.
É o mesmo corte que o cliente do jogo faz: com 10 segundos de caça, qualquer
número por hora seria invenção. O mesmo vale para "Labs" antes de o lobby
responder — `0` significa "acabaram hoje", `—` significa "ainda não sei".

O card mostra o retrato do Digimon ativo contra o alvo. **Dois cliques no card
focam a conta** (não há mais botões Focar/Recarregar/Editar: eles ocupavam uma
fileira inteira para repetir o que o menu de contexto e a barra lateral já
fazem).

**Atividade.** Só o que vale uma linha:

- ovo capturado, com letra (D…SSS), potência e marca de UX;
- ovo chocado;
- item raro dropado;
- venda ou compra no **Mercado da Comunidade**, com quem, quanto e em que moeda;
- compra do Sniper, com item e valor.

Não há faixa de KPIs no topo: ela gastava a primeira tela inteira com números
que o resto do Painel já conta melhor. Os totais do dia continuam no **Resumo
24h**, e online/quedas ficam na barra lateral.

**O que conta como item raro.** Não é uma lista escrita à mão: é a mesma
classificação da aba **Itens Raros** da Mochila (`shared/itens.json`, chaves
`raros` e `zmoves` — os D-Skills moram lá). Então Boss Token, D-Skill e Chip AoE
entram; "Energia de Ovo … Instável" não, porque é categoria `datas` e cai a cada
poucos abates. A única exceção de interface é a **Proteção de Ovo**: está no
bolso dos raros, mas cai o tempo todo e afogaria o resto.

**Mercado da Comunidade ≠ Loja.** A Atividade mostra só negócios **entre
players** (pacotes `mercado.*`). A venda automática de ovos da ferramenta
`eggs` é `ovo.vender`, para o NPC da Loja, e não aparece ali — seriam dezenas de
linhas por hora de algo que não é notícia.

**Histórico de Ovos.** O jogo guarda as últimas 60 capturas e as esquece no
logout. O DesDeck acumula as suas (até 2000, de todas as contas) e as filtra uma
de cada vez: por letra, por shiny, por UX ou por potência. O botão **Apagar**
limpa tudo — e pergunta antes, porque não há como recuperar.

**Filtros seus.** O botão **+ Filtro** abre uma grade com uma linha por letra
(SSS…D), cada uma com faixa de potência e exigências de UX/shiny. Dá para montar
"SSS P1 ao P5, SS P4 ao P5": as regras se combinam por **ou**, porque nenhum ovo
é SSS e SS ao mesmo tempo. Antes de salvar, o editor diz quantos ovos o filtro
pegaria agora ("4 de 8"). O filtro salvo vira um botão ao lado dos de fábrica,
com um × para apagá-lo, e sobrevive ao reinício.

---

## Outros recursos

- **Bandeja** — **minimizar** manda a janela para a bandeja e as contas seguem
  farmando; o ícone da bandeja a traz de volta. **Fechar (X) encerra o DigiDeck.**
  Dá para desligar o envio à bandeja em Configurações → Geral; o X fecha de
  qualquer forma.
- **Proxy por tela** — formato `host:porta:usuário:senha`, com botão de testar o IP
  de saída. Sem fallback: se o proxy falhar, a conta não conecta pelo seu IP real.
- **Isolamento** — cada conta usa a própria sessão/partição.
- **Auto-update** — verifica a cada 4h e avisa, mas **não** força a instalação ao sair.
- **Scripts de usuário** — botão "Scripts" na barra lateral, injetados no `dom-ready`.

---

## Estrutura

```
DesDeck-Dev/
├── iniciar.bat               # Abre o app, conferindo o ambiente antes
├── dd-src/
│   ├── src/
│   │   ├── main.js           # Processo principal, proxy, ciclo de vida
│   │   ├── preload.js        # Ponte IPC (contextIsolation ligado)
│   │   ├── vault.js          # Cofre criptografado (AES-256-GCM)
│   │   ├── updater.js        # Auto-update
│   │   └── renderer/
│   │       ├── app.js        # Interface, telas, contas, scripts
│   │       └── tools.js      # As ferramentas de automação
│   │   └── headless/         # O modo sem tela
│   │       ├── client.js     # Socket do jogo e roteador de pacotes
│   │       ├── manager.js    # Uma instância por conta
│   │       ├── painel.js     # Monta o resumo que o card do Painel mostra
│   │       ├── ovos.js       # Letra do tier + retrato de cada ovo capturado
│   │       ├── ovo-tier.js   # A conta do tier, portada do cliente do jogo
│   │       ├── catalogo.js   # Os /shared/*.json do jogo, em cache
│   │       └── sprites.js    # Recorta o retrato da folha de sprites
│   ├── package.json
│   └── electron-builder.json
└── README.md
```

---

## Onde ficam os seus dados

```
%APPDATA%\DesDeck\digideck.json
```

Contas, telas, scripts e proxies vivem **só aí**, criptografados. Esse arquivo e a
pasta `scripts/` estão no `.gitignore` de propósito: são seus e não devem ir para o
repositório.

---

## Aviso

Este projeto automatiza um jogo de terceiros. Verifique as regras do jogo antes de
usar — a responsabilidade pelo uso é sua.

Licença MIT.
