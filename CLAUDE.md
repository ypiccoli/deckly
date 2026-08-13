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
- No frontend, `estadoChave` (dot-path, ex.: `"obs.cenaAtual"`) resolve um
  valor dentro do estado global; `estadoComparar` (opcional) compara esse
  valor com `botao.parametros[<chave>]` (usado nos botões de cena do OBS,
  onde vários botões compartilham o mesmo `estadoChave` mas cada um só fica
  "ativo" quando a cena bate com o seu próprio `parametros.cena`). Sem
  `estadoComparar`, o botão fica "ativo" quando o valor resolvido é truthy
  (mute, gravando, luz ligada, etc).

## Integração de mídia (Windows via WSL2) — ponto delicado

`server/integrations/media/` controla volume master e teclas de mídia do
**Windows**, mesmo com o servidor rodando dentro do WSL2, chamando
`powershell.exe` via interop (`server/integrations/media/windows.js`). O
script real é `scripts/windows-media.ps1`.

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

`server/integrations/media/index.js` decide o modo via `MEDIA_BACKEND`
(`.env`, padrão `auto`): `win32` → `nativo` (chama PowerShell local sem
`wslpath`), `WSL_DISTRO_NAME` definida → `wsl` (converte o caminho do
script com `wslpath -w` antes de chamar `powershell.exe`).

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
