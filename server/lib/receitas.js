// Receitas: "quero um botão que faz X" já montado.
//
// O catálogo (o getter `catalogo` de cada integração) responde "a ação Trocar
// de cena pede o campo Nome da cena". Ele NÃO responde "quero um botão que
// abre o jogo e o Discord juntos" — para isso a pessoa precisa escolher
// sozinha a integração, a ação, o tipo de botão, os parâmetros, o
// `estadoChave` e o estilo de destaque. Cinco decisões que o catálogo lista
// mas não conecta. Uma receita é justamente essa conexão: um botão pronto,
// que entra no deck preenchido e só pede o ajuste que é pessoal (o nome da
// sua cena, o caminho do seu programa, o seu entity_id).
//
// POR QUE UMA LISTA CURADA, E NÃO UM GETTER POR INTEGRAÇÃO (como o catálogo):
// receita é conteúdo editorial, não projeção mecânica do código. Adicionar
// uma ação nova não deveria inventar uma receita. E as receitas mais úteis
// são MACROS QUE CRUZAM INTEGRAÇÕES (abrir o jogo *e* o Discord), que nenhum
// getter de integração isolada conseguiria declarar.
//
// Tem dois consumidores, e é por isso que mora aqui e não numa rota — mesmo
// motivo do `catalogo-ui.js` ao lado: `GET /api/catalogo` (a galeria "Botão
// pronto" da tela de configuração) e `scripts/gerar-docs.js` (a seção de
// receitas do guia em PDF e do acoes.md). Duplicar seria o jeito garantido de
// a doc mentir sobre o app.
//
// Cada receita:
//   id       identificador estável (usado só para chaves de UI)
//   titulo   o objetivo, na língua de quem usa ("Trocar para uma cena do OBS")
//   resumo   uma frase dizendo o que o botão faz
//   precisa  integrações envolvidas — resolve o selo de disponibilidade
//   ajuste   o que sobra para a pessoa fazer depois de inserir (ou null)
//   nota     exigência fora do comum (ex.: só no modo RPC do Discord)
//   rotulos  opcional: nome de ação em português para quando ela não estiver
//            no catálogo do momento — o guia em PDF é gerado num modo só, e
//            ele não pode mostrar `entrarNoCanal` para quem não programa
//   botao    um botão do schema do config, SEM `id` (gerado na inserção)

