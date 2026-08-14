# CLAUDE.md

Guia para quem (humano ou Claude Code) for mexer neste repositório depois.

## O que é

Stream Deck web caseiro: servidor Node local + grade de botões táteis
servida via navegador para um tablet Android na mesma LAN, substituindo o
Touch Portal. Controla mídia/volume do Windows, cenas/mic/gravação do OBS;
Spotify e Hue estão estruturados mas desativados até o usuário configurar
credenciais.

**Convenção do projeto: código, comentários e identificadores em
português.** Mantenha esse padrão em qualquer código novo.

## Stack

- **Backend**: Node.js + Express (HTTP/REST) + `ws` (WebSocket) — sem
  framework de frontend, sem build step, sem TypeScript.
- **Frontend**: HTML/CSS/JS puro em `public/`, instalável como PWA
  (manifest + service worker mínimo).
- **Integrações**: cada uma em `server/integrations/<nome>/`, isolada.
- Segredos em `.env` (nunca commitado — só `.env.example`).

## Como rodar

```bash
npm install
cp .env.example .env   # se ainda não existir
npm run dev             # nodemon, recarrega sozinho
# ou
npm start                # execução única
```

Servidor sobe em `http://localhost:<PORT>` (padrão `3000`). Para acesso do
tablet pela LAN a partir do WSL2, veja a seção "Acessar do tablet" no
README — por padrão o WSL2 usa NAT e não é alcançável por outros
dispositivos da rede sem `networkingMode=mirrored` (`.wslconfig`) ou um
`netsh interface portproxy`.

## Arquitetura / fluxo de dados

```
public/js/app.js  --GET /api/config-->  server/config-store.js (lê config/pages.config.json)
public/js/app.js  --POST /action/:id--> server/routes/actions.js
                                              |
                                              v
                          integracoes[botao.integracao].acoes[botao.acao](parametros)
                                              |
                                    integração emite evento 'estado' (EventEmitter)
                                              |
                                              v
                          server/index.js retransmite via WebSocket (/ws)
                                              |
                                              v
                          public/js/ws-client.js --> app.js atualiza a grade
```

- **Dois arquivos de config, mesmo padrão do `.env`/`.env.example`:**
  `config/pages.config.json` é o pessoal (**gitignored** — tem caminhos da
  máquina, IPs da LAN e nomes de cena reais) e
  `config/pages.config.example.json` é o versionado. O `config-store.js` usa
  o pessoal quando existe e cai no exemplo quando não.
- **O exemplo NÃO é um espelho do deck pessoal — é o template inicial.** Ele
  é o que a pessoa recebe embutido no `.exe` e vê na primeira execução, então
  o critério dele é outro: as páginas Mídia, Sistema e Atalhos precisam
  funcionar **sem configurar nada**, e o que depende de setup (OBS, Spotify,
  Hue) entra só com `_nota` explicando. Não copie botões pessoais para lá —
  caminho de `C:\Users\...`, IP de servidor da casa e nome de cena real são
  exatamente o que não deve aparecer para quem acabou de baixar. Mudança no
  deck pessoal não precisa ser replicada no template.
- O formato é **JSON**, não mais um módulo JS: precisa ser reescrito
  programaticamente pela tela de configuração sem perder nada. Como JSON não
  tem comentários, páginas e botões aceitam um campo opcional `_nota`, que
  sobrevive a idas e voltas pelo editor.
- **Salvar não exige reiniciar.** `PUT /api/config` valida, grava de forma
  atômica (temporário + rename, com backup da versão anterior em
  `pages.config.backup.json`) e dispara `{ tipo: 'config_atualizado' }` no
  WebSocket; o `app.js` rebusca `/api/config` e re-renderiza sozinho,
  mantendo a aba aberta se ela ainda existir.
- Um botão pode ser **simples** (`integracao` + `acao` + `parametros`) ou
  **macro** (`acoes`: lista de `{ integracao, acao, parametros }` executada
  em sequência num toque só). O `routes/actions.js` normaliza os dois para
  uma lista de passos.
- `config/pages.config.json` é a **única fonte de verdade** do layout de
  botões (páginas, ícones, rótulos, qual integração/ação cada botão chama,
  e `estadoChave`/`estadoComparar` para saber quando destacar o botão como
  "ativo"). Adicionar um botão não deve exigir tocar em `server/` nem em
  `public/`.
