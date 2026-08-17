# O que dá para colocar num botão

> Arquivo gerado automaticamente por `npm run docs` a partir do que cada integração declara. Não edite à mão — a próxima geração desfaz.

Cada botão do deck dispara uma **ação** de uma **integração**. Esta é a lista completa do que existe hoje, com os parâmetros que cada ação aceita. Você monta tudo isso pela tela de configuração (`http://127.0.0.1:3000/config/`), sem editar arquivo nenhum — a tabela abaixo é para consulta.

## Tipos de botão

| Tipo | Para que serve |
| --- | --- |
| Botão | Toca e dispara uma ação. |
| Slider | Controle deslizante, para volume e afins. |
| Mostrador | Só exibe informação ao vivo, não dispara nada. |
| Seletor | Abre uma lista de opções para escolher. |

## Destaques

A cor que o botão assume quando está "ligado":

| Estilo | Aparência |
| --- | --- |
| `destaque` | Destaque (verde) |
| `perigo` | Alerta (vermelho) |
| `gravando` | Gravando (vermelho pulsante) |

## Macros: várias ações num toque

Um botão não precisa fazer só uma coisa. Na tela de configuração dá para adicionar vários passos, executados em sequência num toque só — por exemplo abrir o jogo e o Discord de uma vez, ou trocar a cena do OBS e começar a gravar.

## Mídia do Windows

Nas configurações do botão, esta é a integração **media**.

**Precisa de:** Nada. Funciona assim que o programa abre, no Windows.

### Ações

| Ação | O que faz | Parâmetros |
| --- | --- | --- |
| `playPause` | Play / Pause | — |
| `faixaAnterior` | Faixa anterior | — |
| `proximaFaixa` | Próxima faixa | — |
| `alternarMudo` | Alternar mudo | — |
| `aumentarVolume` | Aumentar volume | — |
| `diminuirVolume` | Diminuir volume | — |
| `definirVolume` | Definir volume | `valor` (numero) — Volume (0–100) |

### Informações ao vivo

Servem para o botão acender sozinho (campo **Acende quando**) ou para mostrar texto num botão do tipo Mostrador.

| Chave | O que é | Tipo |
| --- | --- | --- |
| `media.volume` | Volume do Windows (0–100) | numero |
| `media.mudo` | Windows está mudo | booleano |

## OBS Studio

Nas configurações do botão, esta é a integração **obs**.

**Precisa de:** OBS Studio aberto, com **Ferramentas > WebSocket Server Settings > Enable WebSocket server** ligado.

### Ações

| Ação | O que faz | Parâmetros |
| --- | --- | --- |
| `trocarCena` | Trocar de cena | `cena` (texto, obrigatório) — Nome da cena _Precisa bater exatamente com o nome da cena no OBS._ |
| `alternarMicMudo` | Alternar mudo do microfone | `entrada` (texto) — Nome da fonte de áudio _Em branco usa OBS_MIC_INPUT_NAME do .env (padrão: Mic/Aux)._ |
| `alternarGravacao` | Iniciar / parar gravação | — |

### Informações ao vivo

Servem para o botão acender sozinho (campo **Acende quando**) ou para mostrar texto num botão do tipo Mostrador.

| Chave | O que é | Tipo |
| --- | --- | --- |
| `obs.cenaAtual` | Cena ativa | texto |
| `obs.micMudo` | Microfone mudo | booleano |
| `obs.gravando` | Gravando | booleano |
| `obs.conectado` | OBS conectado | booleano |

## Spotify

Nas configurações do botão, esta é a integração **spotify**.

**Precisa de:** Conta Spotify **Premium** e as chaves `SPOTIFY_*` no `.env` — veja "Habilitar o Spotify" no README.

### Ações

| Ação | O que faz | Parâmetros |
| --- | --- | --- |
| `playPause` | Play / Pause | — |
| `proximaFaixa` | Próxima faixa | — |
| `faixaAnterior` | Faixa anterior | — |
| `definirVolume` | Definir volume do Spotify | `valor` (numero) — Volume (0–100) |
| `transferirReproducao` | Tocar em outro dispositivo | `dispositivoId` (texto) — ID do dispositivo |

### Informações ao vivo

Servem para o botão acender sozinho (campo **Acende quando**) ou para mostrar texto num botão do tipo Mostrador.

| Chave | O que é | Tipo |
| --- | --- | --- |
| `spotify.tocando` | Está tocando | booleano |
| `spotify.musica` | Música atual | texto |
| `spotify.artista` | Artista atual | texto |
| `spotify.dispositivo` | Dispositivo tocando | texto |
| `spotify.volume` | Volume do Spotify (0–100) | numero |
| `spotify.conectado` | Spotify conectado | booleano |

## Philips Hue

Nas configurações do botão, esta é a integração **hue**.

**Precisa de:** Bridge Philips Hue na rede e as chaves `HUE_*` no `.env`. **A integração ainda é um esqueleto** — os botões existem, mas as chamadas à bridge não estão implementadas.

### Ações

| Ação | O que faz | Parâmetros |
| --- | --- | --- |
| `alternarLuz` | Acender / apagar luz | `grupo` (texto, obrigatório) — Nome do grupo de luzes |

## Atalhos e programas do Windows

Nas configurações do botão, esta é a integração **atalhos**.

