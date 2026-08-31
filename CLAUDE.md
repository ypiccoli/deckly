# CLAUDE.md

Guia para quem (humano ou Claude Code) for mexer neste repositório depois.

## O que é

Stream Deck web caseiro: servidor Node local + grade de botões táteis
servida via navegador para um tablet Android na mesma LAN, substituindo o
Touch Portal. Controla mídia/volume do Windows, cenas/mic/gravação do OBS;
Spotify fica estruturado mas desativado até o usuário configurar credenciais.

**Convenção do projeto: código, comentários e identificadores em
português.** Mantenha esse padrão em qualquer código novo.

## Stack

- **Backend**: Node.js + Express (HTTP/REST) + `ws` (WebSocket) — sem
  framework de frontend, sem build step, sem TypeScript.
- **Frontend**: HTML/CSS/JS puro em `public/`, instalável como PWA
  (manifest + service worker mínimo).
  - **O service worker é rede-primeiro, cache como reserva** — e precisa
    continuar assim. Ele já foi cache-primeiro, dependendo de subir o
    `CACHE_NOME` à mão a cada mudança em `public/`. Quando isso é esquecido, o
    aparelho serve **CSS novo com JS antigo** (ou o contrário) e a interface
    quebra sem um único erro no console: o sintoma foi uma lista de opções
    achatada em linhas finas, porque o CSS tinha movido o padding para uma
    classe que o JS antigo não criava. O servidor está na mesma LAN, então
    buscar da rede custa milissegundos, e o cache continua cobrindo o caso que
    motivou o service worker (Wi-Fi caindo, PC ainda subindo).
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
  Home Assistant) entra só com `_nota` explicando. Não copie botões pessoais para lá —
  caminho de `C:\Users\...`, IP de servidor da casa e nome de cena real são
  exatamente o que não deve aparecer para quem acabou de baixar. Mudança no
  deck pessoal não precisa ser replicada no template.
- O formato é **JSON**, não mais um módulo JS: precisa ser reescrito
  programaticamente pela tela de configuração sem perder nada. Como JSON não
  tem comentários, páginas e botões aceitam um campo opcional `_nota`, que
  sobrevive a idas e voltas pelo editor.
- **Na subida, a ordem é pessoal → backup → exemplo.** `carregar()` nunca
  lança por JSON inválido: um `pages.config.json` quebrado antes derrubava o
  servidor no `require` (o `.exe` simplesmente não abria). O arquivo com
  problema **não** é sobrescrito — é a única cópia do que a pessoa fez por
  último. Só se nem o exemplo abrir é que ele lança.
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
- **Favoritos são do seletor, não de cada integração.**
  `server/lib/favoritos-store.js` guarda `{ "<fonte>": [ids] }` em
  `config/favoritos.json`, com a **URL da fonte como chave** — então qualquer
  botão do tipo `lista` pode ganhar favoritos sem código novo. Só ids são
  guardados: nome e ícone continuam vindo da listagem ao vivo, e um favorito
  que não existe mais simplesmente não aparece. Quem quiser ativar chama
  `favoritos.aplicar(fonte, opcoes)` na rota de listagem — isso marca
  `favorito: true` e sobe as favoritas para o topo (hoje só
  `/discord/canais`). Mora fora do `pages.config.json` de propósito:
  favorito é preferência de uso, não layout, e não deveria sujar o arquivo
  que a tela de configuração reescreve. `POST /api/favoritos` exige token mas
  **não** `exigirLocal` — favoritar é uso normal, feito do tablet.
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

#### Trocar a saída de áudio (`SaidasDeAudio`)

O seletor "Saída" (`GET /media/saidas` + ação `definirSaida`) troca o
dispositivo padrão do Windows. Três coisas a saber antes de mexer:

- **`IPolicyConfig` não é documentada pela Microsoft.** É a única forma de
  trocar a saída padrão sem instalar utilitário externo, e é o que o nircmd
  e o AudioDeviceCmdlets usam por baixo. Há duas variantes com IID
  diferente, e a posição de `SetDefaultEndpoint` na vtable **muda entre
  elas** (índice 10 na moderna, 9 na do Vista) — por isso as duas estão
  declaradas, com a moderna tentada primeiro.
