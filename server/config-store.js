// Guarda a configuração de páginas/botões: lê, valida, salva e recarrega.
//
// Mesmo padrão do .env / .env.example: `config/pages.config.json` é o arquivo
// PESSOAL (ignorado pelo Git — tem caminhos, IPs e nomes de cena da sua
// máquina) e `config/pages.config.example.json` é o modelo inicial, esse sim
// versionado. O pessoal tem prioridade; sem ele, o servidor sobe com o
// exemplo para que um clone novo funcione de primeira.
//
// O formato é JSON (e não um módulo JS como já foi) justamente para poder ser
// reescrito pela tela de configuração sem perder nada pelo caminho. O preço é
// não ter comentários — por isso páginas e botões aceitam um campo opcional
// `_nota`, que sobrevive a idas e voltas pelo editor.

const fs = require('fs');
const path = require('path');
const caminhos = require('./lib/caminhos');

const PASTA_CONFIG = caminhos.config;
const CAMINHO_PESSOAL = path.join(PASTA_CONFIG, 'pages.config.json');
const CAMINHO_EXEMPLO = path.join(PASTA_CONFIG, 'pages.config.example.json');
const CAMINHO_BACKUP = path.join(PASTA_CONFIG, 'pages.config.backup.json');

const TIPOS_VALIDOS = ['botao', 'slider', 'info', 'lista'];

let config = null;
let caminhoEmUso = null;

function _ler(caminho) {
  const bruto = fs.readFileSync(caminho, 'utf8');
  return JSON.parse(bruto);
}

// Ordem de tentativa na subida: o pessoal, depois o backup que o salvar()
// deixa, depois o exemplo. O backup existia desde sempre e nada o lia — um
// pages.config.json com JSON quebrado (edição manual malfeita, desligamento
// no meio de uma cópia externa) fazia o servidor morrer no require, e a
// pessoa via o .exe simplesmente não abrir.
//
// O arquivo quebrado NÃO é sobrescrito ao cair para o backup: ele é a única
// cópia do que a pessoa fez por último, e apagá-lo automaticamente tiraria a
// chance de recuperar um botão à mão. O próximo Salvar grava por cima no
// fluxo normal.
function carregar() {
  const candidatos = [
    { caminho: CAMINHO_PESSOAL, rotulo: 'config/pages.config.json' },
    { caminho: CAMINHO_BACKUP, rotulo: 'config/pages.config.backup.json' },
    { caminho: CAMINHO_EXEMPLO, rotulo: 'config/pages.config.example.json' },
  ];

  let falhou = null;
  for (const candidato of candidatos) {
    if (!fs.existsSync(candidato.caminho)) continue;
    try {
      config = _ler(candidato.caminho);
    } catch (erro) {
      console.error(`[config] ${candidato.rotulo} está ilegível: ${erro.message}`);
      falhou = falhou || candidato.rotulo;
      continue;
    }

    caminhoEmUso = candidato.caminho;
    if (falhou && candidato.caminho === CAMINHO_BACKUP) {
      console.warn(
        `[config] Subindo com ${candidato.rotulo} porque ${falhou} não pôde ser lido. ` +
          'O arquivo com problema foi mantido como está — para adotar o backup de vez, ' +
          'copie o .backup.json por cima do .json.',
      );
    } else if (falhou) {
      console.warn(
        `[config] Nem ${falhou} nem o backup puderam ser lidos — subindo com o template ` +
          'inicial (config/pages.config.example.json). Os arquivos com problema foram ' +
          'mantidos como estão.',
      );
    } else if (candidato.caminho === CAMINHO_EXEMPLO) {
      console.log(
        '[config] Usando config/pages.config.example.json — ele vira seu ' +
          'config/pages.config.json na primeira vez que você salvar pela tela de configuração.',
      );
    }
    return config;
  }

  // Nem o exemplo abriu: aí não há deck nenhum a mostrar, e falhar alto é
  // melhor do que subir uma grade vazia sem explicação.
  throw new Error(
    'Nenhum arquivo de configuração pôde ser lido (pessoal, backup e exemplo). ' +
      `Confira a pasta ${PASTA_CONFIG}.`,
  );
}

function recarregar() {
  return carregar();
}

function obterPaginas() {
  return config.paginas;
}

function obterConfig() {
  return config;
}

function encontrarBotao(id) {
  for (const pagina of config.paginas) {
    const botao = pagina.botoes.find((b) => b.id === id);
    if (botao) return botao;
  }
  return null;
}