**Precisa de:** Nada. Funciona assim que o programa abre, no Windows.

### Ações

| Ação | O que faz | Parâmetros |
| --- | --- | --- |
| `print` | Captura de tela (Win+Shift+S) | — |
| `bloquear` | Bloquear o PC | — |
| `areaTrabalho` | Mostrar área de trabalho | — |
| `snapEsquerda` | Encaixar janela à esquerda | — |
| `snapDireita` | Encaixar janela à direita | — |
| `areaTransferencia` | Área de transferência (Win+V) | — |
| `moverMonitorEsquerda` | Mover janela para o monitor da esquerda | — |
| `moverMonitorDireita` | Mover janela para o monitor da direita | — |
| `enviarTeclas` | Enviar atalho de teclado | `combo` (texto, obrigatório) — Combinação de teclas _Ex.: CTRL+SHIFT+M. Vale CTRL, SHIFT, ALT, WIN, letras, números, F1–F24 e teclas como ENTER, ESC, TAB, setas._ |
| `focarProcesso` | Trazer um programa para frente | `processo` (texto, obrigatório) — Nome do processo _Sem o .exe (ex.: Discord, vivaldi, Code). Falha se o programa não estiver aberto._ |
| `digitarTexto` | Digitar um texto | `texto` (texto, obrigatório) — Texto _Digitado na janela que estiver em foco. Combine com "Trazer um programa para frente" numa macro._ |
| `abrirApp` | Abrir programa | `caminho` (texto, obrigatório) — Caminho, comando ou atalho .lnk _Prefira o .lnk do Menu Iniciar para apps que se auto-atualizam. Comandos no PATH também valem (ex.: code, wt)._<br />`argumentos` (texto) — Argumentos (opcional) _Passados na linha de comando, para programas que precisam deles._ |
| `abrirUwp` | Abrir app da Store (MSIX) | `appId` (texto, obrigatório) — AppUserModelID _Descubra com: Get-StartApps | Where-Object { $_.Name -like '*Nome*' }_ |
| `abrirUrl` | Abrir site | `url` (texto, obrigatório) — Endereço<br />`navegador` (texto) — Navegador específico (opcional) _Caminho do .exe. Em branco, abre no navegador padrão do Windows — prefira assim se for compartilhar seu deck com alguém, senão o botão quebra em quem não tiver esse navegador instalado._ |
| `abrirJogo` | Abrir jogo da Steam | `appId` (texto) — AppID na Steam |
| `focarJanela` | Ir para uma janela | `handle` (texto) — Identificador da janela |

## Discord

Nas configurações do botão, esta é a integração **discord**.

**Precisa de:** Discord aberto, com os atalhos globais cadastrados em **Configurações do Usuário > Teclas de Atalho** e as mesmas teclas informadas na aba Integrações. Os botões não acendem: o Discord não informa se você está mudo.

### Ações

| Ação | O que faz | Parâmetros |
| --- | --- | --- |
| `alternarMudo` | Ativar/desativar microfone | — |
| `alternarSurdo` | Ativar/desativar áudio (surdo) | — |
| `abrirDiscord` | Abrir o Discord | — |
| `canalAnterior` | Canal anterior (na lista) | — |
| `canalProximo` | Próximo canal (na lista) | — |
| `atenderChamada` | Atender chamada | — |
| `recusarChamada` | Recusar chamada | — |
| `painelSom` | Alternar painel de som | — |
| `servidorAnterior` | Servidor anterior | — |
| `servidorProximo` | Próximo servidor | — |
| `ligacaoAtual` | Ir para a ligação atual | — |
| `abrirBusca` | Abrir a busca do Discord | — |
| `irPara` | Ir para um canal ou servidor | `destino` (texto) — Nome do canal ou servidor |

## Home Assistant

Nas configurações do botão, esta é a integração **homeassistant**.

**Precisa de:** Um Home Assistant rodando na sua rede e um token de acesso de longa duração. Cobre qualquer marca que o Home Assistant suporte — veja docs/casa-inteligente.md.

### Ações

| Ação | O que faz | Parâmetros |
| --- | --- | --- |
| `alternar` | Ligar / desligar (alternar) | `entidade` (texto, obrigatório) — Entidade _Ex.: light.sala. Use o seletor de entidades para descobrir os nomes._ |
| `ligar` | Ligar | `entidade` (texto, obrigatório) — Entidade _Ex.: light.sala. Use o seletor de entidades para descobrir os nomes._ |
| `desligar` | Desligar | `entidade` (texto, obrigatório) — Entidade _Ex.: light.sala. Use o seletor de entidades para descobrir os nomes._ |
| `definirBrilho` | Definir brilho da luz | `entidade` (texto, obrigatório) — Entidade _Ex.: light.sala. Use o seletor de entidades para descobrir os nomes._<br />`valor` (numero) — Brilho (0–100) |
| `ativarCena` | Ativar cena | `entidade` (texto, obrigatório) — Cena _Ex.: scene.noite_ |

### Informações ao vivo

Servem para o botão acender sozinho (campo **Acende quando**) ou para mostrar texto num botão do tipo Mostrador.

| Chave | O que é | Tipo |
| --- | --- | --- |
| `homeassistant.conectado` | Home Assistant conectado | booleano |
