# Stream Deck Web

Um "Stream Deck" caseiro: um servidor Node.js roda no seu PC e serve uma
grade de botões táteis que você abre no **navegador do tablet** (na mesma
rede Wi-Fi). Cada botão dispara uma ação no PC — mídia/volume, cenas e
gravação do OBS, Spotify, Discord e a casa inteligente via Home Assistant.

Feito para substituir o Touch Portal: sem limites de plugin, com visual
próprio, e configurável por uma tela de configuração no próprio navegador.

## O que baixar

Há dois caminhos, e a maioria das pessoas quer o primeiro.

### 🎛️ Só quero usar o deck

**Baixe um arquivo só: `stream-deck-web.exe`**, na aba
[Releases](../../releases).

- **Não precisa clonar o repositório.**
- **Não precisa instalar Node, WSL, nem nada.** O Node vai embutido dentro
  do executável.
- **Não tem instalador.** É um `.exe` avulso: você o põe numa pasta sua e dá
  dois cliques. Na primeira execução ele cria uma pasta `dados/` ao lado,
  com a sua configuração e o seu token.
- **Nada é instalado no tablet.** Ele só abre uma página no navegador.

Junto, baixe o **[Guia de Primeiro Acesso (PDF)](docs/Guia-Stream-Deck-Web.pdf)**
e leia antes de rodar — são uns 10 minutos, do arquivo baixado até o deck
funcionando no tablet, sem jargão.

Para atualizar depois, troque só o `.exe` e mantenha a pasta `dados/`: sua
configuração e credenciais ficam ali e não são sobrescritas.

Requisitos: Windows 10 ou 11, e um tablet/celular na **mesma rede Wi-Fi**.

### 🛠️ Quero mexer no código