- Cada integração (`server/integrations/<nome>/index.js`) exporta uma
  **instância singleton** que:
  - estende `EventEmitter` e emite `'estado'` com o novo estado sempre que
    algo muda;
  - expõe `.estado` (objeto atual) e `.acoes` (mapa de funções async, uma
    por ação usada em `config/pages.config.json`);
  - opcionalmente expõe `async inicializar()`, chamado uma vez na subida do
    servidor (`server/index.js`).
- `server/routes/actions.js` é um dispatcher genérico: `POST /action/:id`
  procura o botão pelo `id` no config, resolve `integracao`/`acao`, mescla
  `parametros` estáticos do config com o corpo da requisição (ex.: valor de
  um slider) e chama a ação. Erros viram `{ ok: false, erro }` com HTTP 500
  — nunca derrubam o servidor.
- `server/index.js` mantém um `estadoGlobal` (espelho do `.estado` de cada
  integração) e faz o broadcast via WebSocket. Ao conectar, um cliente
  recebe `{ tipo: 'estado_completo', dados: estadoGlobal }`; a partir daí,
  `{ tipo: 'estado', integracao, dados }` a cada mudança.
- Botões do tipo `"lista"` são um **seletor genérico**: o frontend faz um GET
  na URL de `fonte`, que responde `{ ok, opcoes: [{ id, nome, detalhe, ativo }] }`,
  mostra as opções num overlay e manda a escolhida de volta para a ação do
  próprio botão como `parametros.opcaoId`. É o mesmo mecanismo usado por
  "Tocar em…" (dispositivos do Spotify), "Janelas" (janelas abertas do
  Windows) e "Jogar…" (jogos instalados na Steam) — para criar outro, basta
  uma rota GET nesse formato e um botão apontando para ela. As rotas de
  listagem ficam fora do dispatcher de `/action/:id` (são GET, não ações):
  veja `server/routes/atalhos.js` e `/spotify/dispositivos`.
- No frontend, `estadoChave` (dot-path, ex.: `"obs.cenaAtual"`) resolve um
  valor dentro do estado global; `estadoComparar` (opcional) compara esse
  valor com `botao.parametros[<chave>]` (usado nos botões de cena do OBS,
  onde vários botões compartilham o mesmo `estadoChave` mas cada um só fica
  "ativo" quando a cena bate com o seu próprio `parametros.cena`). Sem
  `estadoComparar`, o botão fica "ativo" quando o valor resolvido é truthy
  (mute, gravando, luz ligada, etc).

## Integrações que agem no Windows (via WSL2) — pontos delicados

Duas integrações agem no sistema operacional chamando `powershell.exe` via
interop, mesmo com o servidor rodando dentro do WSL2:

- `server/integrations/media/` — volume master e teclas de mídia
  (script `scripts/windows-media.ps1`).
- `server/integrations/atalhos/` — atalhos de teclado/sistema, abrir
  apps/sites/jogos, listar e focar janelas
  (script `scripts/windows-atalhos.ps1`).

As duas usam `server/lib/powershell-interop.js`, que centraliza a detecção
de modo (`wsl` vs `nativo`), a conversão do caminho do script (`wslpath -w`)
e a execução com `spawn` + timeout. Gotchas já resolvidos ali, importantes
não reintroduzir:

- **`spawn` com `stdio: ['ignore', ...]`, não `execFile`.** O `execFile`
  deixa o stdin como pipe aberto e a ponte de interop WSL→Windows chegou a
  travar esperando algo que nunca chegava. Há também um timeout de 10s —
  sem ele, um travamento desses derrubava a subida do servidor inteiro.
- **`[Console]::OutputEncoding = UTF8` no topo de qualquer script que
  devolva texto livre.** Sem isso o PowerShell escreve na codepage do
  console (CP850/CP1252 em português) e títulos de janela com emoji/acento
  viram bytes inválidos — inclusive caracteres de **controle crus** dentro
  do JSON, que o `JSON.parse` do Node rejeita. O `windows-atalhos.ps1`
  também remove caracteres de controle dos títulos por segurança.

### O script de mídia especificamente

