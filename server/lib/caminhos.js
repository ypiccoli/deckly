// Onde ficam os arquivos — resolvido de um jeito só, para o app funcionar
// igual rodando do código-fonte e empacotado num .exe.
//
// Rodando do código-fonte, tudo fica onde sempre esteve (a raiz do
// repositório). Empacotado, o executável é um arquivo só: `public/`,
// `scripts/` e o modelo de config vêm embutidos e são gravados numa pasta
// `dados/` ao lado do .exe na primeira execução.
//
// A regra de quem sobrescreve o quê:
//   - CÓDIGO (public/, scripts/) é reescrito a cada inicialização, para
//     nunca ficar defasado em relação ao executável;
//   - DADOS (config/) só são criados se não existirem — nunca por cima do
//     que a pessoa configurou.

const fs = require('fs');
const path = require('path');
const os = require('os');

let sea = null;
try {
  sea = require('node:sea');
} catch {
  // Node antigo, sem suporte a SEA: só existe o modo código-fonte.
}

const EMPACOTADO = Boolean(sea && sea.isSea && sea.isSea());

const RAIZ_FONTE = path.join(__dirname, '..', '..');

// Pasta ao lado do .exe. Se não der para escrever ali (executável em
// Program Files, por exemplo), cai para a pasta de dados do usuário.
function escolherPastaDados() {
  const aoLado = path.join(path.dirname(process.execPath), 'dados');
  try {
    fs.mkdirSync(aoLado, { recursive: true });
    fs.accessSync(aoLado, fs.constants.W_OK);
    return aoLado;
  } catch {
    const alternativa = path.join(
      process.env.LOCALAPPDATA || os.homedir(),
      'StreamDeckWeb',
    );
    fs.mkdirSync(alternativa, { recursive: true });
    return alternativa;
  }
}

const RAIZ = EMPACOTADO ? escolherPastaDados() : RAIZ_FONTE;

const caminhos = {
  empacotado: EMPACOTADO,
  raiz: RAIZ,
  publico: path.join(RAIZ, 'public'),
  scripts: path.join(RAIZ, 'scripts'),
  config: path.join(RAIZ, 'config'),
  env: path.join(RAIZ, '.env'),
};

// Grava na pasta de dados tudo que veio embutido no executável. Só faz
// sentido no modo empacotado; rodando do código-fonte os arquivos já estão
// no lugar.
function prepararArquivos() {
  if (!EMPACOTADO) return;

  const manifesto = JSON.parse(new TextDecoder().decode(sea.getAsset('manifesto.json')));

  for (const relativo of manifesto.codigo) {
    const destino = path.join(RAIZ, relativo);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, Buffer.from(sea.getAsset(relativo)));
  }

  // O modelo de config vira o config da pessoa só na primeira vez.
  for (const [origem, destino] of Object.entries(manifesto.modelos)) {
    const alvo = path.join(RAIZ, destino);
    if (fs.existsSync(alvo)) continue;
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, Buffer.from(sea.getAsset(origem)));
  }
}

module.exports = { ...caminhos, prepararArquivos };
