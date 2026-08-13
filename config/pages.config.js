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
//   tipo         "botao" (padrão) ou "slider"
//   integracao   nome da pasta em server/integrations (media | obs | spotify | hue)
//   acao         nome do método exposto pela integração (veja server/integrations/*/index.js)
//   parametros   objeto opcional repassado como argumento para a ação
//   estadoChave  caminho (dot notation) dentro do estado ao vivo usado para destacar
//                o botão (ex.: cena ativa, mic mutado, gravando, volume atual)
//   estiloEstado dica visual de como reagir ao estado: "destaque" | "perigo" | "gravando"
//   min / max    usados apenas em botões do tipo "slider"
// -----------------------------------------------------------------------------

module.exports = {
  paginas: [
    {
      id: 'midia',
      titulo: 'Mídia',
      icone: '🎵',
      botoes: [
        {
          id: 'midia.play_pause',
          titulo: 'Play / Pause',
          icone: '⏯️',
          integracao: 'media',
          acao: 'playPause',
        },
        {
          id: 'midia.anterior',
          titulo: 'Anterior',
          icone: '⏮️',
          integracao: 'media',
          acao: 'faixaAnterior',
        },
        {
          id: 'midia.proxima',
          titulo: 'Próxima',
          icone: '⏭️',
          integracao: 'media',
          acao: 'proximaFaixa',
        },
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
          id: 'midia.volume_baixar',
          titulo: 'Vol −',
          icone: '🔉',
          integracao: 'media',
          acao: 'diminuirVolume',
        },
        {
          id: 'midia.volume_subir',
          titulo: 'Vol +',
          icone: '🔊',
          integracao: 'media',
          acao: 'aumentarVolume',
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
        // Spotify e Hue vêm estruturados mas desativados até você configurar o .env — veja o README.
        {
          id: 'spotify.play_pause',
          titulo: 'Spotify',
          icone: '🎧',
          integracao: 'spotify',
          acao: 'playPause',
        },
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