// Valida ANTES de gravar. Devolve uma lista de erros legíveis (vazia = ok),
// cada um apontando onde está o problema — é isso que a tela de configuração
// mostra ao usuário. Recebe `integracoes` para conferir se a integração e a
// ação referenciadas existem de verdade.
function validar(novoConfig, integracoes) {
  const erros = [];

  if (!novoConfig || typeof novoConfig !== 'object') {
    return ['A configuração precisa ser um objeto.'];
  }
  if (!Array.isArray(novoConfig.paginas)) {
    return ['A configuração precisa ter uma lista "paginas".'];
  }
  if (novoConfig.paginas.length === 0) {
    erros.push('A configuração precisa ter pelo menos uma página.');
  }

  const idsPagina = new Set();
  const idsBotao = new Set();

  novoConfig.paginas.forEach((pagina, iPagina) => {
    const ondePagina = `página ${iPagina + 1}`;

    if (!pagina.id) erros.push(`${ondePagina}: falta o campo "id".`);
    else if (idsPagina.has(pagina.id)) erros.push(`${ondePagina}: id "${pagina.id}" repetido.`);
    else idsPagina.add(pagina.id);

    if (!pagina.titulo) erros.push(`${ondePagina}: falta o campo "titulo".`);

    // Layout da página. Os limites existem para o deck não virar algo
    // impossível de tocar: 12 colunas já é pequeno demais num tablet, e
    // botão de 60px é o mínimo confortável para o dedo.
    if (pagina.colunas != null) {
      const n = Number(pagina.colunas);
      if (!Number.isInteger(n) || n < 1 || n > 12) {
        erros.push(`${ondePagina}: "colunas" precisa ser um inteiro entre 1 e 12.`);
      }
    }
    if (pagina.alturaBotao != null) {
      const n = Number(pagina.alturaBotao);
      if (!Number.isFinite(n) || n < 60 || n > 260) {
        erros.push(`${ondePagina}: "alturaBotao" precisa estar entre 60 e 260 (pixels).`);
      }
    }

    if (!Array.isArray(pagina.botoes)) {
      erros.push(`${ondePagina}: "botoes" precisa ser uma lista.`);
      return;
    }

    pagina.botoes.forEach((botao, iBotao) => {
      const onde = `"${pagina.titulo || pagina.id}" › botão ${iBotao + 1}${botao.titulo ? ` (${botao.titulo})` : ''}`;

      if (!botao.id) erros.push(`${onde}: falta o campo "id".`);
      else if (idsBotao.has(botao.id)) erros.push(`${onde}: id "${botao.id}" repetido — ids são únicos no app inteiro.`);
      else idsBotao.add(botao.id);

      if (!botao.titulo) erros.push(`${onde}: falta o campo "titulo".`);

      const tipo = botao.tipo || 'botao';
      if (!TIPOS_VALIDOS.includes(tipo)) {
        erros.push(`${onde}: tipo "${tipo}" não existe (use ${TIPOS_VALIDOS.join(', ')}).`);
      }

      // Tamanho do botão, em células da grade.
      for (const campo of ['largura', 'altura']) {
        if (botao[campo] == null) continue;
        const n = Number(botao[campo]);
        if (!Number.isInteger(n) || n < 1 || n > 6) {
          erros.push(`${onde}: "${campo}" precisa ser um inteiro entre 1 e 6.`);
        }
      }

      // Cor livre, mas validada: um valor inválido não quebraria a página
      // (o CSS ignora), e o botão ficaria sem cor sem ninguém entender por quê.
      if (botao.cor != null && !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(botao.cor))) {
        erros.push(`${onde}: "cor" precisa ser um hexadecimal como #6c5ce7.`);
      }

      if (tipo === 'lista' && !botao.fonte) {
        erros.push(`${onde}: botão do tipo "lista" precisa do campo "fonte".`);
      }

      // A estrela de favoritar precisa dos dois: de qual lista o item é
      // ("favoritoFonte") e onde está o id do item exibido agora
      // ("favoritoId"). Com um só, a estrela apareceria sem funcionar.
      if (Boolean(botao.favoritoFonte) !== Boolean(botao.favoritoId)) {
        erros.push(
          `${onde}: "favoritoFonte" e "favoritoId" andam juntos — informe os dois ou nenhum.`,
        );
      }
      if (tipo === 'slider') {
        for (const campo of ['min', 'max']) {
          if (typeof botao[campo] !== 'number') {
            erros.push(`${onde}: botão do tipo "slider" precisa de "${campo}" numérico.`);
          }
        }
        if (typeof botao.min === 'number' && typeof botao.max === 'number' && botao.min >= botao.max) {
          erros.push(`${onde}: "min" precisa ser menor que "max".`);
        }
      }

      // "info" é somente leitura: não dispara ação nenhuma.
      if (tipo === 'info') return;

      const passos = botao.acoes || [{ integracao: botao.integracao, acao: botao.acao }];
      if (botao.acoes && !Array.isArray(botao.acoes)) {
        erros.push(`${onde}: "acoes" precisa ser uma lista de passos.`);
        return;
      }
      if (botao.acoes && botao.acoes.length === 0) {
        erros.push(`${onde}: "acoes" está vazia — remova o campo ou adicione um passo.`);
        return;
      }

      passos.forEach((passo, iPasso) => {
        const ondePasso = botao.acoes ? `${onde}, passo ${iPasso + 1}` : onde;

        if (!passo.integracao) {
          erros.push(`${ondePasso}: falta o campo "integracao".`);
          return;
        }
        const integracao = integracoes[passo.integracao];
        if (!integracao) {
          erros.push(`${ondePasso}: integração "${passo.integracao}" não existe.`);
          return;
        }
        if (!passo.acao) {
          erros.push(`${ondePasso}: falta o campo "acao".`);
          return;
        }
        if (!integracao.acoes[passo.acao]) {
          erros.push(`${ondePasso}: ação "${passo.acao}" não existe na integração "${passo.integracao}".`);
        }
      });
    });
  });

  return erros;
}

