// Leitura e escrita do .env pela tela de configuração.
//
// Por que continuar usando o .env em vez de um JSON novo: ele já é a fonte
// de verdade de todas as integrações, já mora na pasta de dados (sobrevive à
// troca do .exe) e continua editável à mão por quem preferir. Um segundo
// lugar para guardar credencial só criaria a pergunta "qual dos dois vale".
//
// A escrita **preserva comentários e ordem**: o arquivo é a documentação de
// si mesmo (é o .env.example que vira o .env na primeira execução), e um
// dump de `CHAVE=valor` jogaria isso fora. Por isso o arquivo é tratado como
// uma lista de linhas, e só a linha da chave alterada é reescrita.

const fs = require('fs');
const path = require('path');
const caminhos = require('./caminhos');

const ARQUIVO = caminhos.env;

function _linhas() {
  if (!fs.existsSync(ARQUIVO)) return [];
  return fs.readFileSync(ARQUIVO, 'utf8').split('\n');
}

// Aceita "CHAVE=valor" com espaços em volta e ignora comentários. Não tenta
// cobrir todo o dialeto do dotenv (aspas, multilinha): o que este app grava
// são credenciais de uma linha só.
//
// Regras de valor, copiadas do dotenv para os dois não discordarem:
//   - entre aspas, vale tudo que está dentro (inclusive # e espaços);
//   - sem aspas, um # começa comentário e o resto da linha é descartado.
// Sem isso a tela de configuração mostraria "# nota" como se fosse o valor,
// enquanto o app leria outra coisa.
function _analisar(linha) {
  const limpa = linha.trim();
  if (!limpa || limpa.startsWith('#')) return null;
  const igual = limpa.indexOf('=');
  if (igual === -1) return null;

  const bruto = limpa.slice(igual + 1).trim();
  const aspas = bruto.match(/^(['"])([\s\S]*?)\1/);
  const valor = aspas ? aspas[2] : bruto.split('#')[0].trim();

  return { chave: limpa.slice(0, igual).trim(), valor };
}

// Valor com #, espaço ou aspas precisa ser citado, senão o dotenv o cortaria
// na releitura — uma senha "s3nha#forte" viraria "s3nha" em silêncio.
//
// O dotenv NÃO entende barra invertida dentro de aspas: o valor termina na
// próxima aspa igual à de abertura. Então não dá para escapar — a saída é
// escolher a aspa que não aparece no valor. Se as duas aparecerem, o formato
// não consegue representar o valor, e falhar alto é melhor que gravar algo
// que voltará truncado.
function _formatar(valor) {
  if (valor === '') return '';
  if (!/[#\s'"]/.test(valor)) return valor;
  if (!valor.includes('"')) return `"${valor}"`;
  if (!valor.includes("'")) return `'${valor}'`;
  throw new Error(
    'Valor com aspas simples e duplas ao mesmo tempo não pode ser gravado no .env.',
  );
}

function ler() {
  const valores = {};
  for (const linha of _linhas()) {
    const par = _analisar(linha);
    if (par) valores[par.chave] = par.valor;
  }
  return valores;
}

// Grava um conjunto de chaves. Chave ausente do objeto fica como está;
// string vazia limpa o valor (é como se desconfigura uma integração).
// Escrita atômica pelo mesmo motivo do config-store: um desligamento no meio
// não pode deixar o .env truncado, ou o app perde todas as credenciais de
// uma vez.
function gravar(novos) {
  const linhas = _linhas();
  const pendentes = new Map(Object.entries(novos));

  const saida = linhas.map((linha) => {
    const par = _analisar(linha);
    if (!par || !pendentes.has(par.chave)) return linha;
    const valor = pendentes.get(par.chave);
    pendentes.delete(par.chave);
    return `${par.chave}=${_formatar(valor)}`;
  });

  // Chaves que ainda não existiam no arquivo vão para o fim, com um
  // cabeçalho explicando de onde saíram.
  if (pendentes.size > 0) {
    if (saida.length && saida[saida.length - 1].trim() !== '') saida.push('');
    saida.push('# Adicionado pela tela de configuração');
    for (const [chave, valor] of pendentes) saida.push(`${chave}=${_formatar(valor)}`);
    saida.push('');
  }

  const conteudo = saida.join('\n');
  const temporario = path.join(path.dirname(ARQUIVO), `.env.tmp-${process.pid}`);
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  fs.writeFileSync(temporario, conteudo);
  fs.renameSync(temporario, ARQUIVO);

  // process.env é o que as integrações leem quando reconfiguram, então
  // precisa acompanhar — senão o valor só valeria depois de reiniciar, que é
  // exatamente o que esta tela existe para evitar.
  for (const [chave, valor] of Object.entries(novos)) {
    if (valor === '') delete process.env[chave];
    else process.env[chave] = valor;
  }

  return ler();
}

module.exports = { ler, gravar, arquivo: ARQUIVO };