Aí sim, clone o repositório e siga [Instalação](#instalação). Você vai
precisar de Node.js 18+. Rodando do código-fonte não existe `.exe` nem pasta
`dados/` — os arquivos ficam na raiz do repositório.

O resto deste README é a documentação técnica. Veja também:

- **[docs/acoes.md](docs/acoes.md)** — tudo que dá para colocar num botão
- **[docs/urls.md](docs/urls.md)** — todas as URLs e rotas da API

## Sumário

- [Arquitetura](#arquitetura)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Como rodar](#como-rodar)
- [Acessar do tablet (rede — importante no WSL2)](#acessar-do-tablet-rede--importante-no-wsl2)
- [Token de acesso](#token-de-acesso)
- [Controle de mídia (Windows via WSL2)](#controle-de-mídia-windows-via-wsl2)
- [Atalhos: apps, sites, jogos e janelas](#atalhos-apps-sites-jogos-e-janelas)
- [Configurar as integrações (aba Integrações)](#configurar-as-integrações-aba-integrações)
- [Habilitar o OBS](#habilitar-o-obs)
- [Habilitar o Spotify](#habilitar-o-spotify)
- [Habilitar o Discord](#habilitar-o-discord)
- [Casa inteligente com Home Assistant](#casa-inteligente-com-home-assistant)
- [Editar páginas e botões](#editar-páginas-e-botões)
- [Todas as ações disponíveis](docs/acoes.md)
- [Todas as URLs e rotas](docs/urls.md)
- [Gerar o executável (.exe)](#gerar-o-executável-exe)
- [Rodando em segundo plano](#rodando-em-segundo-plano)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Scripts npm](#scripts-npm)
- [Solução de problemas](#solução-de-problemas)

## Arquitetura

```
Tablet (navegador, PWA)  <-- HTTP + WebSocket -->  Servidor Node.js (Express + ws)
                                                          |
                                                          ├── integrations/media   -> Windows (volume + mute)
                                                          ├── integrations/atalhos -> Windows (atalhos, apps, janelas, jogos)
                                                          ├── integrations/obs     -> obs-websocket-js
                                                          ├── integrations/spotify -> Web API oficial
                                                          ├── integrations/discord -> atalhos de teclado ou RPC local
                                                          ├── integrations/homeassistant -> REST + WebSocket (casa inteligente)
                                                          └── integrations/hue     -> CLIP API v2 (esqueleto, superado pelo HA)
```

- O frontend (`public/`) é HTML/CSS/JS puro, sem framework e sem build step.
  Busca a grade de botões em `GET /api/config` e dispara ações em
  `POST /action/:id`. Um WebSocket (`/ws`) empurra o estado ao vivo (cena
  ativa, mic mudo, gravando, volume) para os botões atualizarem sozinhos.
- Cada integração em `server/integrations/*` é isolada: expõe um objeto
  `acoes` (as funções que os botões chamam) e emite eventos `estado` que o
  servidor retransmite pelo WebSocket. Adicionar uma integração nova não
  exige tocar nas outras.
- O layout dos botões fica em `config/pages.config.json` — edite esse arquivo
  para adicionar/remover/reordenar botões sem mexer no código. Ele é pessoal
  e **não vai para o Git**; o repositório traz o
  `config/pages.config.example.json` como ponto de partida.

## Pré-requisitos

- Windows 10/11 com **WSL2** instalado (é onde este projeto foi pensado para
  rodar) — mas também funciona rodando o Node nativamente no Windows.
- **Node.js 18+** dentro do ambiente onde o servidor vai rodar (aqui, dentro
  da distro WSL2). Confira com `node --version`.
- Tablet Android (ou qualquer navegador moderno) na **mesma rede Wi-Fi** do
  PC.
- Opcional, e só para as integrações que você quiser: OBS Studio 28+ (já vem
  com obs-websocket embutido), conta Spotify **Premium**, Discord instalado,
  e um Home Assistant na rede para a parte de casa inteligente.

## Instalação

```bash
cd ~/projetos/stream-deck-web
npm install
cp .env.example .env
cp config/pages.config.example.json config/pages.config.json
```

Abra o `.env` e ajuste o que precisar (a porta padrão já funciona sem
alterar nada; OBS/Spotify/Hue são opcionais — veja as seções abaixo).

O `config/pages.config.json` é o seu layout de botões: ajuste os caminhos de
programas, IPs e nomes de cena para os da sua máquina. Os dois arquivos
copiados acima são ignorados pelo Git, então seus dados ficam só aí.

## Como rodar

```bash
npm start        # produção
npm run dev       # desenvolvimento, reinicia sozinho a cada alteração (nodemon)
```

Ao subir, o terminal mostra algo como:

```
Stream Deck Web rodando na porta 3000

  Neste PC          http://127.0.0.1:3000
  Configurar        http://127.0.0.1:3000/config/
  No tablet (LAN)   http://192.168.1.20:3000

  Token de acesso   XXXX-XXXX-XXXX-XXXX   (gerado agora)
```

Veja [Token de acesso](#token-de-acesso) para parear o tablet — tem um QR
code no terminal para não precisar digitar.

## Acessar do tablet (rede — importante no WSL2)

Este é o ponto que mais confunde quem nunca mexeu em rede do WSL2, então
vamos com calma.

**O problema:** por padrão, o WSL2 roda atrás de um NAT interno. O Windows
consegue falar com o servidor via `localhost:3000` (o próprio WSL2 encaminha
isso automaticamat), mas **outros dispositivos da sua rede (como o tablet)
não conseguem** alcançar o IP do Windows na LAN, porque esse IP não está
"escutando" a porta 3000 — quem escuta é o Linux dentro do WSL2, com um IP
interno que não existe fora da máquina.

Existem duas formas de resolver. Use a **Opção A** se possível — é bem mais
simples e não precisa ser refeita a cada reinício.

### Opção A (recomendada): modo de rede "mirrored"

Disponível em Windows 11 22H2+ com WSL >= 2.0. Nesse modo, o WSL2 passa a
compartilhar diretamente as interfaces de rede do Windows — o servidor fica
acessível pelo mesmo IP que o próprio Windows usa na LAN.

1. No **Windows** (não no WSL), abra o Bloco de Notas e crie/edite o arquivo:
   `C:\Users\SEU_USUARIO\.wslconfig`
2. Cole o conteúdo:
   ```ini
   [wsl2]
   networkingMode=mirrored
   ```
3. Ainda no Windows, abra o PowerShell e rode:
   ```powershell
   wsl --shutdown
   ```
4. Abra o terminal do WSL de novo e inicie o servidor (`npm start`).
5. Descubra o IP do seu PC na rede Wi-Fi/Ethernet: no Windows, rode
   `ipconfig` e procure o adaptador da sua rede (ex.: "Ethernet" ou
   "Wi-Fi"), campo `Endereço IPv4` (algo como `192.168.1.20`).
6. No navegador do tablet, acesse `http://<esse-IP>:3000`.

Se o `.wslconfig` não existir ainda ou você não tiver certeza da versão do
WSL, rode `wsl --version` no PowerShell — você precisa de `2.0.0` ou mais
recente para o modo mirrored.

### Opção B (alternativa): port proxy + regra de firewall

Use esta opção se o modo mirrored não estiver disponível na sua versão do
Windows/WSL.

1. Dentro do **WSL**, descubra o IP interno da distro:
   ```bash
   hostname -I
   ```
   Isso retorna algo como `172.24.248.190`. **Atenção:** esse IP muda toda
   vez que o WSL reinicia, então os passos abaixo precisam ser refeitos após
   cada reboot (ou automatizados — veja a nota no fim desta seção).

2. No **Windows**, abra o PowerShell **como Administrador** e crie o
   redirecionamento de porta (troque `<IP-DO-WSL>` pelo IP do passo 1):
   ```powershell
   netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=3000 connectaddress=<IP-DO-WSL> connectport=3000
   ```

3. Libere a porta no Firewall do Windows (rede privada):
   ```powershell
   New-NetFirewallRule -DisplayName "Stream Deck Web" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   ```

4. No navegador do tablet, acesse `http://<IP-do-Windows-na-LAN>:3000`
   (o mesmo IP que você usaria no navegador do próprio PC de fora, obtido via
   `ipconfig`).

5. Para desfazer o redirecionamento (ex.: antes de recriar com um IP novo):
   ```powershell
   netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=3000
   ```

> Como o IP do WSL muda a cada reinício, a Opção A (mirrored) é bem mais
> prática no dia a dia. A Opção B é útil como fallback ou em versões mais
> antigas do Windows.

### Confirmar que está acessível

- No PC: abra `http://localhost:3000` — deve mostrar a grade de botões.
- No tablet: abra `http://<IP>:3000` no navegador. Se a grade aparecer e os
  botões responderem ao toque, a rede está OK.
- Use o menu → **"Adicionar à tela inicial"** (ou o banner de instalação)
  para instalar como PWA — ele abre em tela cheia, sem barra de endereço,
  como um app nativo.

### Qual navegador usar no tablet

O **Opera Mini** vai bem aqui: é leve, o que ajuda em tablets antigos — que
é justamente o tipo de aparelho que costuma virar deck.

**O cuidado que ele exige:** o modo de economia de dados do Opera Mini passa
as páginas por servidores da Opera antes de exibir. Como o deck está na rede
local, e não na internet, esse proxy não alcança o endereço e a página pode
simplesmente não carregar. Se a tela ficar em branco, **desligue a economia
de dados** (ou o modo "Extreme") nas configurações do app.

O **Chrome** continua sendo a opção mais previsível, e tem o melhor suporte
a instalar como PWA (tela cheia de verdade, com ícone próprio).

## Token de acesso

O deck manda o seu PC abrir programas — então ele **não pode** ficar aberto
para qualquer aparelho da rede. Todo acesso exige um token.

Na primeira execução o servidor gera um e mostra assim:

```
  Token de acesso   XXXX-XXXX-XXXX-XXXX   (gerado agora)

  Para parear o tablet, escaneie o QR abaixo ou abra o link:
  http://192.168.1.20:3000/?token=XXXX-XXXX-XXXX-XXXX

  █▀▀▀▀▀█ ▄▀█▄▀ █▀▀▀▀▀█
  █ ███ █ ▀▄█ ▄ █ ███ █
  ...
```

**Escaneie o QR com o tablet** e pronto — o token fica guardado no
navegador, você não digita de novo. Sem câmera? O token foi feito para ser
digitável (sem letras ambíguas, e maiúscula/minúscula e hífen não importam):
a página pede ele numa tela de pareamento.

O token fica em `config/token.json` (ignorado pelo Git). Para trocar, apague
esse arquivo e reinicie — ou fixe um valor seu em `STREAM_DECK_TOKEN` no
`.env`.

### A tela de configuração é mais restrita

Montar botões é o mesmo que decidir quais programas o deck pode abrir, então
**por padrão a tela de configuração só responde no próprio PC** (127.0.0.1),
mesmo com token válido. Para configurar também pelo tablet:

```
CONFIG_REMOTO=true
```

### Até onde isso protege

O tráfego é HTTP puro na rede local, sem TLS. O token impede que outro
aparelho da rede use o seu deck — que é o risco real numa casa. Ele **não**
protege contra alguém capaz de capturar o tráfego da própria rede, e nada
disso torna seguro expor a porta à internet. Continue sem fazer port
forwarding.

## Controle de mídia (Windows via WSL2)

A integração `media` (play/pause, próxima/anterior faixa, mute, volume)
precisa executar ações no **Windows**, mesmo rodando o servidor dentro do
WSL2. Isso é feito via **interop do WSL2**: o Node chama o `powershell.exe`
do Windows (disponível automaticamente dentro do WSL, sem instalar nada) e
esse PowerShell manipula o volume master e envia teclas de mídia virtuais
usando a API do próprio Windows — sem depender de utilitários externos como
o `nircmd`.

O script fica em `scripts/windows-media.ps1`. O caminho é convertido
automaticamente de caminho WSL para caminho Windows (`wslpath -w`) antes de
chamar o PowerShell.

A abstração está em `server/integrations/media/`:
- `windows.js` sabe *como* chamar o `powershell.exe`, em dois modos:
  - `wsl` — servidor rodando dentro do WSL2, chama o Windows via interop.
  - `nativo` — servidor rodando direto no Windows, chama o PowerShell local.
- `index.js` decide qual modo usar (variável `MEDIA_BACKEND` no `.env`,
  padrão `auto`: detecta `win32` → nativo, ou `WSL_DISTRO_NAME` definida →
  wsl).

Se um dia você rodar o servidor nativamente no Windows (fora do WSL), não
precisa mudar nada além de garantir `MEDIA_BACKEND=auto` (ou `windows`) — a
mesma abstração cuida da diferença.

## Atalhos: apps, sites, jogos e janelas

As páginas **Sistema** e **Atalhos** usam a integração
`server/integrations/atalhos/` (script `scripts/windows-atalhos.ps1`), que
funciona pelo mesmo interop WSL2 → Windows do controle de mídia.

**Sistema** — atalhos de teclado e janelas: print (`Win+Shift+S`), bloquear,
área de trabalho, snap ⬅/➡, área de transferência (`Win+V`) e **Janelas**
(seletor que lista as janelas abertas para você tocar e ir direto). Se você
usa múltiplos monitores, há botões de mover janela entre telas comentados
no config, prontos para descomentar.

**Atalhos** — abre programas, sites e jogos. Cada botão usa uma destas ações:

| Ação | Parâmetros | Para que serve |
|------|------------|----------------|
| `abrirApp` | `caminho` | Executável, comando no PATH (`code`, `wt`) ou atalho `.lnk` |
| `abrirUwp` | `appId` | Apps da Store/MSIX que não têm `.exe` (ex.: Claude Desktop) |
| `abrirUrl` | `url`, `navegador` (opcional) | Abre um site; sem `navegador`, usa o padrão do Windows |
| `abrirJogo` | `appId` | Dá play num jogo da Steam via `steam://rungameid/` |

Dicas para montar os seus:

- **Prefira o atalho `.lnk` do Menu Iniciar** ao `.exe` direto para apps que
  se auto-atualizam (Spotify, Obsidian, Blitz criam pastas com número de
  versão que muda a cada update, quebrando um caminho fixo). Eles ficam em
  `C:\Users\SEU_USUARIO\AppData\Roaming\Microsoft\Windows\Start Menu\Programs`
  ou `C:\ProgramData\Microsoft\Windows\Start Menu\Programs`.
- **Apps da Store/MSIX** não têm `.exe` chamável. Descubra o AppUserModelID
  com `Get-StartApps | Where-Object { $_.Name -like '*NomeDoApp*' }` no
  PowerShell e use `abrirUwp`.
- **Jogos da Steam**: o botão "Jogar…" lista sozinho tudo que está
  instalado, lendo os `appmanifest_*.acf` de todas as bibliotecas (inclusive
  as em outros discos). Não precisa cadastrar jogo por jogo.
- **Navegador específico**: passe o caminho do `.exe` em `navegador` — útil
  para separar contextos (ex.: painéis de rede num navegador, faculdade em
  outro).

## Configurar as integrações (aba Integrações)

**O jeito recomendado, e o único que quem recebe o `.exe` precisa conhecer:**
abra `http://127.0.0.1:3000/config/#integracoes` (ou o botão **🔌 Integrações**
na tela de configuração, ou o atalho na tela de boas-vindas).

Ali cada integração diz o que precisa, com o passo a passo de onde tirar cada
credencial. **Salvar já vale na hora** — as credenciais vão para o `.env` e a
integração se reconecta sozinha, sem reiniciar o servidor.

Detalhes que valem saber:

- **Nada de segredo volta para o navegador.** Campos de senha mostram só se
  estão preenchidos ou não; para trocar, digite por cima, e para apagar existe
  o link "apagar" ao lado do campo.
- **O `.env` continua editável à mão** e é a mesma fonte de verdade — a tela
  reescreve só a linha da chave alterada e preserva os comentários do arquivo.
- **Só grava chaves que a integração declarou** no getter `configuracao`. Um
  PUT tentando escrever `PATH` ou `STREAM_DECK_TOKEN` é recusado.
- Como o resto da tela de configuração, responde **só no próprio PC** (veja
  `CONFIG_REMOTO`).

As seções abaixo descrevem o que fazer do lado do OBS/Spotify — a parte que
acontece fora deste app.

## Habilitar o OBS

1. No OBS Studio (28+), vá em **Ferramentas → WebSocket Server Settings**.
2. Marque **Enable WebSocket server**, defina uma senha (recomendado) e
   confira a porta (padrão `4455`).
3. Na aba **Integrações** da tela de configuração, preencha endereço, porta e
   senha, e salve. (Se preferir arquivo: `OBS_WEBSOCKET_HOST`,
   `OBS_WEBSOCKET_PORT` e `OBS_WEBSOCKET_PASSWORD` no `.env`.)
4. Em `config/pages.config.json`, ajuste os botões da página "OBS":
   - `parametros.cena` de cada botão de cena deve bater **exatamente** com
     o nome da cena no seu OBS.
   - `parametros.entrada` do botão de mic deve bater com o nome da fonte de
     áudio (ex.: "Mic/Aux"). Alternativamente, defina
     `OBS_MIC_INPUT_NAME=NomeDaSuaEntrada` no `.env` — é o nome usado para
     decidir qual mudança de mute reflete no botão de mic.
5. A cena ativa fica destacada, o botão de mic fica
   vermelho quando mutado, e o botão de gravação pulsa em vermelho enquanto
   grava — tudo isso chega em tempo real pelo WebSocket, então funciona
   mesmo se você trocar de cena pelo próprio OBS (não só pelo tablet).

## Habilitar o Spotify

Exige **conta Premium** — é limitação da API do Spotify, não deste app. A
integração dá play/pause, faixa anterior/próxima, volume só do Spotify e o
"now playing" (música/artista) ao vivo, atualizado a cada 5s.

Tudo pela aba **Integrações**, sem editar arquivo nem reiniciar:

1. Crie um app em <https://developer.spotify.com/dashboard> ("Create app").
   Nome e descrição podem ser qualquer coisa.
2. Em **Redirect URIs**, cole exatamente o endereço que a tela de
   configuração mostra — algo como `http://127.0.0.1:3000/spotify/callback`,
   com a sua porta. Precisa bater **caractere por caractere**. Use
   `127.0.0.1`, não `localhost`: o Spotify não aceita mais `http://localhost`
   como URI "segura" — só `https://` ou o IP de loopback literal.
3. Marque **Web API** e salve.
4. Copie **Client ID** e **Client Secret** para os campos da aba Integrações
   e clique em **Salvar**.
5. Clique em **Conectar ao Spotify**. Você autoriza no site do Spotify e
   volta; o refresh token é obtido, **gravado e aplicado sozinho**.

O passo 5 precisa acontecer no navegador **do PC**, não do tablet: o endereço
de retorno é o `127.0.0.1` cadastrado no passo 2.

**Importante:** os botões de play/pause/próxima/anterior só funcionam se
houver um **dispositivo Spotify ativo** no momento (o app do Spotify aberto
e tocando ou pausado em algum lugar — PC, celular, alto-falante). Sem
dispositivo ativo, a Web API do Spotify recusa os comandos; o erro que
aparece no tablet ("verifique se há um dispositivo ativo") é exatamente
isso.

O refresh token não expira por tempo, mas pode ser revogado se você trocar
sua senha do Spotify ou remover o acesso do app manualmente — se isso
acontecer, clique em **Reconectar ao Spotify** na aba Integrações.

## Habilitar o Discord

Mudo do microfone, surdo (mudo total) e câmera. **Funciona por atalho global
de teclado**, não pela API do Discord — e isso tem consequências que vale
entender antes de configurar.

### Por que atalho de teclado

O Discord tem um canal local (RPC, por named pipe) com um comando
`SET_VOICE_SETTINGS` que faria exatamente isto e ainda devolveria o estado
atual, permitindo o botão acender sozinho. O problema é o acesso: o escopo
`rpc` vale só para o dono do app e uma lista de até 50 testadores até a
Discord aprovar o app manualmente. Funcionaria para quem criasse um app no
portal de desenvolvedores — e para mais ninguém.

Como este projeto é distribuído como um `.exe` para quem não vai criar app
nenhum, o atalho global ganha: funciona para todo mundo, hoje, sem cadastro
e sem dependência nova.

**O preço:** os botões de Discord **não acendem**. O Discord não conta para
ninguém se você está mudo, então não há estado para refletir. Você aperta e
alterna, sem confirmação visual no deck.

### Configurar: nada, na maioria dos casos

Já vem apontando para os atalhos **padrão do Discord** — `CTRL+SHIFT+M` para
o microfone, `CTRL+SHIFT+D` para o áudio, `ALT+↑/↓` para canais, e assim por
diante. Funciona sem você configurar nada.

### As duas telas de atalho do Discord (a parte que confunde)

O Discord tem duas, e elas fazem coisas diferentes:

| Tela | O que é | Funciona com o Discord em segundo plano? |
|---|---|---|
| **Atalhos de teclado** | Lista dos atalhos embutidos. **Só de leitura** — não dá para editar | **Não.** Só com o Discord em foco |
| **Teclas de Atalho** | Onde você **cria** os seus | **Sim** |

Como o padrão são os embutidos, cada ação **traz o Discord para frente antes
de mandar a tecla**. O efeito colateral é perder o foco do que estiver aberto
— um jogo, por exemplo.

Se isso incomodar: crie os seus em **Teclas de Atalho**, informe-os na aba
Integrações e desligue **"Trazer o Discord para frente antes"**. Aí nada
rouba o foco.

### O seletor "Ir para…"

Um botão que lista canais e servidores e leva você direto a eles. Por baixo
ele usa o **Quick Switcher** do Discord (`CTRL+K`): foca o Discord, digita o
nome e confirma.

Os nomes vêm de **"Ir para (canais e servidores)"** na aba Integrações,
separados por vírgula (ex.: `Geral, Bate-papo, Estudos`). Precisam ser
digitados por você porque listar os canais de verdade exigiria um bot dentro
de cada servidor — e permissão de administrador para colocá-lo lá, o que
ninguém tem nos servidores dos outros.

Vale para canais de texto e de voz; num canal de voz, confirmar entra na
chamada.

### E "transmitir" (Go Live)?

Não dá, e não é limitação deste projeto: o Discord **não expõe o Go Live**
nem por API nem por tecla de atalho — só pelo botão na interface. Pedidos
por uma API de Go Live existem há anos e seguem sem resposta. Se algum dia
o Discord adicionar um atalho de teclado para isso, o botão passa a ser
possível com a ação genérica **Enviar atalho de teclado** (integração
`atalhos`), sem precisar de código novo.

## Casa inteligente com Home Assistant

**Uma integração que cobre qualquer marca.** O Home Assistant fala com Tuya
(Positivo, Intelbras, Multilaser…), Hue, Sonoff, Shelly, Xiaomi, Zigbee,
Z-Wave e centenas de outras, e expõe uma API única. O deck fala só com ele —
então dispositivo novo de marca nova funciona **sem código novo aqui**.

### É gratuito?

Sim, e sem pegadinha: **Apache 2.0, sem assinatura, sem taxa por
dispositivo**. Roda na sua casa e é seu.

O único produto pago é o **Nabu Casa** (~US$ 6,50/mês), que serve para
acessar sua casa **de fora** sem mexer no roteador. Para este projeto ele é
**desnecessário** — o deck e o Home Assistant estão na mesma rede.

### Instalar no Raspberry Pi (junto com Pi-hole e Uptime Kuma)

Se o Pi já roda Docker, é um `docker-compose.yml`:

```yaml
services:
  homeassistant:
    container_name: homeassistant
    image: ghcr.io/home-assistant/home-assistant:stable
    volumes:
      - ./config:/config
      - /run/dbus:/run/dbus:ro
    restart: unless-stopped
    # network_mode: host é praticamente obrigatório: a descoberta automática
    # de dispositivos usa mDNS/broadcast, que não atravessa a rede isolada
    # de um container.
    network_mode: host
```

`docker compose up -d` e abra `http://IP-DO-PI:8123`.

**Consumo:** cerca de 1 GB de RAM e pouca CPU em repouso (sobe ao iniciar e
ao rodar automações). Reserve ~5 GB de disco — o banco de histórico cresce
com o tempo; dá para limitar com `recorder:` no `configuration.yaml`.

### Conectar ao deck

1. No Home Assistant, clique no seu usuário (canto inferior esquerdo) e
   role até o fim.
2. Em **Tokens de acesso de longa duração**, crie um token e copie
   (ele só aparece uma vez).
3. Na aba **Integrações** do deck, informe o endereço
   (`http://IP-DO-PI:8123`) e o token, e salve.

Os botões passam a acender conforme o estado real: apagar a luz pelo
interruptor da parede apaga o botão no tablet, porque o estado chega por
WebSocket.

### Posso distribuir meu deck com essa integração?

Pode — a integração vai no código e não carrega segredo nenhum. Mas note:
**cada pessoa precisa do próprio Home Assistant e do próprio token**, e os
`entity_id` dos botões (`light.sala`) são os *dela*, não os seus. Ao exportar
seu layout, ou tire os botões de casa, ou avise que precisam ser reapontados.

Detalhes de quais marcas exigem o quê: **[docs/casa-inteligente.md](docs/casa-inteligente.md)**.

## Philips Hue (esqueleto antigo)

Módulo estruturado em `server/integrations/hue/index.js`, com as chamadas
HTTP ainda por escrever. **Foi superado pelo Home Assistant**, que cobre Hue
junto com todo o resto — só faz sentido implementá-lo se você quiser falar
com a bridge sem um Home Assistant no meio.

1. Descubra o IP da sua bridge Hue (app oficial Philips Hue, ou
   <https://discovery.meethue.com/>).
2. Aperte o **botão físico** da bridge e, nos 30s seguintes, gere uma
   *application key* fazendo um `POST` para `https://<IP-da-bridge>/api`
   com corpo `{"devicetype":"stream-deck-web"}`.
3. Preencha `HUE_BRIDGE_IP` e `HUE_APPLICATION_KEY` no `.env`.
4. Implemente os `TODO`s em `server/integrations/hue/index.js` usando a
   CLIP API v2 (`https://<bridge>/clip/v2/resource/grouped_light/...`).

## Editar páginas e botões

### Pela tela de configuração (recomendado)

Abra **`http://localhost:3000/config/`** — ou toque na engrenagem ⚙️ no canto
do deck. Dá para criar, editar, reordenar e remover páginas e botões sem
tocar em arquivo nenhum:

- Escolha a integração e a ação numa lista, e os campos de parâmetro
  aparecem sozinhos (o caminho do programa, a URL, o nome da cena…).
  Integração indisponível aparece marcada, com o motivo.
- Botão pode virar **macro** (várias ações num toque) com um clique.
- Ícone sai de uma paleta de emojis testados, ou você cola o seu.
- Ao salvar, **o tablet se atualiza sozinho** — nada de reiniciar servidor.
  Se algo estiver errado, a tela lista os problemas e não grava nada.

A primeira vez que você salvar, o seu `config/pages.config.json` é criado a
partir do exemplo. A versão anterior fica sempre guardada em
`config/pages.config.backup.json`.

### Pelo arquivo

O layout fica em **dois arquivos**, no mesmo esquema do `.env`/`.env.example`:

| Arquivo | Vai pro Git? | O que é |
|---------|--------------|---------|
| `config/pages.config.example.json` | ✅ sim | Exemplo com placeholders — ponto de partida e referência |
| `config/pages.config.json` | ❌ não | O **seu** layout real (caminhos da máquina, IPs da LAN, nomes de cena) |

Na primeira vez:

```bash
cp config/pages.config.example.json config/pages.config.json
```

Depois edite só o `pages.config.json`. O servidor usa ele quando existe e cai
no exemplo quando não — então um clone novo do repositório já sobe
funcionando, sem configurar nada.


Cada página tem um `id`, `titulo`, `icone` e uma lista de `botoes`. Cada
botão referencia uma integração (`media`, `atalhos`, `obs`, `spotify` ou
`hue`) e o nome de uma ação exposta por ela — veja os comentários no topo do
arquivo para a lista completa de campos (`estadoChave` para refletir estado
ao vivo, `tipo: 'slider'` para controles deslizantes, `tipo: 'lista'` para
seletores, etc).

Um botão também pode ser uma **macro**: em vez de `integracao`/`acao`, use
`acoes` com uma lista de passos executados em sequência num toque só —
por exemplo, abrir o jogo e o overlay juntos:

```js
{
  id: 'atalhos.lol',
  titulo: 'LoL + Blitz',
  icone: '🎮',
  acoes: [
    { integracao: 'atalhos', acao: 'abrirApp', parametros: { caminho: '...League of Legends.lnk' } },
    { integracao: 'atalhos', acao: 'abrirApp', parametros: { caminho: '...Blitz.lnk' } },
  ],
}
```

Depois de editar, é só salvar — se estiver com `npm run dev`, o servidor
recarrega sozinho.

## Gerar o executável (.exe)

Para usar no dia a dia ou passar para outra pessoa, dá para empacotar tudo
num executável único de Windows — **quem for usar não precisa de Node, nem
de WSL, nem de instalar nada**:

```bash
npm run build
```

Sai um `build/stream-deck-web.exe` (~90 MB — a maior parte é o próprio Node
embutido). O build roda tanto do WSL quanto do Windows: ele baixa o
`node.exe` do Windows e injeta o app dentro.

### Como usar o executável

Copie o `.exe` para uma pasta onde você possa gravar e execute. **Na
primeira vez, ele abre sozinho no navegador uma tela de boas-vindas** com:

- confirmação de que está rodando;
- o **QR code** para parear o tablet (aponta a câmera e pronto);
- o **token** em letras grandes, com botão de copiar, caso não dê para escanear;
- atalhos para abrir o deck e a tela de configuração.

Essa tela fica sempre em **`http://127.0.0.1:3000/bemvindo/`** — abra quando
precisar do token de novo. Ela só responde no próprio PC: como mostra o
token, não pode ficar acessível pela rede.

Nas execuções seguintes ela não abre sozinha (senão apareceria uma aba a
cada vez que você liga o PC). Para mudar isso, use `ABRIR_NAVEGADOR` no
`.env`: `primeira` (padrão), `sempre` ou `nunca`.

### Rodando em segundo plano

**A janela preta pode ser fechada.** O executável se solta do console e
continua rodando — o processo que você clicou é só um lançador: ele confere
se já não há uma instância no ar, sobe o servidor destacado, imprime o
token/QR e sai.

- **Para encerrar**, use o botão **Encerrar servidor** na tela de
  boas-vindas (ou `taskkill /IM stream-deck-web.exe /F`).
- **Os logs** vão para `dados/stream-deck.log`, já que não há console para
  escrever. O arquivo é zerado quando passa de 512 KB.
- **Clicar duas vezes no `.exe` com ele já rodando** não sobe uma segunda
  cópia: abre a tela de boas-vindas da instância existente.
- **Para acompanhar na tela** (diagnóstico), rode
  `stream-deck-web.exe --console`, ou ponha `SEGUNDO_PLANO=false` no `.env`.

Rodando do código-fonte (`npm start` / `npm run dev`) nada disso se aplica: o
console continua sendo o lugar dos logs.

Junto do `.exe` é criada uma pasta `dados/`:

```
stream-deck-web.exe
dados/
├── .env                  # porta, credenciais de OBS/Spotify/Hue
├── config/
│   ├── pages.config.json # seu layout (criado ao salvar pela primeira vez)
│   └── token.json        # token de acesso
├── public/               # a interface
└── scripts/              # os scripts do PowerShell
```

`public/` e `scripts/` são reescritos toda vez que ele sobe, para nunca
ficarem defasados em relação ao executável. Já `config/` e `.env` **nunca
são sobrescritos** — são seus. Para atualizar de versão, troque só o `.exe`
e mantenha a pasta `dados/`.

### Iniciar junto com o Windows

Aperte `Win + R`, digite `shell:startup` e coloque ali um atalho para o
`.exe`.

### Avisos que podem aparecer

O executável não é assinado digitalmente, então o Windows pode mostrar um
aviso do SmartScreen na primeira execução (**Mais informações → Executar
assim mesmo**). Assinar exigiria um certificado pago.

## Estrutura de pastas

```
stream-deck-web/
├── config/
│   ├── pages.config.example.json  # template inicial versionado (vai no .exe)
│   └── pages.config.json          # SEU layout real — gitignored, edite aqui
├── docs/
│   ├── acoes.md                    # GERADO por npm run docs — todas as ações
│   ├── guia-primeiro-acesso.html   # fonte do guia (edite este)
│   └── Guia-Stream-Deck-Web.pdf    # GERADO por npm run docs:pdf
├── scripts/
│   ├── windows-media.ps1     # volume e mute do Windows (P/Invoke)
│   ├── windows-atalhos.ps1   # atalhos de teclado, abrir apps/sites, janelas, Steam
│   ├── build.js              # gera o executável do Windows (npm run build)
│   ├── gerar-docs.js         # gera docs/acoes.md a partir do catálogo
│   └── gerar-pdf.js          # gera o PDF do guia (Chrome headless)
├── server/
│   ├── index.js               # bootstrap: Express + WebSocket + integrações
│   ├── config-store.js        # lê, valida, grava e recarrega o config
│   ├── lib/
│   │   ├── caminhos.js       # resolve caminhos (código-fonte vs empacotado)
│   │   ├── segundo-plano.js  # relança o .exe destacado do console
│   │   ├── catalogo-ui.js    # tipos de botão e estilos (editor + doc gerada)
│   │   ├── qr.js             # QR em SVG para a tela de boas-vindas
│   │   ├── rede.js           # descobre o IP da máquina na LAN
│   │   ├── token.js          # token de acesso
│   │   ├── auth.js           # middlewares de token e restrição local
│   │   └── powershell-interop.js  # chama powershell.exe (WSL2 ou nativo), compartilhado
│   ├── routes/
│   │   ├── actions.js          # POST /action/:id — dispatcher genérico
│   │   ├── bemvindo.js         # GET /api/bemvindo e o encerrar do servidor
│   │   ├── spotify-auth.js     # /spotify/login e /spotify/callback (OAuth, uma vez)
│   │   └── atalhos.js          # GET /atalhos/janelas e /atalhos/jogos (listas dos seletores)
│   └── integrations/
│       ├── media/             # volume e mute do Windows
│       ├── atalhos/            # atalhos de sistema, abrir apps/sites/jogos, janelas
│       ├── obs/                # cenas, mic, gravação (obs-websocket-js)
│       ├── spotify/            # play/pause, faixas, volume, now playing (Web API)
│       └── hue/                 # estruturado, aguardando credenciais
├── public/                     # frontend estático (PWA)
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js                   # service worker (instalação/offline do shell)
│   ├── css/style.css
│   ├── js/app.js               # renderiza a grade, dispara ações, aplica estado
│   ├── js/ws-client.js         # conexão WebSocket com reconexão automática
│   ├── config/                 # tela de configuração (editor de páginas/botões)
│   ├── bemvindo/               # tela de boas-vindas (status, token, QR)
│   └── icons/
├── .env.example                 # copie para .env e preencha
└── package.json
```

## Scripts npm

| Comando         | O que faz                                            |
|-----------------|-------------------------------------------------------|
| `npm start`     | Sobe o servidor uma vez (produção)                    |
| `npm run dev`   | Sobe com `nodemon`, reiniciando a cada alteração      |
| `npm run build` | Gera `build/stream-deck-web.exe` para Windows         |
| `npm run docs`  | Regenera `docs/acoes.md` a partir do catálogo das integrações |
| `npm run docs:pdf` | Regenera o guia em PDF a partir de `docs/guia-primeiro-acesso.html` |

`npm run docs` deve ser rodado sempre que uma ação for adicionada ou tiver
rótulo/parâmetros alterados — o arquivo é gerado, não escrito à mão. O
`docs:pdf` usa o Chrome (ou Edge/Brave) já instalado no Windows em modo
headless; sem nenhum deles, dá para abrir o HTML e usar "Imprimir → Salvar
como PDF".

## Solução de problemas

- **Botões de mídia não fazem nada / erro no console do servidor**
  Confirme que `powershell.exe` está acessível de dentro do WSL:
  `which powershell.exe` deve apontar para algo em `/mnt/c/...`. Isso exige
  que o **interop do WSL** esteja habilitado (é o padrão).

- **OBS não conecta**
  Confira se o WebSocket Server está habilitado no OBS (Ferramentas →
  WebSocket Server Settings) e se a porta/senha no `.env` batem. Não precisa
  abrir o OBS antes do servidor: a integração reconecta sozinha, com espera
  crescente (5s, 10s, 20s… até 1 min), então abrir o OBS depois basta.
  O aviso de "OBS não encontrado" sai **uma vez só** — as tentativas
  seguintes são silenciosas, para não encher o log de quem não usa OBS.
  Quem não usa pode desligar de vez com `OBS_HABILITADO=false` no `.env`.

- **Tablet não consegue abrir a página**
  Revise a seção [Acessar do tablet](#acessar-do-tablet-rede--importante-no-wsl2).
  Confirme que tablet e PC estão na mesma rede Wi-Fi (não em redes de
  convidados isoladas) e que o Firewall do Windows não está bloqueando a
  porta.

- **Quero mudar a porta**
  Edite `PORT` no `.env`. Lembre de ajustar as regras de portproxy/firewall
  (Opção B) se estiver usando esse modo.