// Aplica SÓ layout sobre o config que está em disco, e devolve
// { config, erros }. É o que permite o modo de edição do deck salvar de
// qualquer aparelho da rede, sem a trava de "só do próprio PC".
//
// A segurança aqui não vem de conferir se o corpo da requisição mudou apenas
// layout — vem de nunca ler mais nada dele. Integração, ação, parâmetros,
// fonte, estadoChave: tudo continua vindo do disco. O corpo só decide ORDEM,
// `largura`, `altura`, `colunas` e `alturaBotao`. Assim não existe payload
// capaz de criar um botão que abra um programa, que é o motivo de
// PUT /api/config exigir 127.0.0.1.
//
// Pelo mesmo motivo o conjunto de ids precisa bater exatamente com o que já
// existe: sem isso daria para remover um botão simplesmente omitindo-o.
function aplicarLayout(paginasLayout) {
  const erros = [];

  if (!paginasLayout || !Array.isArray(paginasLayout)) {
    return { config: null, erros: ['O corpo precisa ter uma lista "paginas".'] };
  }

  // Cópia profunda: nada é alterado até a validação passar por inteiro.
  const novoConfig = JSON.parse(JSON.stringify(config));

  const numeroOuNada = (valor) => (typeof valor === 'number' ? valor : undefined);

  for (const paginaLayout of paginasLayout) {
    const pagina = novoConfig.paginas.find((p) => p.id === paginaLayout?.id);
    if (!pagina) {
      erros.push(`Página "${paginaLayout?.id}" não existe.`);
      continue;
    }
    const onde = `Página "${pagina.id}"`;

    // Ausente ou null = "automático"/"padrão", que é um valor legítimo dos
    // dois campos e precisa poder voltar a ser escolhido.
    for (const [campo, valor] of [
      ['colunas', numeroOuNada(paginaLayout.colunas)],
      ['alturaBotao', numeroOuNada(paginaLayout.alturaBotao)],
    ]) {
      if (valor === undefined) delete pagina[campo];
      else pagina[campo] = valor;
    }

    if (!Array.isArray(paginaLayout.botoes)) {
      erros.push(`${onde}: "botoes" precisa ser uma lista.`);
      continue;
    }

    const idsPedidos = paginaLayout.botoes.map((b) => b?.id);
    const idsAtuais = pagina.botoes.map((b) => b.id);

    if (idsPedidos.length !== idsAtuais.length) {
      erros.push(
        `${onde}: a lista tem ${idsPedidos.length} botões, mas a página tem ${idsAtuais.length}. ` +
          'Esta rota só reordena e redimensiona — para adicionar ou remover, use a tela de configuração.',
      );
      continue;
    }
    const desconhecido = idsPedidos.find((id) => !idsAtuais.includes(id));
    if (desconhecido !== undefined) {
      erros.push(`${onde}: botão "${desconhecido}" não existe nesta página.`);
      continue;
    }
    if (new Set(idsPedidos).size !== idsPedidos.length) {
      erros.push(`${onde}: há ids repetidos na lista.`);
      continue;
    }

    // A ordem do array É a posição na grade. Cada botão é o objeto do disco,
    // com no máximo largura/altura trocadas.
    pagina.botoes = paginaLayout.botoes.map((pedido) => {
      const botao = pagina.botoes.find((b) => b.id === pedido.id);
      for (const campo of ['largura', 'altura']) {
        const valor = numeroOuNada(pedido[campo]);
        // 1 é o padrão: gravar "largura: 1" só sujaria o arquivo.
        if (valor === undefined || valor === 1) delete botao[campo];
        else botao[campo] = valor;
      }
      return botao;
    });
  }

  return { config: novoConfig, erros };
}

// Grava de forma atômica: escreve num temporário e renomeia por cima. Um
// rename é atômico no mesmo sistema de arquivos, então uma queda no meio da
// escrita nunca deixa um config pela metade. A versão anterior fica guardada
// como backup para dar para voltar atrás.
function salvar(novoConfig) {
  const temporario = `${CAMINHO_PESSOAL}.tmp`;

  if (fs.existsSync(CAMINHO_PESSOAL)) {
    fs.copyFileSync(CAMINHO_PESSOAL, CAMINHO_BACKUP);
  }

  fs.writeFileSync(temporario, JSON.stringify(novoConfig, null, 2) + '\n', 'utf8');
  fs.renameSync(temporario, CAMINHO_PESSOAL);

  config = novoConfig;
  caminhoEmUso = CAMINHO_PESSOAL;
  return config;
}

carregar();

module.exports = {
  obterPaginas,
  obterConfig,
  encontrarBotao,
  validar,
  aplicarLayout,
  salvar,
  recarregar,
  get caminhoEmUso() {
    return caminhoEmUso;
  },
};