- **Trocar só o papel `eConsole` não basta.** O Windows guarda "padrão",
  "multimídia" e "comunicação" separadamente; mudando só o primeiro, a
  chamada de voz continua tocando no dispositivo antigo — justamente o caso
  de quem alterna entre fone e caixa. `Definir()` aplica os três.
- **A lista traz só dispositivos ativos** (`DEVICE_STATE_ACTIVE`): fone
  desconectado não aparece, o que é o comportamento desejado num seletor.

Cada dispositivo tem volume e mudo próprios, então `definir_saida` devolve o
estado do dispositivo **novo** — é o que mantém o slider honesto depois da
troca.

**O cache do `.dll` leva um hash do código C#.** Ele existe porque compilar
via `Add-Type` custa 1–2s a cada clique. Antes o nome era fixo, e editar o
bloco C# deixava o `.dll` velho ser carregado no lugar do novo: o sintoma é
"método não encontrado" numa função que está claramente escrita no script.
Com o hash no nome, uma edição gera outro arquivo e as versões anteriores
são apagadas na subida.

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
- Diferente de Spotify e Home Assistant, **não dá para deduzir "não configurado" da
  ausência de `.env`**: o OBS funciona sem credencial nenhuma. Daí o
  `OBS_HABILITADO` explícito.

Reproduzir a recusa de conexão do WSL exige cuidado: nesta máquina uma porta
fechada em `127.0.0.1` **pendura** em vez de recusar, então testes de
"servidor fora do ar" não se comportam como no Windows.

## Discord: dois modos, e por que os dois existem

`server/integrations/discord/` tem dois modos, escolhidos por `DISCORD_MODO`.
Não é indecisão — eles resolvem problemas diferentes e nenhum dos dois
sozinho serve para tudo:

- **`teclado` (padrão)** — simula os atalhos do Discord pela integração
  `atalhos`. Funciona para qualquer pessoa, sem cadastro nenhum, mas é cego:
  o Discord não conta se você está mudo, então os botões não acendem, e
  navegar entre canais depende de digitar nomes no Quick Switcher. **É o que
  vai no template público**, porque é o único que funciona para quem baixa o
  `.exe`.
- **`rpc`** — fala com o Discord pelo named pipe local (`rpc.js`). Sabe o
  estado de verdade, então os botões acendem, e lista canais de voz reais.
  O preço é criar um app no portal do Discord: o escopo `rpc` só vale para o
  **dono do app** e até 50 testadores até a Discord aprovar manualmente.
  Serve para o próprio deck, **não** para distribuir.

**Go Live não existe em nenhum dos dois**: nem API, nem RPC, nem tecla de
atalho. Só o botão na interface. Não tente implementar — não há por onde.

### O foco é decidido por atalho, não globalmente

**As duas telas de atalho do Discord são diferentes, e é isso que decide:**

- *Atalhos de teclado* — os embutidos (`CTRL+SHIFT+M` etc). Lista só de
  leitura, e **só funcionam com o Discord em foco**.
- *Teclas de Atalho* — os que a pessoa cria. Valem **globalmente**.

Por isso `DISCORD_FOCAR_ANTES` **não** vale para todas as ações: `_precisaFocar()`
só respeita a flag quando a pessoa definiu `DISCORD_TECLA_*` própria (aí
presume-se atalho global). Com a variável em branco vale o embutido, que
sempre foca. Uma versão anterior aplicava a flag a tudo, e quem a desligava
ficava com metade dos botões **silenciosamente inertes** — as teclas iam
para a janela que estivesse na frente.

### O que o RPC cobre, e o que sobra para o teclado

Cobre: mudo, surdo, entrar/sair de canal de voz, e canal anterior/próximo.
`_navegarCanalDeVoz()` lista os canais de voz do servidor atual e entra no
vizinho — no modo teclado isso era `ALT+UP`/`ALT+DOWN`, que move a seleção
na lista de canais **de texto** e nunca trocou canal de voz, nem com foco.

