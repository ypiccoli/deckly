// Integração com o Discord: mudo do microfone, surdo (mute total) e vídeo.
//
// POR QUE VIA ATALHO DE TECLADO, E NÃO PELA API
//
// O Discord tem um canal local de verdade (RPC, por named pipe), com um
// comando SET_VOICE_SETTINGS que faria exatamente isto e ainda devolveria o
// estado atual — daria para o botão acender sozinho. O problema é o acesso:
// o escopo `rpc` só vale para o dono do app e uma lista de até 50 testadores
// até a Discord aprovar o app manualmente. Ou seja, funcionaria para quem
// criasse o app no portal de desenvolvedores, e para mais ninguém — o
// oposto do que este projeto precisa, já que ele é distribuído como um .exe
// para quem não vai criar app nenhum.
//
// Atalho global de teclado funciona para todo mundo, hoje, sem cadastro,
// sem dependência nova e sem o Discord em foco. O preço é não ter estado: o
// Discord não conta para ninguém se está mudo, então os botões não acendem.
// É uma troca consciente — melhor um botão que funciona sem acender do que
// um que acende só para uma pessoa.
//
// COMO O DISCORD SE COMPORTA AQUI
//
// Os atalhos NÃO vêm configurados de fábrica: é preciso abrir
// Configurações do Usuário > Teclas de Atalho e criar cada um. Os valores
// padrão abaixo são só sugestões — o que vale é o que estiver cadastrado lá
// e aqui ao mesmo tempo.
//
// "Transmitir" (Go Live) não está aqui de propósito: o Discord não expõe
// isso nem por API nem por tecla de atalho — só pelo botão na interface.
// Veja o README.

const EventEmitter = require('events');
const atalhos = require('../atalhos');

// Sugestões que não conflitam com atalhos comuns do Windows.
const PADROES = {
  DISCORD_TECLA_MUDO: 'CTRL+SHIFT+F1',
  DISCORD_TECLA_SURDO: 'CTRL+SHIFT+F2',
  DISCORD_TECLA_VIDEO: 'CTRL+SHIFT+F3',
};

class IntegracaoDiscord extends EventEmitter {
  constructor() {
    super();
    this.nome = 'discord';
    // Sem estado ao vivo — veja o comentário no topo. Fica como objeto vazio
    // (e não ausente) porque o servidor espelha `.estado` de todo mundo.
    this.estado = {};
  }

  _combo(chave) {
    return process.env[chave] || PADROES[chave];
  }

  _enviar(chave) {
    const combo = this._combo(chave);
    if (!combo) throw new Error(`Atalho ${chave} não configurado.`);
    return atalhos.acoes.enviarTeclas({ combo });
  }

  get configuracao() {
    return {
      rotulo: 'Discord',
      resumo: 'Mudo do microfone, surdo e câmera — por atalho de teclado.',
      aviso:
        'O Discord não deixa outro programa mudar isso diretamente, então usamos os ' +
        'atalhos globais dele. Você precisa cadastrar as mesmas teclas no Discord, ' +
        'senão os botões não fazem nada. Por isso também não dá para o botão acender ' +
        'quando você está mudo: o Discord não informa esse estado.',
      comoObter: [
        'No Discord: Configurações do Usuário (engrenagem) > Teclas de Atalho.',
        'Clique em "Gravar Atalho", escolha a ação (ex.: "Alternar Mudo") e aperte a combinação.',
        'Repita para cada ação que você quiser usar.',
        'Confira abaixo se as teclas aqui são exatamente as mesmas que você cadastrou lá.',
      ],
      campos: [
        {
          env: 'DISCORD_TECLA_MUDO',
          rotulo: 'Atalho de "Alternar Mudo"',
          tipo: 'texto',
          padrao: PADROES.DISCORD_TECLA_MUDO,
          ajuda: 'Silencia só o seu microfone.',
        },
        {
          env: 'DISCORD_TECLA_SURDO',
          rotulo: 'Atalho de "Alternar Surdo"',
          tipo: 'texto',
          padrao: PADROES.DISCORD_TECLA_SURDO,
          ajuda: 'Mudo total: você para de ouvir e de ser ouvido.',
        },
        {
          env: 'DISCORD_TECLA_VIDEO',
          rotulo: 'Atalho de "Alternar Câmera"',
          tipo: 'texto',
          padrao: PADROES.DISCORD_TECLA_VIDEO,
          ajuda: 'Liga e desliga a sua câmera na chamada.',
        },
      ],
    };
  }

  // Nada a reconectar — as teclas são lidas do .env a cada uso. Existe só
  // para a tela de configuração não precisar tratar o caso de não existir.
  async reconfigurar() {}

  get catalogo() {
    const disponivel = Boolean(atalhos.catalogo.disponivel);
    return {
      rotulo: 'Discord',
      disponivel,
      motivoIndisponivel: disponivel
        ? null
        : 'Depende dos atalhos do Windows, que só funcionam no Windows ou no WSL2.',
      // Sem estados: o Discord não expõe se você está mudo. Os botões deste
      // grupo não acendem, e é esperado.
      estados: [],
      acoes: {
        alternarMudo: { rotulo: 'Alternar mudo do microfone', parametros: [] },
        alternarSurdo: { rotulo: 'Alternar surdo (mudo total)', parametros: [] },
        alternarVideo: { rotulo: 'Alternar câmera', parametros: [] },
      },
    };
  }

  get acoes() {
    return {
      alternarMudo: () => this._enviar('DISCORD_TECLA_MUDO'),
      alternarSurdo: () => this._enviar('DISCORD_TECLA_SURDO'),
      alternarVideo: () => this._enviar('DISCORD_TECLA_VIDEO'),
    };
  }
}

module.exports = new IntegracaoDiscord();