Gotcha já resolvido, importante não reintroduzir: **PowerShell não consegue
chamar métodos de interfaces COM que só implementam `IUnknown` (sem
`IDispatch`) diretamente sobre um `System.__ComObject`** — dá erro do tipo
"não contém um método denominado X". Por isso toda a lógica de
`IAudioEndpointVolume` (get/set volume, get/set mute) vive **dentro** da
classe C# (`AudioController`) definida no `Add-Type` do script, exposta ao
PowerShell só como métodos estáticos com tipos primitivos
(`ObterVolume() -> float`, `DefinirVolume(float)`, etc.). Se for mexer nesse
script, mantenha esse padrão — não tente chamar `$objComInterface.Metodo()`
direto do corpo PowerShell.

O modo vem de `MEDIA_BACKEND` (`.env`, padrão `auto`): `win32` → `nativo`
(chama PowerShell local sem `wslpath`), `WSL_DISTRO_NAME` definida → `wsl`.
O nome da variável ficou de quando só a integração de mídia existia — hoje
vale para as duas.

### O script de atalhos especificamente

Trazer uma janela para frente a partir de um processo em segundo plano
esbarra no **foreground lock** do Windows: `SetForegroundWindow` sozinho
normalmente só pisca o botão na barra de tarefas. Por isso `TrazerParaFrente`
simula um toque na tecla ALT em volta da chamada, que libera esse bloqueio.

O botão "Janelas" substituiu um Alt+Tab simulado: o seletor nativo do
Windows não dá para navegar por toque (ficava aberto esperando o teclado),
então listar as janelas e focar a escolhida funciona muito melhor no tablet.

## A conexão do OBS — dois modos de falhar, os dois já tratados

O OBS é a única integração que fica tentando conectar sozinha, e ela erra de
jeitos diferentes conforme o ambiente. Gotchas já resolvidos:

- **`obs.connect()` pode nunca resolver nem rejeitar.** Ele depende de o
  socket devolver erro. Numa recusa limpa (Windows nativo) isso é imediato,
  mas quando a rede engole a tentativa em silêncio — o caso do WSL2 em modo
  espelhado, que fica esperando o Windows — a promessa fica pendurada para
  sempre, a reconexão nunca é agendada e o OBS não conecta **nem depois de
  aberto**. Por isso existe `_conectarComPrazo()`, com prazo de 8s.
- **A reconexão tem espera crescente (5s → 60s) e loga uma vez só.** Antes
  era 5s fixo com um `console.warn` por tentativa: quem nunca abre o OBS
  levava um aviso a cada 5 segundos para sempre. O aviso volta a sair quando
  uma conexão que existia cai — aí é informação de verdade.
- Diferente de Spotify e Hue, **não dá para deduzir "não configurado" da
  ausência de `.env`**: o OBS funciona sem credencial nenhuma. Daí o
  `OBS_HABILITADO` explícito.

Reproduzir a recusa de conexão do WSL exige cuidado: nesta máquina uma porta
fechada em `127.0.0.1` **pendura** em vez de recusar, então testes de
"servidor fora do ar" não se comportam como no Windows.

## Discord: por que não usa a API do Discord

`server/integrations/discord/` não fala com o Discord — ele **envia atalhos
globais de teclado** pela integração `atalhos`. Não é preguiça, é o único
caminho que funciona para quem recebe o `.exe`:

- O RPC local do Discord tem `SET_VOICE_SETTINGS`, que faria isso direito e
  ainda devolveria o estado (botão acendendo). Mas o escopo `rpc` só vale
  para o **dono do app** e até 50 testadores até a Discord aprovar o app
  manualmente. Serviria para uma pessoa, não para quem baixa o programa.
- **Go Live não existe em lugar nenhum**: nem API, nem tecla de atalho. Só o
  botão na interface. Não tente implementar — não há por onde.
- Consequência aceita: **os botões de Discord não acendem**. Sem RPC não há
  estado, e o catálogo declara `estados: []` de propósito.

Isso trouxe a ação genérica `atalhos.enviarTeclas` (combo livre tipo
`CTRL+SHIFT+M`), com `Converter-Combo` no `windows-atalhos.ps1` traduzindo
nomes para códigos de tecla virtual. Qualquer programa com atalho global
pode ser acionado assim, sem integração nova.

## Empacotamento (.exe) e resolução de caminhos

`npm run build` gera `build/stream-deck-web.exe` — Node SEA (Single
Executable Application). Roda a partir do WSL: baixa o `node.exe` do
Windows e injeta o app dentro dele com `postject`.

