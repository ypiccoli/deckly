// -----------------------------------------------------------------------------
// EXEMPLO da configuração das páginas e botões do Stream Deck.
//
// Este arquivo é versionado no Git e serve de ponto de partida e referência.
// Copie para `config/pages.config.js` (que é ignorado pelo Git) e ajuste com
// os seus caminhos, IPs e nomes de cena — é esse arquivo pessoal que o
// servidor usa quando existe:
//
//     cp config/pages.config.example.js config/pages.config.js
//
// Os valores marcados como SEU_USUARIO, IP-DO-SEU-SERVIDOR e
// portal.suafaculdade.edu.br são placeholders: troque pelos seus.
//
// Edite para adicionar, remover ou reorganizar botões — não é necessário
// mexer no código do servidor (server/) nem do frontend (public/).
//
// Cada botão tem:
//   id           identificador único, usado em POST /action/:id
//   titulo       rótulo curto mostrado no botão
//   icone        emoji (ou texto curto) mostrado no botão
//   iconeAtivo / tituloAtivo
//                emoji/texto alternativo mostrado quando estadoChave é truthy
//                (ex.: play/pause do Spotify troca o texto conforme está tocando ou não,
//                mantendo o mesmo ícone dos outros botões de Spotify)
//   tipo         "botao" (padrão), "slider", "info" (mostrador somente leitura)
//                ou "lista" (seletor: busca as opções por GET em "fonte" e manda
//                a escolha para a ação como parametros.opcaoId)
//   fonte        usado apenas em botões do tipo "lista": endpoint que responde
//                { ok, opcoes: [{ id, nome, detalhe, ativo }] }
//   iconeItem / mensagemVazia
//                usados apenas em botões do tipo "lista": ícone padrão de cada
//                item do seletor e texto mostrado quando a lista vem vazia
//   integracao   nome da pasta em server/integrations (media | atalhos | obs | spotify | hue)
//   acao         nome do método exposto pela integração (veja server/integrations/*/index.js)
//   parametros   objeto opcional repassado como argumento para a ação
//   acoes        alternativa a integracao/acao/parametros: lista de passos
//                { integracao, acao, parametros } executados em sequência num
//                toque só (macro). Ex.: abrir o jogo e o overlay juntos.
//   estadoChave  caminho (dot notation) dentro do estado ao vivo usado para destacar
//                o botão (ex.: cena ativa, mic mutado, gravando, volume atual)
//   estiloEstado dica visual de como reagir ao estado: "destaque" | "perigo" | "gravando"
//   min / max    usados apenas em botões do tipo "slider"
//   estadoTexto / estadoTextoSecundario / estadoTextoTerciario
//                usados apenas em botões do tipo "info": caminhos (dot notation)
//                para as linhas de texto mostradas (ex.: now playing)
// -----------------------------------------------------------------------------