Os botões de AFK e "Voltar" saíram daí. `_irParaAfk()` **reconhece o canal de
ausentes pelo nome** (`DISCORD_NOMES_AFK`, normalizando acento, caixa e emoji,
para "🔇 AUSENTES 🔇" casar com "ausentes"): o RPC não entrega o
`afk_channel_id` que a guild tem na API HTTP, e chegar nele exigiria um bot
dentro do servidor. `_voltarAoCanalAnterior()` usa o último canal diferente do
atual, rastreado em `_aplicarCanal()` — apertar duas vezes alterna entre os
dois, que é o que se espera de um "voltar".

**Gotcha do `SELECT_VOICE_CHANNEL`: `force: true` é obrigatório para TROCAR
de canal.** O nome engana — não é entrar à força onde você não pode. Sem ele
o Discord responde `User is already joined to a voice channel` e a troca só
funciona quando você já está fora de qualquer canal, que é justamente quando
não se precisa dela. Sair (`channel_id: null`) não precisa de `force`.

Não cobre, e continua por teclado nos dois modos: atender, recusar, painel
de som, ligação atual, busca, servidor anterior/próximo. Por isso os campos
`DISCORD_TECLA_*` e `DISCORD_FOCAR_ANTES` aparecem na aba Integrações
**também no modo RPC**.

O seletor "Ir para…" (só no modo teclado) usa o **Quick Switcher**
(`CTRL+K` → digita → ENTER), com a pausa de 450ms antes do ENTER porque a
busca é assíncrona — sem ela o ENTER chega antes do resultado. A lista de
nomes vem de `DISCORD_DESTINOS` via `GET /discord/destinos`, e não do
Discord: listar canais de verdade pela API exigiria um bot dentro de cada
servidor, com permissão de administrador que ninguém tem nos servidores dos
outros. **É exatamente isso que o modo RPC resolve** — `GET /discord/canais`
lista os canais de voz reais, sem bot nenhum, porque fala pelo seu cliente.

### A autorização do RPC expira em 7 dias, e se renova sozinha

O access token OAuth2 do Discord vale **uma semana**. A primeira versão do
`rpc.js` guardava só o `access_token` e jogava fora o `refresh_token` que vem
na mesma resposta: passados sete dias o `AUTHENTICATE` era recusado, a
reconexão automática ficava retentando o mesmo token morto para sempre, e os
botões do Discord morriam em silêncio até alguém reautorizar à mão.

- **A renovação é reativa, não agendada.** O access token só é usado no
  `AUTHENTICATE`, uma vez por conexão, e `_conectarRpc()` já roda na subida e
  em toda reconexão. Então basta `_autenticarRenovandoSePreciso()`: se o erro
  vier com `codigo === 'token_invalido'`, troca o refresh por um token novo e
  tenta **uma** vez mais. Nada de guardar prazo de validade no `.env` nem de
  criar um timer que ninguém lembraria de cancelar. (O Spotify renova por
  prazo porque usa o token a cada chamada de API — caso diferente.)
- **O Discord ROTACIONA o refresh token**: cada renovação invalida o anterior.
  Por isso `_gravarTokens()` grava os dois juntos — gravar só o access token
  faria a renovação seguinte falhar.
- **Quem grava é a integração, não a rota.** `routes/discord.js` gravava o
  token depois de autorizar; como a renovação também precisa gravar, os dois
  caminhos passam pelo mesmo `_gravarTokens()`.
- **Erro carrega `codigo`, não frase.** `rpc.js` marca `token_invalido`,
  `renovacao_recusada` e `discord_fechado`; `MOTIVO_POR_ERRO` +
  `_diagnosticoRpc()` traduzem isso numa frase só, usada tanto pelas ações
  (`_garantirRpc()`) quanto pelo `catalogo.motivoIndisponivel`. Antes a mesma
  mensagem — "confira as credenciais" — servia para credencial ausente,
  Discord fechado e autorização vencida, mandando procurar no lugar errado
  justamente quem já estava com problema.