**A regra que faz os dois modos conviverem** está em
`server/lib/caminhos.js`. Nada de código deve montar caminho com
`__dirname` para `public/`, `scripts/` ou `config/` — depois do bundle o
`__dirname` não aponta mais para o repositório. Use `caminhos.publico`,
`caminhos.scripts`, `caminhos.config`, `caminhos.env`.

- **Do código-fonte:** tudo resolve para a raiz do repositório, como sempre.
- **Empacotado:** `public/`, `scripts/*.ps1` e os modelos vão embutidos como
  assets do SEA e são gravados numa pasta `dados/` ao lado do `.exe`
  (`caminhos.prepararArquivos()`, chamado no topo de `server/index.js`,
  **antes** dos outros requires — eles já leem config e token de lá).
- Quem sobrescreve o quê: **código** (`public/`, `scripts/`) é reescrito a
  cada inicialização, para não ficar defasado do executável; **dados**
  (`config/`, `.env`) só são criados se não existirem.
- Se a pasta ao lado do `.exe` não for gravável (Program Files), cai para
  `%LOCALAPPDATA%\StreamDeckWeb`.

O build também é o único jeito prático de exercitar o caminho `nativo` do
`powershell-interop.js` — rodando do WSL o modo é sempre `wsl`. O `.exe`
gerado pode ser executado direto do WSL via interop, e aí reporta
`platform: win32`; foi assim que o modo nativo foi validado.

**Ao testar o `.exe` a partir do WSL, variáveis de ambiente do shell não
chegam nele** (é um processo Windows; só passa o que estiver em `WSLENV`).
Para mudar porta ou qualquer opção no teste, edite o `dados/.env` que ele
cria — não adianta `PORT=3555 ./stream-deck-web.exe`.

## Segundo plano (o .exe se solta do console)

`server/lib/segundo-plano.js`. No Windows não dá para desprender um processo
do console a que ele já pertence, então o executável **relança a si mesmo**
destacado e o processo original vira só um lançador.

- Pai e filho são o mesmo binário; o que os separa é a variável de ambiente
  `STREAM_DECK_SEGUNDO_PLANO=1`, posta no filho. Sem essa marca o filho
  relançaria a si mesmo para sempre.
- **O pai é quem imprime o token/QR e abre o navegador**, não o filho: o
  filho não tem console, e quando ele sobe o token já foi criado pelo pai —
  ele nunca veria a condição de "primeira execução" (`ORIGEM === 'gerado
  agora'`). Por isso o `listen()` do `index.js` volta cedo quando
  `segundoPlano.ehFilho()`.
- Por causa disso, `server/index.js` embrulha tudo em `iniciarServidor()`:
  quando `talvezLancarEmSegundoPlano()` devolve `true`, **nada** do servidor
  pode rodar neste processo. O lançador segue trabalhando em segundo plano
  (o event loop fica vivo pelas esperas) e termina com `process.exit()`.
- Só liga no modo empacotado. Do código-fonte o console é o lugar certo dos
  logs — daí o `caminhos.empacotado` no `habilitado()`.
- Antes de lançar, confere se a porta já responde: dois cliques no `.exe`
  abrem a tela da instância existente em vez de subir uma segunda cópia.
- Escotilhas: `--console` na linha de comando ou `SEGUNDO_PLANO=false`.

Como não sobra janela para fechar, `POST /api/bemvindo/encerrar` (botão na
tela de boas-vindas) é o caminho normal de desligar. Ele exige `exigirLocal`
**e** `exigirToken` — só local não bastaria, porque um `<form>` de outro site
aberto no navegador conseguiria derrubar o servidor com um POST.

## Documentação gerada (`npm run docs`, `npm run docs:pdf`)

Duas peças de documentação **não** são escritas à mão:

- `docs/acoes.md` sai de `scripts/gerar-docs.js`, que lê o getter `catalogo`
  de cada integração. Rode depois de mexer em qualquer ação. Uma ação que não
  aparece ali é uma ação que também não aparece no editor — o que falta é a
  entrada no catálogo.
- `docs/Guia-Stream-Deck-Web.pdf` sai de `scripts/gerar-pdf.js`, que imprime
  `docs/guia-primeiro-acesso.html` com o Chrome do Windows em headless. **A
  fonte é o HTML** — editar o PDF não faz sentido, ele é regenerado.