const RECEITAS = [
  /* ---------------- funcionam sem configurar nada ---------------- */

  {
    id: 'abrir-programa',
    titulo: 'Abrir um programa',
    resumo: 'Um toque abre o programa que você escolher.',
    precisa: ['atalhos'],
    ajuste:
      'Troque o caminho pelo do seu programa. Para apps que se atualizam sozinhos ' +
      '(navegadores, Spotify), prefira o atalho .lnk do Menu Iniciar — ele continua ' +
      'valendo depois da atualização.',
    botao: {
      titulo: 'Bloco de Notas',
      icone: '🗒️',
      integracao: 'atalhos',
      acao: 'abrirApp',
      parametros: { caminho: 'notepad' },
    },
  },

  {
    id: 'abrir-site',
    titulo: 'Abrir um site',
    resumo: 'Abre um endereço no navegador padrão do Windows.',
    precisa: ['atalhos'],
    ajuste: 'Troque o endereço. Deixe o navegador em branco: assim o botão funciona em qualquer PC.',
    botao: {
      titulo: 'YouTube',
      icone: '🌐',
      integracao: 'atalhos',
      acao: 'abrirUrl',
      parametros: { url: 'https://www.youtube.com' },
    },
  },

  {
    id: 'atalho-teclado',
    titulo: 'Enviar um atalho de teclado',
    resumo: 'Manda uma combinação de teclas para a janela que estiver na frente.',
    precisa: ['atalhos'],
    ajuste:
      'Troque a combinação pela que você quer. Valem CTRL, SHIFT, ALT, WIN, letras, ' +
      'números, F1–F24 e teclas como ENTER, ESC, TAB e as setas.',
    botao: {
      titulo: 'Colar',
      icone: '⌨️',
      integracao: 'atalhos',
      acao: 'enviarTeclas',
      parametros: { combo: 'CTRL+V' },
    },
  },

  {
    id: 'texto-pronto',
    titulo: 'Digitar um texto pronto',
    resumo: 'Traz o programa para frente e digita o texto nele — dois passos num toque só.',
    precisa: ['atalhos'],
    ajuste:
      'Troque o processo e o texto. Os dois passos andam juntos de propósito: sem ' +
      'trazer o programa para frente, o texto iria parar na janela que estivesse na frente.',
    botao: {
      titulo: 'Assinatura',
      icone: '📝',
      acoes: [
        { integracao: 'atalhos', acao: 'focarProcesso', parametros: { processo: 'notepad' } },
        { integracao: 'atalhos', acao: 'digitarTexto', parametros: { texto: 'Abraço, Fulano' } },
      ],
    },
  },

  {
    id: 'saida-audio',
    titulo: 'Trocar a saída de áudio',
    resumo: 'Abre a lista dos seus fones e caixas e troca a saída padrão do Windows.',
    precisa: ['media'],
    ajuste: null,
    botao: {
      titulo: 'Saída',
      icone: '🔈',
      tipo: 'lista',
      fonte: '/media/saidas',
      iconeItem: '🔈',
      mensagemVazia: 'Nenhuma saída de áudio ativa encontrada.',
      integracao: 'media',
      acao: 'definirSaida',
      estadoChave: 'media.saida',
    },
  },

  {
    id: 'mudo-windows',
    titulo: 'Mudo do Windows que acende',
    resumo: 'Corta o som do PC — e o botão fica vermelho enquanto estiver mudo.',
    precisa: ['media'],
    ajuste: null,
    botao: {
      titulo: 'Mudo',
      icone: '🔇',
      integracao: 'media',
      acao: 'alternarMudo',
      estadoChave: 'media.mudo',
      estiloEstado: 'perigo',
    },
  },

  {
    id: 'jogo-e-discord',
    titulo: 'Abrir o jogo e o Discord juntos',
    resumo: 'Escolhe um jogo da sua Steam, abre e já traz o Discord junto.',
    precisa: ['atalhos', 'discord'],
    ajuste:
      'O seletor lista os jogos instalados na Steam sozinho — nada a preencher. ' +
      'O Discord abre no mesmo toque.',
    botao: {
      titulo: 'Jogar…',
      icone: '🎮',
      tipo: 'lista',
      fonte: '/atalhos/jogos',
      iconeItem: '🎮',
      mensagemVazia: 'Nenhum jogo instalado encontrado na Steam.',
      acoes: [
        { integracao: 'atalhos', acao: 'abrirJogo' },
        { integracao: 'discord', acao: 'abrirDiscord' },
      ],
    },
  },

  /* ---------------- OBS ---------------- */

  {
    id: 'obs-cena',
    titulo: 'Trocar para uma cena do OBS',
    resumo: 'Um botão por cena. Ele acende sozinho quando aquela cena está no ar.',
    precisa: ['obs'],
    ajuste:
      'Troque "Live" pelo nome exato da cena no seu OBS — precisa bater letra por letra. ' +
      'Duplique o botão para cada cena: todos usam a mesma chave de estado e só acende o da cena no ar.',
    botao: {
      titulo: 'Live',
      icone: '🎬',
      integracao: 'obs',
      acao: 'trocarCena',
      parametros: { cena: 'Live' },
      estadoChave: 'obs.cenaAtual',
      estadoComparar: 'cena',
      estiloEstado: 'destaque',
    },
  },

  {
    id: 'obs-no-ar',
    titulo: 'Ir ao ar: trocar de cena e começar a gravar',
    resumo: 'Um toque põe a cena Live no ar e começa a gravação.',
    precisa: ['obs'],
    ajuste: 'Troque "Live" pelo nome da sua cena de transmissão.',
    botao: {
      titulo: 'No ar',
      icone: '🔴',
      acoes: [
        { integracao: 'obs', acao: 'trocarCena', parametros: { cena: 'Live' } },
        { integracao: 'obs', acao: 'alternarGravacao' },
      ],
      estadoChave: 'obs.gravando',
      estiloEstado: 'gravando',
    },
  },

  {
    id: 'obs-mic',
    titulo: 'Mudo do microfone no OBS',
    resumo: 'Corta o seu microfone no OBS. Fica vermelho enquanto estiver mudo.',
    precisa: ['obs'],
    ajuste:
      'Em branco, ele usa a fonte de áudio padrão do OBS (Mic/Aux). Só preencha se o ' +
      'seu microfone tiver outro nome na lista de fontes.',
    botao: {
      titulo: 'Mic',
      icone: '🎙️',
      integracao: 'obs',
      acao: 'alternarMicMudo',
      estadoChave: 'obs.micMudo',
      estiloEstado: 'perigo',
    },
  },

  {
    id: 'obs-gravar',
    titulo: 'Gravar, com aviso pulsando',
    resumo: 'Começa e para a gravação. Enquanto grava, o botão pulsa em vermelho.',
    precisa: ['obs'],
    ajuste: null,
    botao: {
      titulo: 'Gravar',
      icone: '⏺️',
      integracao: 'obs',
      acao: 'alternarGravacao',
      estadoChave: 'obs.gravando',
      estiloEstado: 'gravando',
    },
  },

  /* ---------------- Spotify ---------------- */

  {
    id: 'spotify-tocando',
    titulo: 'Mostrador do que está tocando',
    resumo: 'Não é um botão de apertar: mostra música, artista e onde está tocando.',
    precisa: ['spotify'],
    ajuste: 'Nada a preencher. Ele ocupa duas células por duas — arraste no ✏️ se quiser outro tamanho.',
    botao: {
      titulo: 'Tocando agora',
      icone: '🎵',
      tipo: 'info',
      estadoChave: 'spotify.tocando',
      estadoTexto: 'spotify.musica',
      estadoTextoSecundario: 'spotify.artista',
      estadoTextoTerciario: 'spotify.dispositivo',
      estiloEstado: 'destaque',
      textoVazio: 'Nada tocando',
      largura: 2,
      altura: 2,
    },
  },

  {
    id: 'spotify-volume',
    titulo: 'Volume só do Spotify',
    resumo: 'Uma barra que mexe no volume do Spotify sem tocar no volume do PC.',
    precisa: ['spotify'],
    ajuste: null,
    botao: {
      titulo: 'Spotify',
      icone: '🎚️',
      tipo: 'slider',
      min: 0,
      max: 100,
      integracao: 'spotify',
      acao: 'definirVolume',
      estadoChave: 'spotify.volume',
    },
  },

  {
    id: 'spotify-dispositivo',
    titulo: 'Tocar em outro aparelho',
    resumo: 'Lista onde o Spotify pode tocar (PC, celular, caixa) e joga a música para lá.',
    precisa: ['spotify'],
    ajuste: null,
    botao: {
      titulo: 'Tocar em…',
      icone: '📡',
      tipo: 'lista',
      fonte: '/spotify/dispositivos',
      mensagemVazia: 'Nenhum dispositivo Spotify ativo. Abra o Spotify em algum aparelho e tente de novo.',
      integracao: 'spotify',
      acao: 'transferirReproducao',
    },
  },

  /* ---------------- casa inteligente ---------------- */

  {
    id: 'casa-luz',
    titulo: 'Ligar e desligar uma luz',
    resumo: 'Acende e apaga. O botão acende junto com a luz — até quando alguém usa o interruptor da parede.',
    precisa: ['homeassistant'],
    ajuste:
      'Duas coisas: troque a entidade pela sua (o campo abre a lista dos seus dispositivos) ' +
      'e escolha a mesma em "Acende quando" — é o que faz o botão refletir a luz de verdade.',
    botao: {
      titulo: 'Luz',
      icone: '💡',
      integracao: 'homeassistant',
      acao: 'alternar',
      parametros: { entidade: 'light.sala' },
      estiloEstado: 'destaque',
    },
  },

  {
    id: 'casa-brilho',
    titulo: 'Barra de brilho da luz',
    resumo: 'Uma barra que escurece e clareia a lâmpada.',
    precisa: ['homeassistant'],
    ajuste: 'Troque a entidade pela sua lâmpada.',
    botao: {
      titulo: 'Brilho',
      icone: '🔆',
      tipo: 'slider',
      min: 0,
      max: 100,
      integracao: 'homeassistant',
      acao: 'definirBrilho',
      parametros: { entidade: 'light.sala' },
    },
  },

  {
    id: 'casa-cor',
    titulo: 'Seletor de cor da luz',
    resumo: 'Abre uma paleta e pinta a lâmpada com a cor escolhida.',
    precisa: ['homeassistant'],
    ajuste: 'Troque a entidade pela sua lâmpada. As cores da lista já vêm prontas.',
    botao: {
      titulo: 'Cor',
      icone: '🎨',
      tipo: 'lista',
      fonte: '/homeassistant/cores',
      mensagemVazia: 'Sem cores',
      integracao: 'homeassistant',
      acao: 'definirCor',
      parametros: { entidade: 'light.sala' },
      largura: 2,
    },
  },

  {
    id: 'casa-ir',
    titulo: 'Ligar o ar pelo controle remoto',
    resumo: 'Manda um código infravermelho pelo controle universal — ar, TV, ventilador.',
    precisa: ['homeassistant'],
    ajuste:
      'Troque a entidade do controle e o nome do comando pelos que você ensinou a ele. ' +
      'O aparelho é o apelido usado no aprendizado (em branco, vale "ar").',
    botao: {
      titulo: 'Ar',
      icone: '❄️',
      integracao: 'homeassistant',
      acao: 'enviarComando',
      parametros: { entidade: 'remote.controle_universal', aparelho: 'ar', comando: 'ligar' },
    },
  },

  /* ---------------- Discord ---------------- */

  {
    id: 'discord-mudo',
    titulo: 'Mudo no Discord',
    resumo: 'Corta o seu microfone no Discord.',
    precisa: ['discord'],
    ajuste:
      'No modo padrão (teclado), confira em Integrações se a tecla informada é a mesma ' +
      'cadastrada no Discord. No modo RPC não há nada a preencher, e o botão ainda acende.',
    botao: {
      titulo: 'Mudo',
      icone: '🎙️',
      integracao: 'discord',
      acao: 'alternarMudo',
      estadoChave: 'discord.mudo',
      estiloEstado: 'perigo',
    },
  },

  {
    id: 'discord-canais',
    titulo: 'Entrar num canal de voz',
    resumo: 'Lista os canais de voz dos seus servidores e entra no que você tocar.',
    precisa: ['discord'],
    nota: 'Só existe no modo RPC do Discord (aba Integrações). No modo padrão, o Discord não conta quais são os seus canais.',
    // Esta ação só está no catálogo em modo RPC, e a doc é gerada num modo só.
    rotulos: { entrarNoCanal: 'Entrar num canal de voz' },
    ajuste: 'Nada a preencher — a lista vem do seu próprio Discord.',
    botao: {
      titulo: 'Canais',
      icone: '🔊',
      tipo: 'lista',
      fonte: '/discord/canais',
      iconeItem: '🔊',
      mensagemVazia: 'Nenhum canal de voz encontrado. O Discord está aberto e o RPC conectado?',
      integracao: 'discord',
      acao: 'entrarNoCanal',
    },
  },
];