- **`autorizacao.pronto` não prova nada** além de existir uma string no
  `.env`: com o token vencido a aba Integrações anunciava "✓ conta já
  autorizada". Daí o campo `observacao`, que a UI mostra no lugar do ✓.

### Segredo não entra em log: `server/lib/segredos.js`

Quando o token vence, o próprio Discord responde `Invalid access token: <o
token>` — e essa mensagem era interpolada num `console.log`. No modo
empacotado o console vai para `deckly.log`, um arquivo solto ao lado do
`.exe`: a credencial ficava lá em texto puro, válida.

`redigir(texto)` varre `process.env` e troca o valor de toda chave cujo nome
case `TOKEN|SECRET|SENHA|PASSWORD|KEY` por `«NOME_DA_CHAVE oculto»` — dizer
qual chave foi ocultada é o que mantém a mensagem útil para diagnóstico.
Envolva com ele qualquer `erro.message` de integração que vá para log ou
resposta HTTP. O ponto mais importante já está coberto: `routes/actions.js`,
por onde passa erro de toda ação de toda integração.

### Abrir o Discord: nada de `abrirUwp`

**O Discord não é um app da Store.** Ele é instalado pelo Squirrel, numa
pasta `%LOCALAPPDATA%\Discord\app-1.0.xxxx` que **muda a cada atualização
automática** — apontar um botão para o `Discord.exe` de dentro dela quebra
sozinho na semana seguinte.

A integração usava `abrirUwp` com `com.squirrel.Discord.Discord`, que
funcionava **às vezes**: o Squirrel registra um AppUserModelID no shell (para
jump list e notificações), mas como não é um app empacotado, o
`shell:AppsFolder` do Explorer acertava ou não conforme o estado do cache.
O certo é `_focarOuAbrir()`: tenta `focarProcesso('Discord')` e, se não houver
janela, lança `Update.exe --processStart Discord.exe` — o `Update.exe` fica
fora das pastas versionadas e sempre inicia a mais nova. Depois espera a
janela aparecer (o Discord demora a desenhar; sem esperar, o `focarProcesso`
seguinte não acha nada). Foi isso que trouxe o parâmetro `argumentos` para
`atalhos.abrirApp`.

Isso trouxe três ações genéricas em `atalhos`: `enviarTeclas` (combo livre,
com `Converter-Combo` traduzindo nomes para códigos de tecla virtual),
`focarProcesso` (por nome, porque handle de janela muda a cada execução e
não dá para guardar num botão) e `digitarTexto`.

**Os `.ps1` têm BOM de UTF-8, e precisam continuar tendo.** O PowerShell 5.1
lê arquivo sem BOM como ANSI, e aí toda mensagem de erro com acento sai
como `NÃ£o`. O `[Console]::OutputEncoding` resolve a saída, não a leitura do
próprio script.

## Empacotamento (.exe) e resolução de caminhos