Escritos à mão, e que precisam ser atualizados junto com o código:
`docs/urls.md` (todas as rotas e suas travas — atualize ao criar rota nova)
e `docs/casa-inteligente.md` (por que Tuya cobre quase todo o mercado
brasileiro, por que Alexa não serve, e o que cada marca exige).

O guia em PDF é para quem só vai *usar* o programa (linguagem sem jargão,
começando do download); o README é a documentação técnica. Os dois se
apontam.

`server/lib/catalogo-ui.js` existe por causa disso: os tipos de botão e os
estilos de destaque são lidos tanto pela rota `/api/catalogo` quanto pelo
gerador da doc.

## Tela de boas-vindas (`/bemvindo/`)

Primeira coisa que a pessoa vê ao rodar o programa: status, token grande com
botão de copiar, QR para parear o tablet e atalhos para o deck e a
configuração. Abre sozinha no navegador **na primeira execução** (quando o
token acabou de ser gerado) — nas seguintes fica quieta, para não abrir uma
aba a cada boot. `ABRIR_NAVEGADOR` no `.env` força `sempre`/`nunca`.

Duas coisas importantes aqui:

- **`GET /api/bemvindo` é a única rota que não exige token** — não poderia
  exigir, é onde o token é revelado. Ela se protege por `exigirLocal`. Por
  isso é montada **antes** do `app.use('/api', exigirToken, …)` em
  `server/index.js`: como o router só trata `/bemvindo`, o resto de `/api`
  segue para o middleware de token.
- **O QR em SVG não trouxe dependência nova.** `server/lib/qr.js` reaproveita
  a implementação de QR que já vem dentro do `qrcode-terminal` (usado para
  desenhar no console): de lá dá para pegar a matriz de módulos
  (`getModuleCount()` / `isDark()`) e renderizar como `<rect>`. Não esqueça
  a zona de silêncio de 4 módulos — sem ela muitos leitores não reconhecem.

`server/lib/rede.js` (descobrir o IP da LAN) é compartilhado entre o console
e esta tela justamente para os dois concordarem no endereço mostrado.

## Acesso (token e restrição local)

`server/lib/token.js` + `server/lib/auth.js`. Duas travas com propósitos
diferentes:

- **`exigirToken`** — tudo que dispara ação ou lê estado (`/action`,
  `/atalhos`, `/api`, `/spotify/dispositivos`, e o WebSocket). Sem isso,
  qualquer aparelho da rede mandaria o PC abrir programas.
- **`exigirLocal`** — camada extra no que *reconfigura* o app (`PUT
  /api/config`, `GET /api/catalogo`, OAuth do Spotify): por padrão só
  responde de 127.0.0.1, liberável com `CONFIG_REMOTO=true`.

Detalhes que importam ao mexer aqui:

- **Os estáticos ficam abertos de propósito.** HTML/CSS/JS não têm segredo, e
  a página precisa carregar para poder pedir o token a quem ainda não pareou.
- **WebSocket recebe o token pela query string**, não por header — o
  handshake do navegador não permite header. Conexão sem token fecha com o
  código 4001.
- **OAuth do Spotify não pode exigir token**: o Spotify redireciona o
  navegador para `/spotify/callback` sem ele. Por isso `/login` e
  `/callback` usam `exigirLocal` em vez de `exigirToken`.
- Comparação do token é `timingSafeEqual`, e normaliza hífen/caixa antes —
  quem digita não deve ser barrado por formatação.
- O token vai para `config/token.json` (gitignored) ou vem de
  `STREAM_DECK_TOKEN`. Formato pensado para ser digitado num tablet:
  alfabeto sem caracteres ambíguos, agrupado de 4 em 4.

No frontend, `public/js/token.js` é compartilhado pelo deck e pelo editor:
lê o token de `?token=` (link/QR de pareamento) ou do `localStorage`, tira
da URL depois de guardar, injeta o header nas chamadas e mostra a tela de
pareamento quando falta. Por isso `ws-client.js` **não** conecta sozinho no
construtor — quem chama `conectar()` é o `app.js`, depois de garantir token.

## Tela de configuração (`public/config/`)

Editor de páginas e botões servido em `/config/` (link ⚙️ no cabeçalho do
deck). HTML/CSS/JS puro, como o resto — sem framework, sem build.

