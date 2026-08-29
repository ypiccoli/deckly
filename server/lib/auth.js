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

const net = require('net');

const { conferir } = require('./token');

const ENDERECOS_LOCAIS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// ---------------------------------------------------------------------------
// exigirHostConhecido — defesa contra DNS rebinding.
//
// O exigirLocal confere o ENDEREÇO de quem conectou, e contra outro aparelho
// da rede isso basta. Ele não cobre um ângulo diferente: o navegador do
// próprio usuário sendo usado como intermediário.
//
// O ataque: a pessoa visita uma página maliciosa; o domínio dela volta a
// resolver, agora para 127.0.0.1; a página faz fetch para si mesma na porta do
// Deckly. Para o navegador é MESMA ORIGEM, então a resposta é legível — e o
// req.socket.remoteAddress continua sendo 127.0.0.1, então o exigirLocal
// aprova. Como GET /api/bemvindo é a única rota sem token e é exatamente onde
// o token é revelado, o site sairia de lá com o token e o controle do deck.
//
// O que quebra o ataque é notar que ele SÓ funciona por nome: o atacante
// precisa de um domínio para re-resolver. Acessar por IP literal não dá para
// forjar. Então aceitamos IP e localhost, e recusamos nome DNS — o que não
// afeta o uso real, já que o QR, o console e a tela de boas-vindas sempre
// entregam o endereço por IP.
//
// Escotilha para quem acessa por nome (mDNS tipo "meupc.local", Tailscale,
// um DNS caseiro): HOSTS_PERMITIDOS no .env, separados por vírgula.
function hostsPermitidos() {
  return (process.env.HOSTS_PERMITIDOS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

// Devolve só o nome do host, sem a porta. Trata o formato [::1]:3000 do IPv6.
function extrairHost(cabecalho) {
  if (!cabecalho) return null;
  const valor = cabecalho.trim();
  if (valor.startsWith('[')) {
    const fim = valor.indexOf(']');
    return fim === -1 ? null : valor.slice(1, fim).toLowerCase();
  }
  return valor.split(':')[0].toLowerCase();
}

function hostAceito(cabecalho) {
  const host = extrairHost(cabecalho);
  if (!host) return false;
  // net.isIP cobre IPv4 e IPv6 sem regex de mentira.
  if (net.isIP(host) !== 0) return true;
  if (host === 'localhost') return true;
  return hostsPermitidos().includes(host);
}

function exigirHostConhecido(req, res, next) {
  if (hostAceito(req.headers.host)) {
    next();
    return;
  }
  res.status(403).json({
    ok: false,
    erro:
      'Requisição recusada: o Deckly só responde quando acessado por endereço IP ' +
      '(ex.: http://192.168.0.15:3000) ou localhost. Se você acessa por um nome, ' +
      'acrescente-o em HOSTS_PERMITIDOS no .env.',
  });
}

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

module.exports = { exigirToken, exigirLocal, exigirHostConhecido, ehLocal };