`npm run build` gera `build/deckly.exe` — Node SEA (Single
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
cria — não adianta `PORT=3555 ./deckly.exe`.

## Segundo plano (o .exe se solta do console)

`server/lib/segundo-plano.js`. No Windows não dá para desprender um processo
do console a que ele já pertence, então o executável **relança a si mesmo**
destacado e o processo original vira só um lançador.

- Pai e filho são o mesmo binário; o que os separa é a variável de ambiente
  `DECKLY_SEGUNDO_PLANO=1`, posta no filho. Sem essa marca o filho
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

## Erro fatal precisa deixar rastro

`server/index.js` registra `uncaughtException` (loga e sai com 1) e
`unhandledRejection` (só loga). Não é firula: empacotado em segundo plano não
há console, então sem isso o processo morria e o `deckly.log` ficava sem a
causa — o sintoma para a pessoa é "o deck parou de responder", sem mais nada.
A rejeição **não** derruba de propósito: as integrações têm promessas soltas
(reconexão do OBS, RPC do Discord), e matar o servidor porque o OBS caiu seria
uma regressão. As duas mensagens passam por `redigir()`, inclusive o stack.

## Documentação gerada (`npm run docs`, `npm run docs:pdf`)

Duas peças de documentação **não** são escritas à mão:

- `docs/acoes.md` sai de `scripts/gerar-docs.js`, que lê o getter `catalogo`
  de cada integração. Rode depois de mexer em qualquer ação. Uma ação que não
  aparece ali é uma ação que também não aparece no editor — o que falta é a
  entrada no catálogo.
- `docs/Guia-Deckly.pdf` sai de `scripts/gerar-pdf.js`, que imprime
  `docs/guia-primeiro-acesso.html` com o Chrome do Windows em headless. **A
  fonte é o HTML** — editar o PDF não faz sentido, ele é regenerado.
- O guia é escrito à mão, **menos dois blocos**: `CATALOGO:INICIO/FIM` e
  `RECEITAS:INICIO/FIM` são reescritos pelo `npm run docs`, da mesma fonte do
  `acoes.md`. Sem isso o guia — a única documentação que quem baixa o `.exe` lê
  — envelheceria a cada ação nova.
- **As imagens de `docs/img/` saem de uma instância descartável, nunca do deck
  pessoal.** Prints do deck real levariam caminho com o usuário do Windows, IP
  da LAN e nomes de canais do Discord para dentro do PDF distribuído. O jeito:
  copiar o `.exe` para uma pasta temporária, pré-criar `dados/.env` com
  `PORT=3555`, `DECKLY_TOKEN=DEMO-…` e `ABRIR_NAVEGADOR=nunca` (variável de
  ambiente do shell não chega no `.exe`), subir e fotografar com
  `chrome.exe --headless --screenshot --window-size=L,A`. A tela de boas-vindas
  ainda mostraria o IP real: para ela, os estáticos da cópia descartável
  recebem um `<script>` que troca a resposta de `/api/bemvindo` por valores
  genéricos, com o QR regerado por `server/lib/qr.js` para o endereço falso.
  O headless não clica: seletor aberto e modo de edição saem de um script que
  dispara o clique conforme o `#hash` da URL — a galeria de botões prontos tem
  `#receitas` de verdade no `config.js`, no mesmo espírito do `#integracoes`.

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

### As receitas (`server/lib/receitas.js`) são curadas, não projetadas

O catálogo responde *"a ação Trocar de cena pede o campo Nome da cena"*. Ele
não responde *"quero um botão que abre o jogo e o Discord juntos"* — traduzir
um objetivo em integração + ação + tipo + parâmetros + `estadoChave` +
`estiloEstado` são cinco decisões que o catálogo lista mas não conecta. As
receitas são essa conexão: botões prontos que a galeria **✨ Botão pronto** da
tela de configuração insere já preenchidos.

- **Não é um getter por integração, e isso é de propósito.** Receita é
  conteúdo editorial: adicionar uma ação nova não deveria inventar uma
  receita. E as mais úteis são **macros que cruzam integrações** (abrir o jogo
  *e* o Discord), que nenhum getter isolado conseguiria declarar. Mora ao lado
  do `catalogo-ui.js` pelo mesmo motivo dele: dois consumidores
  (`GET /api/catalogo` e `scripts/gerar-docs.js`).
- **`npm run docs` valida contra o catálogo ao vivo.** Integração inexistente
  e parâmetro obrigatório faltando derrubam o comando; **ação inexistente só
  avisa**, porque o catálogo do Discord muda conforme `DISCORD_MODO` e uma
  receita de RPC some legitimamente em modo teclado.
- **Por causa disso a doc é gerada num modo só.** O `gerar-docs.js` não carrega
  o `.env`, então vê o Discord em modo teclado — daí o campo opcional
  `rotulos` na receita, com o nome em português da ação ausente: o guia não
  pode mostrar `entrarNoCanal` para quem não programa.
- **A galeria mostra receita indisponível, e deixa inserir.** Dá para montar o
  deck inteiro e ligar o OBS depois. Só receita cuja **ação não existe** fica
  desabilitada — aí inserir criaria um botão que o `validar()` do
  `config-store` recusaria no Salvar. A frase de indisponível é a da própria
  integração (`motivoIndisponivel`), nunca uma inventada aqui, senão a galeria
  e a aba Integrações discordariam sobre o mesmo problema.

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
  código 4001. **O upgrade não passa pelos middlewares do Express**, então o
  `hostAceito` (anti DNS rebinding) e o limite de tentativas são aplicados à
  mão dentro do `wss.on('connection')` — código 4003 para nome DNS, 4029 para
  bloqueio. Esquecer isso deixaria um caminho aberto ao lado da porta trancada.
- **Dez tentativas erradas de token bloqueiam o IP** por 1 min, dobrando até
  15 min (`bloqueioRestante`/`registrarFalha`/`registrarSucesso` em
  `lib/auth.js`, `Map` em memória, limpeza preguiçosa — sem `setInterval`).
  Três decisões que parecem detalhe e não são: requisição **sem** token não
  conta (é o estado de quem ainda não pareou, e contá-la quebraria o primeiro
  acesso); o token **certo** também é recusado durante o bloqueio — aceitá-lo
  faria o bloqueio deixar de limitar a taxa de chutes, que é a única coisa que
  ele faz; e **`127.0.0.1` é isento**. A isenção não é conveniência: quem está
  na máquina já lê o `config/token.json`, então limitá-lo não protege nada, e
  sem ela dez erros na tela de pareamento do PC trancavam junto o `/config/` e
  o `POST /api/bemvindo/encerrar` — que é o único jeito normal de desligar no
  modo segundo plano. Foi o que aconteceu ao testar o `.exe`. Por causa disso o `ws-client.js` reconecta com espera crescente
  (2s → 30s) em vez de 2s fixos: com token vencido, o próprio deck se
  bloquearia em escalada.
- **OAuth do Spotify não pode exigir token**: o Spotify redireciona o
  navegador para `/spotify/callback` sem ele. Por isso `/login` e
  `/callback` usam `exigirLocal` em vez de `exigirToken`.
- Comparação do token é `timingSafeEqual`, e normaliza hífen/caixa antes —
  quem digita não deve ser barrado por formatação.
- O token vai para `config/token.json` (gitignored) ou vem de
  `DECKLY_TOKEN`. Formato pensado para ser digitado num tablet:
  alfabeto sem caracteres ambíguos, agrupado de 4 em 4.

No frontend, `public/js/token.js` é compartilhado pelo deck e pelo editor:
lê o token de `?token=` (link/QR de pareamento) ou do `localStorage`, tira
da URL depois de guardar, injeta o header nas chamadas e mostra a tela de
pareamento quando falta. Por isso `ws-client.js` **não** conecta sozinho no
construtor — quem chama `conectar()` é o `app.js`, depois de garantir token.

### Uma terceira trava: `exigirHostConhecido` (anti DNS rebinding)

`app.use(exigirHostConhecido)` é o **primeiro** middleware de todos, antes
até dos estáticos. Ele recusa requisição cujo cabeçalho `Host` seja um nome
DNS: só passa IP literal (`net.isIP`), `localhost`, e o que estiver em
`HOSTS_PERMITIDOS`.

O motivo não é óbvio, porque parece redundante com o `exigirLocal`. **Não é:
os dois olham coisas diferentes.** O `exigirLocal` confere o *endereço de
quem conectou*, e contra outro aparelho da rede isso basta. Ele não cobre o
navegador do próprio usuário sendo usado como ponte: um site malicioso
re-resolve o domínio dele para `127.0.0.1`, faz `fetch` para si mesmo na
porta do Deckly, e para o navegador aquilo é **mesma origem** — a resposta é
legível, e o `remoteAddress` que o `exigirLocal` vê continua sendo
`127.0.0.1`. Como `GET /api/bemvindo` é a única rota sem token e é
exatamente onde o token é revelado, o site sairia de lá com o controle do
deck.

O que quebra o ataque é que ele **só funciona por nome** — é preciso um
domínio para re-resolver. Acessar por IP não dá para forjar. Recusar nome
DNS não afeta o uso real: o QR, o console e a tela de boas-vindas sempre
entregam o endereço por IP.

### O corpo do `POST /action/:id` não pode redefinir a ação

`routes/actions.js` mescla só `valor` e `opcaoId` do corpo por cima dos
`parametros` do config (`CHAVES_DO_CLIENTE`) — que é exatamente o que o
frontend manda: slider envia `{ valor }`, seletor envia `{ opcaoId }`.

Antes o corpo inteiro era mesclado, e isso **furava o `exigirLocal` do `PUT
/api/config`**. A trava daquela rota existe porque criar botão é, na
prática, execução de código — um botão pode abrir qualquer programa. Só que
não era preciso criar botão nenhum: bastava trocar os parâmetros de um que
já existisse. Um `POST` em qualquer botão de `atalhos.abrirApp` com
`{ caminho: 'powershell.exe', argumentos: '-Command …' }` executava o que
quisesse, com token e sem nunca passar pelo `exigirLocal`. E o template
público já traz botões de `abrirApp`, então valia para toda instalação
padrão.

Ao adicionar uma ação que receba dado do cliente em runtime, o caminho é
acrescentar a chave em `CHAVES_DO_CLIENTE` **conscientemente** — não voltar
a mesclar o corpo inteiro.

## Modo de edição de layout (no próprio deck)

O ✏️ no cabeçalho do deck liga o modo de edição: arrasta para mover, toca para
selecionar, alça de canto (ou os `±` da barra) para redimensionar, e chips de
coluna e altura de linha. `public/js/editor-layout.js`.

Ele vive **no deck**, e não no `/config/`, porque o problema era outro: montar
o deck era editar no PC, salvar, pegar o tablet e olhar. Editando na tela real,
o preview é a própria tela.

- **Durante a interação, nada de re-render.** Arrastar move o nó com
  `insertBefore` e redimensionar escreve `grid-column: span N` no elemento; a
  grade CSS reflui sozinha. Chamar `renderizarGrade()` a cada `pointermove`
  recriaria todos os botões — e `criarBotaoInfo` dispara um fetch de favoritos
  a cada criação. O array de botões só é sincronizado com a ordem do DOM ao
  soltar.
- **`window.deck`** (exposto no fim da IIFE do `app.js`) é a superfície mínima
  que o editor usa, no mesmo padrão de `window.acesso` e `window.clienteWs`.
  Isso evitou espalhar `if (editando)` pelos criadores de botão — nenhum deles
  precisou mudar.
- **Ações inertes por dois caminhos**: listeners em fase de **captura** no
  contêiner (rodam antes dos listeners do próprio botão, então nem o clique nem
  o seletor de lista disparam) e `pointer-events: none` nos filhos (impede o
  polegar do slider e a estrela do mostrador de capturarem o gesto, e faz o
  `elementFromPoint` devolver sempre o `.botao`).
- **`touch-action: none` nos botões, só no modo de edição.** É o que decide se
  o arraste funciona no dedo: sem isso o navegador entende o gesto como rolagem
  e nunca entrega os `pointermove`. O preço é não rolar arrastando sobre um
  botão enquanto edita — daí o auto-scroll de borda.
- **Pointer capture no contêiner, não no botão**: o botão é reinserido no DOM
  várias vezes durante o arraste e a captura nele não sobreviveria.
- **Histerese de 4px** antes de reavaliar o alvo, senão a grade oscila entre
  duas posições com o dedo parado na fronteira entre dois botões.
- **O tamanho vigente vem do DOM, não do config**: slider nasce 1x2 e mostrador
  2x2 pelo CSS, sem campo no JSON. Sem ler do DOM, a primeira redimensionada de
  um slider o jogaria para 1x1.

### `PUT /api/layout` — por que pode dispensar `exigirLocal`

`PUT /api/config` exige 127.0.0.1 porque um botão pode mandar abrir qualquer
programa. Mas arrastar botão é justamente o que se quer fazer no tablet.

A rota nova (`server/routes/layout.js` + `configStore.aplicarLayout()`) resolve
isso **pela forma do payload, não por uma verificação**: ela lê integração,
ação, parâmetros, fonte e `estadoChave` do **disco**, e do corpo só aceita ids,
ordem, `largura`, `altura`, `colunas` e `alturaBotao`. Não existe payload capaz
de criar um botão que abra um programa. O conjunto de ids precisa bater
exatamente com o do disco, o que sozinho impede adicionar, remover e mover
botão entre páginas por ali.

A alternativa — aceitar o config inteiro e conferir se só o layout mudou — foi
descartada: comparação profunda é frágil, e todo campo novo do schema passaria
a entrar por omissão.

### Posição de botão não vai para o CSS

Havia sete regras em `style.css` posicionando botões por `data-id`
(`[data-id="spotify.play_pause"] { grid-column: 1; grid-row: 1 }` e afins),
resquício de um ajuste manual da página Mídia. Elas **quebravam o editor em
silêncio**: arrastar esses botões não mudava nada na tela, porque a posição
vinha da folha de estilo e não da ordem do array. Foram removidas junto com o
`grid-auto-flow: dense` (que existia para servi-las, e que reordena
visualmente, quebrando a previsibilidade do arraste).

Se aparecer a tentação de fixar um botão numa posição, o lugar é o config —
ordem + `largura`/`altura` — nunca o CSS.

**Armadilha do `hidden`**, que apareceu duas vezes aqui: o `display: none` do
atributo vem do navegador com especificidade mínima, então qualquer regra nossa
com `display` o derrota em silêncio. Existe um `[hidden] { display: none
!important }` no topo do `style.css` por causa disso.

## Tela de configuração (`public/config/`)

Editor de páginas e botões servido em `/config/` (link ⚙️ no cabeçalho do
deck). HTML/CSS/JS puro, como o resto — sem framework, sem build.

O ponto central: **nada ali é hardcoded por integração**. Os formulários são
montados a partir de `GET /api/catalogo`, então uma integração nova aparece
sozinha no editor assim que expuser seu getter `catalogo`. Se você adicionar
uma ação e ela não aparecer no editor, o que falta é a entrada no catálogo,
não código de UI.

Ao lado de "+ Botão" fica **✨ Botão pronto**, a galeria de receitas — veja
"As receitas" acima. Ela sai do mesmo `GET /api/catalogo`, sem requisição
nova, e insere uma cópia profunda do botão da receita com um `id` gerado por
`gerarId()`; o formulário da direita abre preenchido, e é ele o passo a passo.

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
  PUT escreveria qualquer variável de ambiente (`PATH`, `DECKLY_TOKEN`).
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
| `textoVazio` | `info` | Texto quando não há nada a mostrar. Ausente = "Nada tocando" |
| `favoritoFonte` + `favoritoId` | `info` | Mostram uma estrela que favorita o item exibido agora: a URL da lista e o dot-path do id. **Andam juntos** |
| `largura` / `altura` | todos | Tamanho em células da grade (1–6). Ausente = 1 |
| `cor` | todos | Cor de destaque do botão, hex (`#6c5ce7`). Ausente = segue o tema |
| `_nota` | todos | Comentário livre — substitui os comentários que o JSON não tem |

Campos de **página**: `id`, `titulo`, `icone`, `botoes`, `_nota`, e o layout
— `colunas` (1–12, ausente = automático) e `alturaBotao` (60–260 px).
O tamanho vira `grid-column/row: span N` inline no `app.js`, e a cor vira a
variável `--cor-botao`, de onde o CSS deriva borda e fundo — assim um botão
colorido continua parecendo parte do tema, e não um adesivo por cima.

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
   volta a exigir editar `.env` na mão. Considere também uma receita em
   `server/lib/receitas.js`: o catálogo faz a integração aparecer no editor,
   a receita faz alguém conseguir montar o primeiro botão dela.
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
const integ={}; for (const n of ['media','obs','spotify','atalhos','discord','homeassistant'])
  integ[n]=require('./server/integrations/'+n);
const erros=store.validar(require('./config/pages.config.example.json'), integ);
console.log(erros.length ? erros : 'template válido'); process.exit(0);"
```

Não há suíte de testes automatizados neste projeto — validação é manual
(subir o servidor, bater nos endpoints, abrir no navegador).
