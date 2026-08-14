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
function _analisar(linha) {
  const limpa = linha.trim();
  if (!limpa || limpa.startsWith('#')) return null;
  const igual = limpa.indexOf('=');
  if (igual === -1) return null;
  return { chave: limpa.slice(0, igual).trim(), valor: limpa.slice(igual + 1).trim() };
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
    return `${par.chave}=${valor}`;
  });

  // Chaves que ainda não existiam no arquivo vão para o fim, com um
  // cabeçalho explicando de onde saíram.
  if (pendentes.size > 0) {
    if (saida.length && saida[saida.length - 1].trim() !== '') saida.push('');
    saida.push('# Adicionado pela tela de configuração');
    for (const [chave, valor] of pendentes) saida.push(`${chave}=${valor}`);
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
