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
public/js/app.js  --GET /api/config-->  server/config-loader.js (lê config/pages.config.js)
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

- `config/pages.config.js` é a **única fonte de verdade** do layout de
  botões (páginas, ícones, rótulos, qual integração/ação cada botão chama,
  e `estadoChave`/`estadoComparar` para saber quando destacar o botão como
  "ativo"). Adicionar um botão não deve exigir tocar em `server/` nem em
  `public/`.
- Cada integração (`server/integrations/<nome>/index.js`) exporta uma
  **instância singleton** que:
  - estende `EventEmitter` e emite `'estado'` com o novo estado sempre que
    algo muda;
  - expõe `.estado` (objeto atual) e `.acoes` (mapa de funções async, uma
    por ação usada em `config/pages.config.js`);
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

## Adicionando uma nova integração

1. Crie `server/integrations/<nome>/index.js` exportando uma instância que
   estende `EventEmitter`, com `.estado`, `.acoes` e (se precisar de setup
   assíncrono) `async inicializar()`.
2. Registre em `server/index.js` (`const integracoes = { ..., <nome> }`).
3. Adicione botões em `config/pages.config.js` referenciando
   `integracao: '<nome>'` e `acao: '<nomeDaAcao>'`.
4. Se a ação tiver estado ao vivo, emita `this.emit('estado', this.estado)`
   sempre que algo mudar (por ação do próprio botão OU por evento externo,
   como o OBS faz com `CurrentProgramSceneChanged`).

## Testes manuais úteis

```bash
curl -s http://localhost:3000/api/config | jq .
curl -s -X POST http://localhost:3000/action/midia.play_pause
curl -s -X POST http://localhost:3000/action/midia.volume_slider -H "Content-Type: application/json" -d '{"valor":30}'
```

Não há suíte de testes automatizados neste projeto — validação é manual
(subir o servidor, bater nos endpoints, abrir no navegador).
