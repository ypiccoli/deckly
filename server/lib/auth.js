// Middlewares de acesso.
//
// Duas travas, com propósitos diferentes:
//
//   exigirToken  — vale para tudo que dispara ação ou lê estado. Sem token,
//                  qualquer aparelho da rede poderia mandar o seu PC abrir
//                  programas.
//   exigirLocal  — camada extra só para o que reconfigura o app (gravar o
//                  layout, ver o catálogo, fazer o OAuth do Spotify). Por
//                  padrão só responde do próprio PC; libere com
//                  CONFIG_REMOTO=true no .env se quiser configurar pelo
//                  tablet.
//
// Nota honesta sobre o alcance disto: o tráfego é HTTP puro na LAN, sem
// TLS. O token impede que outro aparelho da rede use o deck, mas não
// protege contra quem consiga capturar o tráfego da própria rede. Para o
// uso pretendido (rede doméstica, nada exposto à internet) é o equilíbrio
// certo; expor isto à internet continua sendo má ideia.

const { conferir } = require('./token');

const ENDERECOS_LOCAIS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function ehLocal(req) {
  return ENDERECOS_LOCAIS.has(req.socket.remoteAddress);
}

// Aceita o token no header (uso normal do app) ou na query string (para o
// primeiro acesso pelo link de pareamento, que o navegador abre direto).
function extrairToken(req) {
  return req.get('x-token') || req.query.token || null;
}

function exigirToken(req, res, next) {
  const informado = extrairToken(req);
  if (!informado) {
    res.status(401).json({ ok: false, erro: 'Token de acesso não informado.', precisaToken: true });
    return;
  }
  if (!conferir(informado)) {
    res.status(401).json({ ok: false, erro: 'Token de acesso inválido.', precisaToken: true });
    return;
  }
  next();
}

function exigirLocal(req, res, next) {
  if (process.env.CONFIG_REMOTO === 'true' || ehLocal(req)) {
    next();
    return;
  }
  res.status(403).json({
    ok: false,
    erro:
      'Esta parte só responde no próprio PC. Abra pelo endereço 127.0.0.1 na máquina ' +
      'onde o servidor roda, ou defina CONFIG_REMOTO=true no .env para liberar pela rede.',
  });
}

module.exports = { exigirToken, exigirLocal, ehLocal };
