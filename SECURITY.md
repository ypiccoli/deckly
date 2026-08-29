# Segurança

O Deckly tem um modelo de segurança incomum, e vale entendê-lo antes de usar
ou de reportar uma falha: **ele existe para executar comandos no seu PC a
partir de requisições HTTP**. Abrir programas, apertar teclas, mudar o
volume, trocar a cena do OBS. Isso é a função, não um efeito colateral.

Por isso o desenho todo parte de uma premissa:

> **O Deckly é feito para uma rede local em que você confia — a sua casa.
> Não exponha a porta dele na internet, nem em Wi-Fi de café, hotel,
> coworking ou evento.**

Nada aqui foi pensado para sobreviver a um atacante já dentro da sua rede
com tempo sobrando. Foi pensado para que o tablet da sala funcione e o
aparelho aleatório do Wi-Fi não consiga mandar o seu PC abrir programas.

## As duas travas, e por que são diferentes

| Trava | Onde se aplica | Por quê |
|-------|----------------|---------|
| **`exigirToken`** | Tudo que dispara ação ou lê estado: `POST /action/:id`, `/api/*`, `/atalhos/*`, `/media/saidas`, `/discord/*`, `/homeassistant/*`, `/spotify/dispositivos` e o WebSocket `/ws` | Sem isso, qualquer aparelho da rede mandaria o seu PC abrir programas |
| **`exigirLocal`** | Só o que **reconfigura** o app: `PUT /api/config`, `GET /api/catalogo`, `GET/PUT /api/integracoes`, `/api/bemvindo`, e o OAuth do Spotify e do Discord | Um botão pode mandar abrir qualquer programa. Criar botão é, na prática, execução de código — então fica restrito ao próprio PC (`127.0.0.1`), liberável com `CONFIG_REMOTO=true` por quem aceitar o risco |

A tabela completa, rota por rota, está em
[docs/urls.md](docs/urls.md#rotas-da-api).

Três decisões que parecem brechas e não são:

- **Os arquivos estáticos (`/`, `/config/`, `/bemvindo/`) ficam abertos de
  propósito.** HTML, CSS e JS não têm segredo, e a página precisa carregar
  para poder pedir o token a quem ainda não pareou.
- **`GET /api/bemvindo` é a única rota sem token** — não poderia exigir um,
  é justamente onde o token é revelado. Ela se protege por `exigirLocal`.
- **`PUT /api/layout` e `POST /api/favoritos` não exigem `exigirLocal`**,
  porque arrastar botão e favoritar canal são coisas que se faz do tablet.
  O `layout` é seguro pela **forma do payload**, não por uma verificação: ele
  lê integração, ação e parâmetros do disco, e do corpo só aceita ids, ordem
  e tamanhos. Não existe payload capaz de criar um botão que abra um
  programa.

## O que já é cuidado no código

- **Token comparado com `crypto.timingSafeEqual`** (`server/lib/token.js`),
  normalizando hífen e caixa antes — quem digita no tablet não deve ser
  barrado por formatação.
- **Segredo não vai para log.** `server/lib/segredos.js` varre o
  `process.env` e substitui o valor de qualquer chave que case
  `TOKEN|SECRET|SENHA|PASSWORD|KEY` por `«NOME_DA_CHAVE oculto»`. Existe
  porque o Discord responde `Invalid access token: <o token>` quando ele
  vence, e isso ia parar no `deckly.log` em texto puro. Todo erro de ação
  passa por lá (`server/routes/actions.js`).
- **Credencial nunca volta para o navegador.** A aba Integrações manda
  `preenchido: true/false` para campos de senha, nunca o valor.
- **`PUT /api/integracoes` só grava chaves declaradas pela própria
  integração** — sem essa lista, um PUT escreveria qualquer variável de
  ambiente, incluindo `PATH` e `DECKLY_TOKEN`.
- **WebSocket sem token fecha com o código 4001.**
- **O corpo do `POST /action/:id` só contribui com `valor` e `opcaoId`**
  (`server/routes/actions.js`). Todo o resto — inclusive o caminho de um
  programa a abrir — vem do config, que só é gravável de `127.0.0.1`. Sem
  esse filtro daria para pegar qualquer botão de "abrir programa" e trocar o
  caminho dele por um comando qualquer, o que contornaria na prática o
  `exigirLocal` do `PUT /api/config`.
- **Requisição por nome DNS é recusada** (`exigirHostConhecido`, em
  `server/lib/auth.js`): só IP literal e `localhost` passam. É a defesa
  contra **DNS rebinding** — sem ela, um site malicioso poderia fazer o seu
  próprio navegador buscar `GET /api/bemvindo` (a rota sem token, que revela
  o token) e sair de lá com o controle do deck, porque para o servidor a
  conexão vem mesmo de `127.0.0.1`. Quem acessa por um nome — `meupc.local`,
  Tailscale, DNS caseiro — libera em `HOSTS_PERMITIDOS` no `.env`.
- O token vive em `config/token.json` (gitignored) ou em `DECKLY_TOKEN`, e
  nunca é commitado.

## O que **não** é protegido, e você deve saber

- **O tráfego é HTTP puro, sem TLS.** Quem conseguir farejar a sua rede vê o
  token passar. Numa LAN doméstica isso é aceitável; num Wi-Fi público, não.
- **O token é único e não expira.** Não há usuários, papéis nem revogação
  individual: para invalidar um pareamento, apague `config/token.json` (ou
  troque `DECKLY_TOKEN`) e pareie os aparelhos de novo.
- **Quem tem o token pode disparar qualquer botão que você criou.** Se um
  deles abre um programa, quem tem o token abre esse programa — mas **só
  aquele** programa: o corpo da requisição não consegue trocar os parâmetros
  do botão (veja abaixo).
- **Não há limite de tentativas** no envio do token.
- **O executável não é assinado digitalmente.** O SmartScreen vai avisar na
  primeira execução — isso é esperado. Baixe o `.exe` apenas da aba
  [Releases](../../releases) deste repositório.

## Reportando uma falha

Se você encontrou algo **explorável** — que quebre as travas acima ou
contrarie o que esta página promete:

- Use os **[GitHub Security
  Advisories](https://github.com/ypiccoli/deckly/security/advisories/new)**,
  que abrem um canal privado. Não abra issue pública.
- Descreva o que dá para fazer, e a partir de onde (mesmo PC? outro aparelho
  da LAN? sem token?). Essa distinção é o que decide a gravidade aqui.

Se **não** for explorável — uma melhoria de robustez, uma dependência
desatualizada, um "seria bom ter" — pode abrir
[issue](https://github.com/ypiccoli/deckly/issues) normal.

Não há programa de recompensa: é um projeto pessoal, mantido nas horas
vagas. Mas todo reporte é lido, e o crédito vai para quem reportou.

## Escopo

Este é um projeto pessoal sem garantia, distribuído sob a
[GPL-3.0](LICENSE). Não há SLA de correção, e a versão suportada é sempre a
**última release**.
