// -----------------------------------------------------------------------------
// Configuração das páginas e botões do Stream Deck.
//
// Edite este arquivo para adicionar, remover ou reorganizar botões — não é
// necessário mexer no código do servidor (server/) nem do frontend (public/).
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
//                ou "dispositivo" (abre uma lista de opções buscada em
//                GET /spotify/dispositivos e manda a escolha como parametros.dispositivoId)
//   integracao   nome da pasta em server/integrations (media | obs | spotify | hue)
//   acao         nome do método exposto pela integração (veja server/integrations/*/index.js)
//   parametros   objeto opcional repassado como argumento para a ação
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
          tipo: 'dispositivo',
          integracao: 'spotify',
          acao: 'transferirReproducao',
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
  ],
};
