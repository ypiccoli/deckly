// Token de acesso ao deck.
//
// Sem ele, qualquer aparelho na mesma rede poderia disparar ações — e
// "abrir programa" é uma ação, então isso significa rodar programa no seu
// PC. O token é a tranca principal do app.
//
// De onde vem, nesta ordem:
//   1. STREAM_DECK_TOKEN no .env (para fixar um valor seu)
//   2. config/token.json, gerado na primeira execução
//
// O formato é pensado para ser DIGITADO num tablet quando não der para
// escanear o QR: alfabeto sem caracteres ambíguos (nada de O/0, I/1) e
// agrupado de 4 em 4. São 16 caracteres de um alfabeto de 32 => ~80 bits,
// de sobra para uma rede local.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0, 1
const GRUPOS = 4;
const TAMANHO_GRUPO = 4;

const CAMINHO_TOKEN = path.join(__dirname, '..', '..', 'config', 'token.json');

function gerar() {
  const total = GRUPOS * TAMANHO_GRUPO;
  // rejection sampling para não enviesar: 256 % 32 === 0, então byte % 32
  // já é uniforme com este alfabeto de 32 caracteres.
  const bytes = crypto.randomBytes(total);
  let bruto = '';
  for (let i = 0; i < total; i++) bruto += ALFABETO[bytes[i] % ALFABETO.length];
  return bruto.match(new RegExp(`.{1,${TAMANHO_GRUPO}}`, 'g')).join('-');
}

// Compara ignorando hífens, espaços e caixa — quem digitar "k7m2 9xqp..."
// não deve ser barrado por um detalhe de formatação.
function normalizar(valor) {
  return String(valor || '').replace(/[\s-]/g, '').toUpperCase();
}

function carregar() {
  if (process.env.STREAM_DECK_TOKEN) {
    return { token: process.env.STREAM_DECK_TOKEN, origem: '.env' };
  }

  if (fs.existsSync(CAMINHO_TOKEN)) {
    try {
      const dados = JSON.parse(fs.readFileSync(CAMINHO_TOKEN, 'utf8'));
      if (dados.token) return { token: dados.token, origem: 'config/token.json' };
    } catch {
      console.warn('[token] config/token.json ilegível — gerando um token novo.');
    }
  }

  const token = gerar();
  fs.writeFileSync(CAMINHO_TOKEN, JSON.stringify({ token }, null, 2) + '\n', 'utf8');
  return { token, origem: 'gerado agora' };
}

const { token: TOKEN, origem: ORIGEM } = carregar();

// Comparação em tempo constante: uma comparação normal vaza, pelo tempo de
// resposta, quantos caracteres iniciais bateram.
function conferir(candidato) {
  const a = Buffer.from(normalizar(candidato));
  const b = Buffer.from(normalizar(TOKEN));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  TOKEN,
  ORIGEM,
  conferir,
  normalizar,
};