O ponto central: **nada ali é hardcoded por integração**. Os formulários são
montados a partir de `GET /api/catalogo`, então uma integração nova aparece
sozinha no editor assim que expuser seu getter `catalogo`. Se você adicionar
uma ação e ela não aparecer no editor, o que falta é a entrada no catálogo,
não código de UI.

Fluxo: carrega `/api/config` numa cópia em memória, edita à vontade, e só
grava em `PUT /api/config` ao clicar em Salvar. Erro de validação volta em
400 e é listado na tela sem gravar nada. Salvar dispara a recarga a quente,
então o tablet reflete a mudança na hora.

## Aba "Integrações" (credenciais pela UI)

`server/routes/integracoes.js` + `server/lib/env-store.js` + o overlay em
`public/config/`. Existe para tirar da frente de quem recebe o `.exe` a
etapa de editar `.env` no Bloco de Notas e reiniciar.

O padrão é o mesmo do `catalogo`, e vale manter: **cada integração declara um
getter `configuracao`** (`rotulo`, `resumo`, `comoObter`, `campos[]` com a
variável de ambiente de cada um, e opcionalmente `autorizacao` para um passo
de OAuth). A UI não sabe o que é "Spotify" — integração nova aparece sozinha
ao declarar isso. Sem `configuracao`, ela não aparece (é o caso de `media` e
`atalhos`, que não precisam de nada).

Decisões que importam ao mexer aqui:

- **O `.env` continua sendo a fonte de verdade**, em vez de um JSON novo:
  ele já é lido por todo mundo, mora na pasta de dados e continua editável à
  mão. O `env-store` reescreve **só a linha da chave alterada**, preservando
  comentários — o arquivo é a própria documentação dele (nasce do
  `.env.example`), e um dump de `CHAVE=valor` jogaria isso fora.
- **Segredo nunca volta para o navegador.** O GET manda `preenchido:
  true/false` para campos `tipo: 'senha'`, nunca o valor. Por isso campo de
  senha vazio no PUT significa "não mexi"; apagar de verdade manda `null`.
- **Só grava chaves declaradas pela própria integração.** Sem essa lista, um
  PUT escreveria qualquer variável de ambiente (`PATH`, `STREAM_DECK_TOKEN`).
- **`reconfigurar()`** é o que evita "reinicie o servidor": relê o `.env` e
  reconecta. Quem adiciona `configuracao` deveria adicionar isso também. No
  OBS há o detalhe do `_reconfigurando`: o `disconnect()` que nós mesmos
  pedimos dispara `ConnectionClosed`, que sem a flag viraria "a conexão caiu"
  no log e uma reconexão concorrente.
- O `env-store.gravar()` também atualiza `process.env`, senão o valor novo só
  valeria depois de reiniciar — exatamente o que a tela existe para evitar.

O OAuth do Spotify agora **grava o refresh token sozinho** no callback
(`server/routes/spotify-auth.js`) e chama `reconfigurar()`. Antes, a página
mostrava o token para a pessoa copiar no `.env` e reiniciar duas vezes.
O Redirect URI padrão sai de `_redirectPadrao()`, derivado de `PORT` — fixá-lo
em `:3000` fazia a tela instruir o cadastro errado para quem mudasse a porta,
com um `INVALID_CLIENT` incompreensível do outro lado.

## Schema do config (campos de um botão)

Antes ficava nos comentários do `pages.config.js`; JSON não tem comentários,
então mora aqui. O mesmo conteúdo é servido em `GET /api/catalogo` de forma
estruturada, que é como a tela de configuração monta os formulários.

