// Gera docs/acoes.md e preenche o catálogo dentro de
// docs/guia-primeiro-acesso.html a partir do catálogo das integrações
// (npm run docs).
//
// Por que gerar em vez de escrever à mão: o catálogo (o getter `catalogo` de
// cada integração) já é a fonte de verdade da tela de configuração. Se a doc
// fosse escrita à mão, toda ação nova nasceria com a documentação errada. Do
// jeito que está, adicionar uma ação e rodar `npm run docs` mantém as duas
// em dia — e uma ação que não aparecer aqui é uma ação que também não
// aparece no editor, o que já é o aviso de que falta a entrada no catálogo.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DESTINO = path.join(RAIZ, 'docs', 'acoes.md');

// O guia do usuário é escrito à mão, MENOS o catálogo: essa parte fica entre
// as marcas abaixo e é reescrita aqui. Sem isso o guia nasceria desatualizado
// a cada ação nova — e ele é a única documentação que quem baixa o .exe lê.
const GUIA = path.join(RAIZ, 'docs', 'guia-primeiro-acesso.html');
const MARCA_INICIO = '<!-- CATALOGO:INICIO -->';
const MARCA_FIM = '<!-- CATALOGO:FIM -->';

// Requerer as integrações imprime as mensagens de subida delas ("[media]
// Backend ativo…"), que aqui só sujariam a saída do comando.
function semRuido(fn) {
  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

const NOMES = ['media', 'obs', 'spotify', 'atalhos', 'discord', 'homeassistant'];

const { TIPOS_BOTAO, ESTILOS_ESTADO } = require(path.join(RAIZ, 'server', 'lib', 'catalogo-ui'));

// O que cada integração precisa para funcionar. É a única coisa aqui que não
// vem do catálogo: o catálogo diz se ESTÁ disponível agora, não o que fazer
// para deixar disponível.
const REQUISITOS = {
  media: 'Nada. Funciona assim que o programa abre, no Windows.',
  atalhos: 'Nada. Funciona assim que o programa abre, no Windows.',
  obs: 'OBS Studio aberto, com **Ferramentas > WebSocket Server Settings > Enable WebSocket server** ligado.',
  spotify: 'Conta Spotify **Premium** e as chaves `SPOTIFY_*` no `.env` — veja "Habilitar o Spotify" no README.',
  homeassistant: 'Um Home Assistant rodando na sua rede e um token de acesso de longa duração. Cobre qualquer marca que o Home Assistant suporte — veja docs/casa-inteligente.md.',
  discord: 'Discord aberto, com os atalhos globais cadastrados em **Configurações do Usuário > Teclas de Atalho** e as mesmas teclas informadas na aba Integrações. Os botões não acendem: o Discord não informa se você está mudo.',
};

function tabela(cabecalhos, linhas) {
  if (linhas.length === 0) return '_(nenhum)_\n';
  const separador = cabecalhos.map(() => '---');
  return [cabecalhos, separador, ...linhas].map((l) => `| ${l.join(' | ')} |`).join('\n') + '\n';
}

function descreverParametro(p) {
  const partes = [`\`${p.nome}\``];
  partes.push(`(${p.tipo}${p.obrigatorio ? ', obrigatório' : ''})`);
  if (p.rotulo) partes.push(`— ${p.rotulo}`);
  if (p.ajuda) partes.push(`_${p.ajuda}_`);
  return partes.join(' ');
}

function secaoIntegracao(nome, catalogo) {
  const linhas = [];
  linhas.push(`## ${catalogo.rotulo}`);
  linhas.push('');
  linhas.push(`Nas configurações do botão, esta é a integração **${nome}**.`);
  linhas.push('');
  linhas.push(`**Precisa de:** ${REQUISITOS[nome] || '—'}`);
  linhas.push('');

  linhas.push('### Ações');
  linhas.push('');
  linhas.push(
    tabela(
      ['Ação', 'O que faz', 'Parâmetros'],
      Object.entries(catalogo.acoes || {}).map(([id, acao]) => [
        `\`${id}\``,
        acao.rotulo,
        (acao.parametros || []).length
          ? acao.parametros.map(descreverParametro).join('<br />')
          : '—',
      ]),
    ),
  );

  const estados = catalogo.estados || [];
  if (estados.length > 0) {
    linhas.push('### Informações ao vivo');
    linhas.push('');
    linhas.push(
      'Servem para o botão acender sozinho (campo **Acende quando**) ou para ' +
        'mostrar texto num botão do tipo Mostrador.',
    );
    linhas.push('');
    linhas.push(
      tabela(
        ['Chave', 'O que é', 'Tipo'],
        estados.map((e) => [`\`${e.chave}\``, e.rotulo, e.tipo]),
      ),
    );
  }

  return linhas.join('\n');
}

function gerar() {
  const partes = [];

  partes.push('# O que dá para colocar num botão');
  partes.push('');
  partes.push(
    '> Arquivo gerado automaticamente por `npm run docs` a partir do que cada ' +
      'integração declara. Não edite à mão — a próxima geração desfaz.',
  );
  partes.push('');
  partes.push(
    'Cada botão do deck dispara uma **ação** de uma **integração**. Esta é a ' +
      'lista completa do que existe hoje, com os parâmetros que cada ação aceita. ' +
      'Você monta tudo isso pela tela de configuração (`http://127.0.0.1:3000/config/`), ' +
      'sem editar arquivo nenhum — a tabela abaixo é para consulta.',
  );
  partes.push('');

  partes.push('## Tipos de botão');
  partes.push('');
  partes.push(
    tabela(
      ['Tipo', 'Para que serve'],
      TIPOS_BOTAO.map((t) => [t.rotulo, t.descricao]),
    ),
  );

  partes.push('## Destaques');
  partes.push('');
  partes.push('A cor que o botão assume quando está "ligado":');
  partes.push('');
  partes.push(
    tabela(
      ['Estilo', 'Aparência'],
      ESTILOS_ESTADO.map((e) => [`\`${e.id}\``, e.rotulo]),
    ),
  );

  partes.push('## Macros: várias ações num toque');
  partes.push('');
  partes.push(
    'Um botão não precisa fazer só uma coisa. Na tela de configuração dá para ' +
      'adicionar vários passos, executados em sequência num toque só — por exemplo ' +
      'abrir o jogo e o Discord de uma vez, ou trocar a cena do OBS e começar a gravar.',
  );
  partes.push('');

  const catalogos = semRuido(() =>
    NOMES.map((nome) => [nome, require(path.join(RAIZ, 'server', 'integrations', nome)).catalogo]),
  );

  for (const [nome, catalogo] of catalogos) {
    if (!catalogo) continue;
    partes.push(secaoIntegracao(nome, catalogo));
  }

  return partes.join('\n');
}

function escapar(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Os requisitos são escritos em markdown (são compartilhados com o acoes.md).
// Aqui só as duas marcações que eles usam viram HTML.
function marcacaoParaHtml(texto) {
  return escapar(texto)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function parametrosHtml(acao) {
  const parametros = acao.parametros || [];
  if (parametros.length === 0) return '—';
  return parametros
    .map((p) => {
      const rotulo = `<strong>${escapar(p.rotulo || p.nome)}</strong>`;
      const obrigatorio = p.obrigatorio ? ' (obrigatório)' : '';
      const ajuda = p.ajuda ? `<br /><em>${escapar(p.ajuda)}</em>` : '';
      return rotulo + obrigatorio + ajuda;
    })
    .join('<br />');
}

// O guia fala com quem não programa: aqui vai o RÓTULO da ação (o mesmo texto
// que aparece no menu da tela de configuração), nunca o identificador interno.
function catalogoHtml(catalogos) {
  const linhas = [];
  for (const [nome, catalogo] of catalogos) {
    if (!catalogo) continue;
    linhas.push(`  <h3>${escapar(catalogo.rotulo)}</h3>`);
    linhas.push(`  <p class="precisa"><strong>Precisa de:</strong> ${marcacaoParaHtml(REQUISITOS[nome] || '—')}</p>`);
    linhas.push('  <table>');
    linhas.push('    <tr><th style="width: 52mm">Ação</th><th>O que você informa</th></tr>');
    for (const acao of Object.values(catalogo.acoes || {})) {
      linhas.push(`    <tr><td>${escapar(acao.rotulo)}</td><td>${parametrosHtml(acao)}</td></tr>`);
    }
    linhas.push('  </table>');
  }
  return linhas.join('\n');
}

function atualizarGuia(catalogos) {
  if (!fs.existsSync(GUIA)) return null;
  const original = fs.readFileSync(GUIA, 'utf8');
  const i = original.indexOf(MARCA_INICIO);
  const f = original.indexOf(MARCA_FIM);
  if (i === -1 || f === -1) {
    console.warn('Aviso: não achei as marcas do catálogo no guia — ele não foi atualizado.');
    return null;
  }
  const miolo = `${MARCA_INICIO}\n${catalogoHtml(catalogos)}\n  `;
  const novo = original.slice(0, i) + miolo + original.slice(f);
  // Comparar o conteúdo, e não o número de linhas: uma troca de texto do mesmo
  // tamanho mudaria o arquivo e seria anunciada como "já estava em dia".
  if (novo === original) return 'igual';
  fs.writeFileSync(GUIA, novo);
  return 'atualizado';
}

const conteudo = gerar();
fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, conteudo);
console.log(`docs/acoes.md gerado (${conteudo.split('\n').length} linhas).`);

const catalogos = semRuido(() =>
  NOMES.map((nome) => [nome, require(path.join(RAIZ, 'server', 'integrations', nome)).catalogo]),
);
const resultado = atualizarGuia(catalogos);
if (resultado !== null) {
  console.log(
    resultado === 'igual'
      ? 'docs/guia-primeiro-acesso.html: catálogo já estava em dia.'
      : 'docs/guia-primeiro-acesso.html: catálogo atualizado.',
  );
}