// Os passos de um botão, seja ele simples ou macro — mesma normalização que o
// `routes/actions.js` faz para executar.
function passosDe(botao) {
  if (Array.isArray(botao.acoes)) return botao.acoes;
  if (!botao.integracao) return [];
  return [{ integracao: botao.integracao, acao: botao.acao, parametros: botao.parametros }];
}

// Confere as receitas contra os catálogos ao vivo. Devolve uma lista de
// problemas em texto — não lança, porque quem chama decide o que é fatal.
//
// "ação não existe" NÃO é necessariamente erro: o catálogo do Discord muda
// conforme DISCORD_MODO, então uma receita de RPC some legitimamente do
// catálogo em modo teclado. Por isso o problema vem marcado com `tipo`.
function validar(catalogos) {
  const problemas = [];

  for (const receita of RECEITAS) {
    const onde = `receita "${receita.id}"`;

    for (const nome of receita.precisa || []) {
      if (!catalogos[nome]) {
        problemas.push({ tipo: 'integracao', receita: receita.id, texto: `${onde}: integração "${nome}" não existe.` });
      }
    }

    for (const passo of passosDe(receita.botao)) {
      const catalogo = catalogos[passo.integracao];
      if (!catalogo) {
        problemas.push({
          tipo: 'integracao',
          receita: receita.id,
          texto: `${onde}: integração "${passo.integracao}" não existe.`,
        });
        continue;
      }
      if (!(receita.precisa || []).includes(passo.integracao)) {
        problemas.push({
          tipo: 'integracao',
          receita: receita.id,
          texto: `${onde}: usa a integração "${passo.integracao}" mas não a declara em "precisa".`,
        });
      }
      const acao = (catalogo.acoes || {})[passo.acao];
      if (!acao) {
        problemas.push({
          tipo: 'acao',
          receita: receita.id,
          texto: `${onde}: a ação "${passo.integracao}.${passo.acao}" não está no catálogo atual.`,
        });
        continue;
      }
      // Parâmetro obrigatório só pode faltar quando a escolha vem do seletor:
      // num botão do tipo lista o valor chega no toque, não do config.
      if (receita.botao.tipo === 'lista') continue;
      for (const parametro of acao.parametros || []) {
        if (!parametro.obrigatorio) continue;
        if ((passo.parametros || {})[parametro.nome] == null) {
          problemas.push({
            tipo: 'parametro',
            receita: receita.id,
            texto: `${onde}: falta o parâmetro obrigatório "${parametro.nome}" de "${passo.acao}".`,
          });
        }
      }
    }
  }

  return problemas;
}