| Campo | Vale para | O que é |
|-------|-----------|---------|
| `id` | todos | Identificador único **no app inteiro**, usado em `POST /action/:id` |
| `titulo` | todos | Rótulo curto do botão |
| `icone` | todos | Emoji. **Use emoji de verdade** — pictogramas sem apresentação emoji (`U+1F5A7`, `U+1F5B5`) não têm glifo na fonte do Android e aparecem quebrados |
| `iconeAtivo` / `tituloAtivo` | todos | Alternativa mostrada quando `estadoChave` é truthy (ex.: play ↔ pause) |
| `tipo` | todos | `botao` (padrão), `slider`, `info` (só mostra), `lista` (seletor) |
| `integracao` + `acao` | exceto `info` | Qual integração e qual ação disparar |
| `parametros` | exceto `info` | Objeto repassado para a ação |
| `acoes` | exceto `info` | **Macro**: lista de `{ integracao, acao, parametros }` em sequência. Alternativa a `integracao`/`acao`/`parametros` |
| `estadoChave` | todos | Dot-path no estado ao vivo (ex.: `obs.cenaAtual`) que acende o botão |
| `estadoComparar` | `botao` | Compara `estadoChave` com `parametros[<valor>]` — é como vários botões de cena do OBS compartilham a mesma chave e só um acende |
| `estiloEstado` | todos | `destaque` \| `perigo` \| `gravando` |
| `min` / `max` | `slider` | Faixa numérica (obrigatórios) |
| `fonte` | `lista` | Endpoint GET que devolve `{ ok, opcoes: [...] }` (obrigatório) |
| `iconeItem` / `mensagemVazia` | `lista` | Ícone padrão dos itens e texto de lista vazia |
| `estadoTexto` / `…Secundario` / `…Terciario` | `info` | Dot-paths das linhas de texto exibidas |
| `_nota` | todos | Comentário livre — substitui os comentários que o JSON não tem |

A validação em `server/config-store.js` (`validar()`) cobre tudo isso e
devolve erros já legíveis, apontando página e botão.

## Adicionando uma nova integração

1. Crie `server/integrations/<nome>/index.js` exportando uma instância que
   estende `EventEmitter`, com `.estado`, `.acoes` e (se precisar de setup
   assíncrono) `async inicializar()`.
2. Registre em `server/index.js` (`const integracoes = { ..., <nome> }`).
3. Exponha também um getter `catalogo` (`rotulo`, `disponivel`,
   `motivoIndisponivel`, `estados`, `acoes` com rótulo e parâmetros) — é o
   que faz a integração aparecer na tela de configuração. Sem ele, ela
   funciona mas fica invisível para quem for montar botões pela UI.
   Se ela precisar de credenciais, exponha também `configuracao` e
   `reconfigurar()` — veja "Aba Integrações" acima. Sem isso, configurá-la
   volta a exigir editar `.env` na mão.
4. Adicione botões em `config/pages.config.json` referenciando
   `integracao: '<nome>'` e `acao: '<nomeDaAcao>'`.
5. Se a ação tiver estado ao vivo, emita `this.emit('estado', this.estado)`
   sempre que algo mudar (por ação do próprio botão OU por evento externo,
   como o OBS faz com `CurrentProgramSceneChanged`).

## Testes manuais úteis

Tudo exige token — pegue o atual e exporte antes:

```bash
export TOKEN=$(node -e "console.log(require('./config/token.json').token)")

curl -s -H "X-Token: $TOKEN" http://localhost:3000/api/config | jq .
curl -s -H "X-Token: $TOKEN" http://localhost:3000/api/catalogo | jq '.integracoes | keys'
curl -s -H "X-Token: $TOKEN" -X POST http://localhost:3000/action/midia.play_pause
curl -s -H "X-Token: $TOKEN" -X POST http://localhost:3000/action/midia.volume_slider \
  -H "Content-Type: application/json" -d '{"valor":30}'

# Salvar layout (valida antes; erro => 400 e arquivo intacto). Precisa vir de
# 127.0.0.1, senão dá 403 — veja CONFIG_REMOTO:
curl -s -X PUT http://127.0.0.1:3000/api/config -H "X-Token: $TOKEN" \
  -H "Content-Type: application/json" -d @config/pages.config.json | jq .

# Tela de boas-vindas (única rota sem token) e o desligamento:
curl -s http://127.0.0.1:3000/api/bemvindo | jq '{segundoPlano, arquivoLog, urlLan}'
curl -s -X POST -H "X-Token: $TOKEN" http://127.0.0.1:3000/api/bemvindo/encerrar
```

Validar o template inicial sem subir servidor (o mesmo validador da rota):

```bash
node -e "
const store=require('./server/config-store');
const integ={}; for (const n of ['media','obs','spotify','hue','atalhos'])
  integ[n]=require('./server/integrations/'+n);
const erros=store.validar(require('./config/pages.config.example.json'), integ);
console.log(erros.length ? erros : 'template válido'); process.exit(0);"
```

Não há suíte de testes automatizados neste projeto — validação é manual
(subir o servidor, bater nos endpoints, abrir no navegador).
