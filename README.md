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
| **Auto Labirinto** | Inscreve a conta no lobby do Labirinto da Guild assim que ele reabre. Não começa a corrida nem muda a dificuldade. |
| **Auto Passe** | Resgata o Passe de Batalha todo dia — perder um dia zera a trilha de 30 dias. Pega o Premium atrasado se a conta tiver Premium; **nunca** compra o Premium. **Já vem ligada**, inclusive em conta nova. |
| **Sniper de Mercado** | Varre o Mercado e compra o que está abaixo do teto que você definir. Anúncio retido entra numa fila e é comprado **no instante em que libera** (todo anúncio espera 2 min). Filtra por tier, potência, energia, espécie e moeda. |

### Sniper de Mercado

Cada **alvo** é uma procura salva: o que comprar, em que moeda e até que preço.
Dá para ter vários — "ovo S+ P4/P5 até 2M em bits" e "ovo até 30 D-Dol" são
buscas diferentes e convivem.

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

- **Alvo com teto 0 não compra nada** — e nem pede a lista. É o padrão de fábrica,
  então ligar a ferramenta antes de configurá-la não gasta um bit.
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
| `test-sniper-headless.js` | O `ToolSniper` do modo sem janela: 45 casos, com o relógio do servidor controlado — é onde a fila da retenção é exercitada de ponta a ponta. Sem rede. |
| `test-sniper-form.js` | A tela de configuração num `BrowserWindow` de verdade: o filtro de itens filtrando, a ordem dos blocos e o alvo de item pela metade sendo recusado. Sem rede. |

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

## Outros recursos

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