module.exports = {
  paginas: [
    {
      id: 'midia',
      titulo: 'Mídia',
      icone: '🎵',
      botoes: [
        {
          id: 'midia.mute',
          titulo: 'Mudo',
          icone: '🔇',
          integracao: 'media',
          acao: 'alternarMudo',
          estadoChave: 'media.mudo',
          estiloEstado: 'perigo',
        },
        {
          id: 'spotify.now_playing',
          // Posicionado cedo no array (perto do topo da grade) de propósito —
          // é a última coisa que deveria acabar cortada por scroll.
          titulo: 'Tocando agora',
          icone: '🎵',
          tipo: 'info',
          estadoChave: 'spotify.tocando',
          estadoTexto: 'spotify.musica',
          estadoTextoSecundario: 'spotify.artista',
          estadoTextoTerciario: 'spotify.dispositivo',
          estiloEstado: 'destaque',
        },
        {
          id: 'midia.volume_slider',
          titulo: 'Volume',
          icone: '🎚️',
          tipo: 'slider',
          min: 0,
          max: 100,
          integracao: 'media',
          acao: 'definirVolume',
          estadoChave: 'media.volume',
        },
        {
          id: 'spotify.volume_slider',
          titulo: 'Volume Spotify',
          icone: '🎧',
          tipo: 'slider',
          min: 0,
          max: 100,
          integracao: 'spotify',
          acao: 'definirVolume',
          estadoChave: 'spotify.volume',
        },
        {
          id: 'spotify.anterior',
          titulo: 'Spotify ⏮',
          icone: '🎧',
          integracao: 'spotify',
          acao: 'faixaAnterior',
        },
        {
          id: 'spotify.play_pause',
          // Mesmo ícone dos outros botões de Spotify (🎧); quem muda é o texto,
          // igual ao "Spotify ⏮"/"Spotify ⏭" — "titulo" quando parado,
          // "tituloAtivo" quando estadoChave (spotify.tocando) é truthy.
          titulo: 'Spotify ▶',
          tituloAtivo: 'Spotify ⏸',
          icone: '🎧',
          integracao: 'spotify',
          acao: 'playPause',
          estadoChave: 'spotify.tocando',
          estiloEstado: 'destaque',
        },
        {
          id: 'spotify.proxima',
          titulo: 'Spotify ⏭',
          icone: '🎧',
          integracao: 'spotify',
          acao: 'proximaFaixa',
        },
        {
          id: 'spotify.tocar_em',
          titulo: 'Tocar em…',
          icone: '📡',
          tipo: 'lista',
          fonte: '/spotify/dispositivos',
          mensagemVazia: 'Nenhum dispositivo Spotify ativo. Abra o Spotify em algum aparelho e tente de novo.',
          integracao: 'spotify',
          acao: 'transferirReproducao',
        },
      ],
    },
    {
      id: 'atalhos',
      titulo: 'Atalhos',
      icone: '🚀',
      botoes: [
        // --- Programas ---------------------------------------------------
        // Vários apontam para o atalho (.lnk) do Menu Iniciar em vez do .exe
        // direto: o .lnk continua válido quando o app se atualiza e troca a
        // pasta de versão (Spotify, Obsidian e Blitz fazem isso).
        {
          id: 'atalhos.spotify',
          titulo: 'Spotify',
          icone: '🎧',
          integracao: 'atalhos',
          acao: 'abrirApp',
          parametros: {
            caminho: 'C:\\Users\\SEU_USUARIO\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Spotify.lnk',
          },
        },
        {
          id: 'atalhos.claude',
          titulo: 'Claude',
          icone: '🤖',
          integracao: 'atalhos',
          // O Claude Desktop é um app empacotado (MSIX/Store): não tem .exe
          // chamável direto, abre pelo AppUserModelID.
          acao: 'abrirUwp',
          parametros: { appId: 'Claude_pzs8sxrjxfjjc!Claude' },
        },
        {
          id: 'atalhos.obsidian',
          titulo: 'Obsidian',
          icone: '🗒️',
          integracao: 'atalhos',
          acao: 'abrirApp',
          parametros: {
            caminho: 'C:\\Users\\SEU_USUARIO\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Obsidian.lnk',
          },
        },
        {
          id: 'atalhos.mobaxterm',
          titulo: 'MobaXterm',
          icone: '🖧',
          integracao: 'atalhos',
          acao: 'abrirApp',
          parametros: {
            caminho: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\MobaXterm\\MobaXterm.lnk',
          },
        },
        {
          id: 'atalhos.vscode',
          titulo: 'VS Code',
          icone: '💻',
          integracao: 'atalhos',
          acao: 'abrirApp',
          parametros: { caminho: 'code' },
        },
        {
          id: 'atalhos.terminal',
          titulo: 'Terminal',
          icone: '⌨️',
          integracao: 'atalhos',
          acao: 'abrirApp',
          parametros: { caminho: 'wt' },
        },

        // --- Jogos -------------------------------------------------------
        {
          // Macro: um toque abre o jogo e o overlay juntos. Ver "acoes" (no
          // plural) nos comentários do topo deste arquivo.
          id: 'atalhos.lol',
          titulo: 'LoL + Blitz',
          icone: '🎮',
          acoes: [
            {
              integracao: 'atalhos',
              acao: 'abrirApp',
              parametros: {
                caminho: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Riot Games\\League of Legends.lnk',
              },
            },
            {
              integracao: 'atalhos',
              acao: 'abrirApp',
              parametros: {
                caminho: 'C:\\Users\\SEU_USUARIO\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Blitz.lnk',
              },
            },
          ],
        },
        {
          id: 'atalhos.steam',
          titulo: 'Steam',
          icone: '🕹️',
          integracao: 'atalhos',
          acao: 'abrirApp',
          parametros: { caminho: 'C:\\Program Files (x86)\\Steam\\steam.exe' },
        },
        {
          // Lista os jogos instalados lendo os appmanifest_*.acf de todas as
          // bibliotecas da Steam (inclusive as em outros discos) — tocar no
          // nome dá play direto via steam://rungameid/<appid>.
          id: 'atalhos.jogos_steam',
          titulo: 'Jogar…',
          icone: '🎯',
          tipo: 'lista',
          fonte: '/atalhos/jogos',
          iconeItem: '🎮',
          mensagemVazia: 'Nenhum jogo instalado encontrado na Steam.',
          integracao: 'atalhos',
          acao: 'abrirJogo',
        },

        // --- Páginas -----------------------------------------------------
        // "navegador" é opcional: sem ele abre no navegador padrão. Aqui é
        // usado para forçar Vivaldi (Home Lab) e Zen (faculdade).
        {
          id: 'atalhos.uptime_kuma',
          titulo: 'Uptime Kuma',
          icone: '📈',
          integracao: 'atalhos',
          acao: 'abrirUrl',
          parametros: {
            url: 'http://IP-DO-SEU-SERVIDOR:3001',
            navegador: 'C:\\Users\\SEU_USUARIO\\AppData\\Local\\Vivaldi\\Application\\vivaldi.exe',
          },
        },
        {
          id: 'atalhos.pihole',
          titulo: 'Pi-hole',
          icone: '🛡️',
          integracao: 'atalhos',
          acao: 'abrirUrl',
          parametros: {
            url: 'http://IP-DO-SEU-SERVIDOR/admin',
            navegador: 'C:\\Users\\SEU_USUARIO\\AppData\\Local\\Vivaldi\\Application\\vivaldi.exe',
          },
        },
        {
          id: 'atalhos.faculdade',
          titulo: 'Faculdade',
          icone: '🎓',
          integracao: 'atalhos',
          acao: 'abrirUrl',
          parametros: {
            url: 'https://portal.suafaculdade.edu.br/',
            navegador: 'C:\\Program Files\\Zen Browser\\zen.exe',
          },
        },
      ],
    },
    {
      id: 'sistema',
      titulo: 'Sistema',
      icone: '🖥️',
      botoes: [
        {
          id: 'sistema.print',
          titulo: 'Print',
          icone: '📸',
          integracao: 'atalhos',
          acao: 'print',
        },
        {
          id: 'sistema.bloquear',
          titulo: 'Bloquear',
          icone: '🔒',
          integracao: 'atalhos',
          acao: 'bloquear',
        },
        {
          id: 'sistema.area_trabalho',
          titulo: 'Área de Trabalho',
          icone: '🖥️',
          integracao: 'atalhos',
          acao: 'areaTrabalho',
        },
        {
          id: 'sistema.snap_esquerda',
          titulo: 'Snap ⬅',
          icone: '◧',
          integracao: 'atalhos',
          acao: 'snapEsquerda',
        },
        {
          id: 'sistema.snap_direita',
          titulo: 'Snap ➡',
          icone: '◨',
          integracao: 'atalhos',
          acao: 'snapDireita',
        },
        {
          // Antes era um Alt+Tab simulado, mas o seletor do Windows não dá
          // para navegar pelo toque (ficava aberto esperando o teclado).
          // Um seletor próprio com a lista de janelas resolve melhor: toca
          // no nome e vai direto para a janela.
          id: 'sistema.janelas',
          titulo: 'Janelas',
          icone: '🪟',
          tipo: 'lista',
          fonte: '/atalhos/janelas',
          iconeItem: '🪟',
          mensagemVazia: 'Nenhuma janela aberta no momento.',
          integracao: 'atalhos',
          acao: 'focarJanela',
        },
        {
          id: 'sistema.clipboard',
          titulo: 'Área de Transferência',
          icone: '📋',
          integracao: 'atalhos',
          acao: 'areaTransferencia',
        },
        // Se você usa múltiplos monitores, descomente pra mover a janela ativa entre telas:
        // {
        //   id: 'sistema.mover_monitor_esquerda',
        //   titulo: 'Monitor ⬅',
        //   icone: '🖵',
        //   integracao: 'atalhos',
        //   acao: 'moverMonitorEsquerda',
        // },
        // {
        //   id: 'sistema.mover_monitor_direita',
        //   titulo: 'Monitor ➡',
        //   icone: '🖵',
        //   integracao: 'atalhos',
        //   acao: 'moverMonitorDireita',
        // },
      ],
    },
    {
      id: 'casa',
      titulo: 'Casa',
      icone: '💡',
      botoes: [
        // Hue vem estruturado mas desativado até você configurar o .env — veja o README.
        {
          id: 'hue.sala_toggle',
          titulo: 'Luz Sala',
          icone: '💡',
          integracao: 'hue',
          acao: 'alternarLuz',
          parametros: { grupo: 'Sala' },
          estadoChave: 'hue.sala.ligada',
          estiloEstado: 'destaque',
        },
        {
          id: 'hue.quarto_toggle',
          titulo: 'Luz Quarto',
          icone: '💡',
          integracao: 'hue',
          acao: 'alternarLuz',
          parametros: { grupo: 'Quarto' },
          estadoChave: 'hue.quarto.ligada',
          estiloEstado: 'destaque',
        },
      ],
    },
    {
      id: 'obs',
      titulo: 'OBS',
      icone: '🎥',
      botoes: [
        // Ajuste "parametros.cena" para os nomes exatos das cenas configuradas no seu OBS.
        {
          id: 'obs.cena_inicio',
          titulo: 'Início',
          icone: '🏠',
          integracao: 'obs',
          acao: 'trocarCena',
          parametros: { cena: 'Início' },
          estadoChave: 'obs.cenaAtual',
          estadoComparar: 'cena',
          estiloEstado: 'destaque',
        },
        {
          id: 'obs.cena_jogo',
          titulo: 'Jogo',
          icone: '🎮',
          integracao: 'obs',
          acao: 'trocarCena',
          parametros: { cena: 'Jogo' },
          estadoChave: 'obs.cenaAtual',
          estadoComparar: 'cena',
          estiloEstado: 'destaque',
        },
        {
          id: 'obs.cena_camera',
          titulo: 'Câmera',
          icone: '📷',
          integracao: 'obs',
          acao: 'trocarCena',
          parametros: { cena: 'Câmera' },
          estadoChave: 'obs.cenaAtual',
          estadoComparar: 'cena',
          estiloEstado: 'destaque',
        },
        {
          id: 'obs.mic_mute',
          titulo: 'Mic',
          icone: '🎙️',
          integracao: 'obs',
          acao: 'alternarMicMudo',
          // Ajuste "parametros.entrada" para o nome exato da fonte de áudio no seu OBS.
          parametros: { entrada: 'Mic/Aux' },
          estadoChave: 'obs.micMudo',
          estiloEstado: 'perigo',
        },
        {
          id: 'obs.gravar',
          titulo: 'Gravar',
          icone: '⏺️',
          integracao: 'obs',
          acao: 'alternarGravacao',
          estadoChave: 'obs.gravando',
          estiloEstado: 'gravando',
        },
      ],
    },
  ],
};