// Resolve cada receita contra os catálogos ao vivo, para a galeria da tela de
// configuração poder mostrar o estado real de cada uma. É a rota
// GET /api/catalogo que chama isto.
function paraCatalogo(catalogos) {
  return RECEITAS.map((receita) => {
    // A ação existe? (o modo do Discord muda o catálogo dele) Sem ela, inserir
    // criaria um botão que o validar() do config-store recusaria no Salvar.
    const existe = passosDe(receita.botao).every(
      (passo) => catalogos[passo.integracao] && (catalogos[passo.integracao].acoes || {})[passo.acao],
    );

    // A frase de indisponível é da própria integração — inventar outra aqui
    // faria a galeria e a aba Integrações discordarem sobre o mesmo problema.
    let motivoIndisponivel = null;
    for (const nome of receita.precisa || []) {
      const catalogo = catalogos[nome];
      if (!catalogo) continue;
      if (!catalogo.disponivel) {
        motivoIndisponivel = catalogo.motivoIndisponivel || `${catalogo.rotulo} não está disponível.`;
        break;
      }
    }

    return {
      id: receita.id,
      titulo: receita.titulo,
      resumo: receita.resumo,
      precisa: receita.precisa || [],
      ajuste: receita.ajuste || null,
      nota: receita.nota || null,
      botao: receita.botao,
      existe,
      disponivel: !motivoIndisponivel,
      motivoIndisponivel,
    };
  });
}

module.exports = { RECEITAS, validar, paraCatalogo, passosDe };
