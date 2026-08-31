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
//
// Há ainda um limite de tentativas do token (mais abaixo) e a recusa de
// requisição vinda por nome DNS (exigirHostConhecido, logo em seguida).

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

// ---------------------------------------------------------------------------
// Limite de tentativas do token.
//
// Não há cadastro nem login aqui: o token É a tranca. São 16 caracteres de um
// alfabeto de 32 (~80 bits), então adivinhar por força bruta é inviável mesmo
// sem limite — mas "inviável" depende do tamanho do token continuar como está,
// e um aparelho da LAN tentando sem parar também é ruído no log e trabalho
// inútil para o servidor.
//
// Só falha conta. Requisição SEM token nenhum não entra na conta: a tela de
// pareamento e o service worker batem na API antes de ter token, e trancar
// alguém por causa disso quebraria justamente o primeiro acesso.
//
// O PRÓPRIO PC é isento, e isso não é um furo: quem roda ali já pode abrir o
// config/token.json e ler o token, então limitar chute nenhum protege. O que
// se ganha isentando é grande — sem isso, errar o token dez vezes na tela de
// pareamento do próprio PC trancava junto a tela de configuração e o botão
// "Encerrar servidor", que é o único jeito normal de desligar quando o
// programa roda em segundo plano. A trava vale para quem vem pela rede, que é
// exatamente o que o SECURITY.md diz que ela existe para conter.
// (O caminho "site malicioso usando o navegador do usuário", que também
// chegaria como 127.0.0.1, já é barrado antes pelo exigirHostConhecido.)
//
// Sem setInterval de propósito: o processo fica dias no ar, e um timer
// pendurado só para limpar um Map de duas entradas é ruído. A limpeza é
// preguiçosa, feita na própria tentativa.
const LIMITE_FALHAS = 10;
const BLOQUEIO_INICIAL_MS = 60 * 1000;
const BLOQUEIO_MAXIMO_MS = 15 * 60 * 1000;
// Falhas param de contar depois deste tempo sem nenhuma nova: quem errou de
// digitação três vezes ontem não deve começar o dia mais perto do bloqueio.
const MEMORIA_MS = 10 * 60 * 1000;

const tentativas = new Map();

function _limpar(agora) {
  for (const [ip, dados] of tentativas) {
    if (dados.ate > agora) continue;
    if (agora - dados.ultima < MEMORIA_MS) continue;
    tentativas.delete(ip);
  }
}

// Milissegundos restantes de bloqueio (0 = liberado).
function bloqueioRestante(ip) {
  if (ENDERECOS_LOCAIS.has(ip)) return 0;
  const dados = tentativas.get(ip);
  if (!dados) return 0;
  const restante = dados.ate - Date.now();
  return restante > 0 ? restante : 0;
}

function registrarFalha(ip) {
  if (ENDERECOS_LOCAIS.has(ip)) return;
  const agora = Date.now();
  _limpar(agora);

  const dados = tentativas.get(ip) || { falhas: 0, ate: 0, espera: 0, ultima: agora };
  // Falha isolada, muito depois da anterior: recomeça a contagem.
  if (agora - dados.ultima > MEMORIA_MS) dados.falhas = 0;

  dados.falhas += 1;
  dados.ultima = agora;

  if (dados.falhas >= LIMITE_FALHAS) {
    // Cada bloqueio novo dobra o anterior, até o teto. Insistir fica caro
    // depressa, e quem errou de digitação espera um minuto.
    dados.espera = Math.min(dados.espera ? dados.espera * 2 : BLOQUEIO_INICIAL_MS, BLOQUEIO_MAXIMO_MS);
    dados.ate = agora + dados.espera;
    dados.falhas = 0;
    console.warn(
      `[acesso] ${dados.espera / 1000}s de bloqueio para ${ip}: ${LIMITE_FALHAS} tentativas de token erradas.`,
    );
  }

  tentativas.set(ip, dados);
}

function registrarSucesso(ip) {
  tentativas.delete(ip);
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
  const ip = req.socket.remoteAddress;
  const restante = bloqueioRestante(ip);
  if (restante > 0) {
    const segundos = Math.ceil(restante / 1000);
    res.set('Retry-After', String(segundos));
    // precisaToken junto de propósito: o frontend já sabe mostrar a tela de
    // pareamento com esta forma de resposta (public/js/token.js), e é lá que
    // a pessoa vai ler o motivo.
    res.status(429).json({
      ok: false,
      erro: `Tentativas de token demais. Tente de novo em ${segundos}s.`,
      precisaToken: true,
    });
    return;
  }

  const informado = extrairToken(req);
  // Sem token nenhum não conta como tentativa: é o estado normal de quem
  // ainda não pareou o aparelho.
  if (!informado) {
    res.status(401).json({ ok: false, erro: 'Token de acesso não informado.', precisaToken: true });
    return;
  }
  if (!conferir(informado)) {
    registrarFalha(ip);
    res.status(401).json({ ok: false, erro: 'Token de acesso inválido.', precisaToken: true });
    return;
  }
  registrarSucesso(ip);
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

module.exports = {
  exigirToken,
  exigirLocal,
  exigirHostConhecido,
  ehLocal,
  hostAceito,
  bloqueioRestante,
  registrarFalha,
  registrarSucesso,
};
