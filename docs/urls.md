# URLs do Deckly

Tudo roda em `http://<host>:<PORT>`, com `PORT=3000` por padrão (`.env`).
Onde aparecer `3000` abaixo, troque pela sua porta se você a mudou.

Há dois endereços de host, e a diferença importa:

| Host | Quem alcança | Para que serve |
|------|--------------|----------------|
| `127.0.0.1` (ou `localhost`) | **Só o próprio PC** | Configurar o deck, ver o token, autorizar o Spotify |
| `192.168.x.x` (IP da LAN) | Qualquer aparelho do Wi-Fi | Usar o deck no tablet |

O servidor escuta em `0.0.0.0`, ou seja, nas duas pontas ao mesmo tempo. A
separação de segurança não vem do endereço que você digita, e sim do
middleware `exigirLocal` — algumas rotas simplesmente recusam quem não vier
de `127.0.0.1` (ver tabela no fim).

## As principais — no PC

| URL | O que é |
|-----|---------|
| `http://127.0.0.1:3000/bemvindo/` | **Painel inicial.** Token, QR de pareamento, atalhos e o botão de encerrar o servidor. É a que vale guardar nos favoritos |
| `http://127.0.0.1:3000/` | O deck em si (a mesma grade do tablet) |
| `http://127.0.0.1:3000/config/` | Editor de páginas e botões |
| `http://127.0.0.1:3000/config/#integracoes` | Vai direto no painel de credenciais (OBS, Spotify, Discord) |
| `http://127.0.0.1:3000/spotify/login` | Inicia a autorização do Spotify (normalmente acionado pelo botão na tela acima) |

## No tablet

| URL | O que é |
|-----|---------|
| `http://<IP-do-PC>:3000/` | O deck |
| `http://<IP-do-PC>:3000/?token=SEU-TOKEN` | **Link de pareamento** — é isto que o QR code contém. Depois de abrir uma vez, o token fica guardado no aparelho e a URL curta basta |

O IP aparece na tela de boas-vindas e no console ao subir o servidor. Se
mudar (o roteador costuma renovar por DHCP), o pareamento continua valendo —
só o endereço muda. Para não depender disso, reserve um IP fixo para o PC no
roteador.

## Endereços externos usados

Só três, todos opcionais e só quando a integração correspondente está ligada:

| Endereço | Quando é chamado |
|----------|------------------|
| `accounts.spotify.com` | Autorização e renovação do token do Spotify |
| `api.spotify.com` | Música tocando, faixas, volume, dispositivos |
| `nodejs.org` | Só no `npm run build`, para baixar o `node.exe` embutido no executável |

O deck em uso normal (mídia, atalhos, janelas, OBS local) **não acessa a
internet**.

## Rotas da API

Só interessa se você for mexer no código ou testar com `curl`. Duas travas,
que podem se acumular:

- **token** — header `X-Token: <token>` (ou `?token=` na query). Sem ele,
  qualquer aparelho da rede mandaria o seu PC abrir programas.
- **local** — só responde de `127.0.0.1`; libere com `CONFIG_REMOTO=true`.

| Método e rota | Travas | O que faz |
|---------------|--------|-----------|
| `GET /` , `/config/`, `/bemvindo/` | — | Arquivos estáticos. Abertos de propósito: não têm segredo, e a página precisa carregar para poder pedir o token |
| `GET /api/bemvindo` | local | Token, IP, QR, status. **Única rota sem token** — não poderia exigir, é onde o token é revelado |
| `POST /api/bemvindo/encerrar` | local + token | Desliga o servidor |
| `GET /api/config` | token | O layout do deck (é o que o tablet busca ao abrir) |
| `PUT /api/config` | local + token | Grava o layout. Valida antes; erro devolve 400 e não grava nada |
| `GET /api/catalogo` | local + token | Ações e estados de cada integração — é o que monta os formulários do editor |
| `GET /api/integracoes` | local + token | Credenciais: quais campos existem e se estão preenchidos (**nunca o valor**) |
| `PUT /api/integracoes` | local + token | Grava credenciais no `.env` e reconfigura a integração na hora |
| `POST /action/:id` | token | Dispara o botão de `id`. O corpo JSON vira parâmetro extra (ex.: `{"valor":30}` num slider) |
| `GET /atalhos/janelas` | token | Janelas abertas agora (alimenta o seletor "Janelas") |
| `GET /atalhos/jogos` | token | Jogos instalados na Steam (alimenta o "Jogar…") |
| `GET /discord/destinos` | token | Canais e servidores configurados (alimenta o "Ir para…") |
| `GET /spotify/login` | local | Redireciona para a autorização do Spotify |
| `GET /spotify/callback` | local | Retorno do Spotify. **Não exige token** — o Spotify redireciona o navegador sem ele |
| `GET /spotify/dispositivos` | token | Aparelhos Spotify ativos (alimenta o "Tocar em…") |
| `WS /ws?token=<token>` | token | Estado ao vivo. O token vai na query porque o navegador não deixa mandar header no handshake de WebSocket |

### Testando pelo terminal

```bash
# Do próprio PC. O token sai do arquivo, ou da tela de boas-vindas.
export TOKEN=$(node -e "console.log(require('./config/token.json').token)")

curl -s -H "X-Token: $TOKEN" http://127.0.0.1:3000/api/config | jq .
curl -s -X POST -H "X-Token: $TOKEN" http://127.0.0.1:3000/action/midia.play_pause
curl -s -X POST -H "X-Token: $TOKEN" http://127.0.0.1:3000/action/midia.volume \
  -H "Content-Type: application/json" -d '{"valor":30}'
```

## Onde ficam os arquivos

Rodando pelo `.exe`, tudo mora na pasta `dados/`, ao lado dele:

| Caminho | O que é |
|---------|---------|
| `dados/.env` | Porta, credenciais e opções |
| `dados/config/pages.config.json` | Seu deck |
| `dados/config/token.json` | O token de acesso |
| `dados/deckly.log` | Log (só existe rodando em segundo plano) |
| `dados/public/`, `dados/scripts/` | Código, reescrito a cada inicialização |

Rodando do código-fonte, os mesmos arquivos ficam na raiz do repositório.
