// Servidor do Deckly: Express (HTTP + API) + WebSocket (estado ao vivo).

const http = require('http');
const express = require('express');
const WebSocket = require('ws');

// Antes de qualquer outra coisa: no modo empacotado, grava na pasta de dados
// o que veio embutido no .exe (public/, scripts/*.ps1, modelo de config).
// Tem que vir antes dos requires abaixo, porque eles já leem config e token
// de dentro dessa pasta.
const caminhos = require('./lib/caminhos');
caminhos.prepararArquivos();

require('dotenv').config({ path: caminhos.env });

const segundoPlano = require('./lib/segundo-plano');

const PORTA = process.env.PORT || 3000;

// No .exe, este processo pode ser só o lançador: ele relança o servidor
// destacado do console (para a pessoa poder fechar o cmd), imprime o token e
// sai. Quando isso acontece, nada abaixo deve rodar — quem sobe o servidor é
// o processo filho, que passa direto por aqui.
if (!segundoPlano.talvezLancarEmSegundoPlano(PORTA)) {
  iniciarServidor();
}

function iniciarServidor() {
  const criarRotaAcoes = require('./routes/actions');
  const criarRotaConfig = require('./routes/config');
  const criarRotaSpotifyAuth = require('./routes/spotify-auth');
  const criarRotaAtalhos = require('./routes/atalhos');
  const criarRotaMedia = require('./routes/media');
  const criarRotaDiscord = require('./routes/discord');
  const criarRotaHomeAssistant = require('./routes/homeassistant');
  const criarRotaBemVindo = require('./routes/bemvindo');
  const criarRotaIntegracoes = require('./routes/integracoes');
  const criarRotaFavoritos = require('./routes/favoritos');
  const criarRotaLayout = require('./routes/layout');
  const {
    exigirToken,
    exigirHostConhecido,
    hostAceito,
    bloqueioRestante,
    registrarFalha,
    registrarSucesso,
  } = require('./lib/auth');
  const { conferir: conferirToken, ORIGEM: ORIGEM_TOKEN } = require('./lib/token');
  const mostrarBoasVindas = require('./lib/boas-vindas');
  const { redigir } = require('./lib/segredos');
  const abrirNoNavegador = require('./lib/abrir-navegador');

  const media = require('./integrations/media');
  const obs = require('./integrations/obs');
  const spotify = require('./integrations/spotify');
  const atalhos = require('./integrations/atalhos');
  const discord = require('./integrations/discord');
  const homeassistant = require('./integrations/homeassistant');

  const integracoes = { media, obs, spotify, atalhos, discord, homeassistant };

  // Erro fatal precisa deixar rastro. Rodando empacotado em segundo plano não
  // há console: o processo morre, o deck para de responder e o deckly.log fica
  // sem a causa. A mensagem passa por redigir() porque erro de integração pode
  // trazer credencial dentro (o Discord devolve o token junto com "Invalid
  // access token") — mesmo cuidado de routes/actions.js.
  process.on('uncaughtException', (erro) => {
    console.error(`[fatal] ${new Date().toLocaleString('pt-BR')} — ${redigir(erro && erro.message)}`);
    console.error(redigir(erro && erro.stack ? erro.stack : String(erro)));
    // Sai mesmo assim: seguir rodando depois de uma exceção não tratada é
    // seguir com estado imprevisível, e o pior defeito possível aqui é um
    // deck que responde mas mente sobre o que aconteceu.
    process.exit(1);
  });

  // Promessa rejeitada e não tratada só é registrada — não derruba. As
  // integrações têm promessas soltas de propósito (a reconexão do OBS, o RPC
  // do Discord), e matar o servidor porque o OBS caiu seria uma regressão.
  process.on('unhandledRejection', (motivo) => {
    const texto = motivo instanceof Error ? motivo.stack || motivo.message : String(motivo);
    console.error(`[promessa] Rejeição não tratada: ${redigir(texto)}`);
  });

  const app = express();

  // Primeiro middleware de todos, inclusive antes dos estáticos: recusa
  // requisição vinda por nome DNS, que é o que um ataque de DNS rebinding
  // precisa para transformar o navegador do usuário em ponte até aqui. Veja
  // a explicação longa em lib/auth.js.
  app.use(exigirHostConhecido);

  // Cabeçalhos de segurança. O CSP é a rede de proteção para o próximo XSS:
  // não há <script> inline no projeto, então script-src 'self' cabe sem
  // quebrar nada. 'unsafe-inline' fica só no estilo (atributos style= das
  // páginas de OAuth e o --cor-botao dos botões). O avatar do card "Em
  // chamada" é a única imagem de fora (CDN do Discord).
  //
  // frame-ancestors/X-Frame-Options: sem eles, um site podia emoldurar
  // /bemvindo/ ou /config/ e induzir o clique em "Encerrar servidor" ou
  // "Salvar" por baixo de outra coisa.
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https://cdn.discordapp.com; connect-src 'self' ws: wss:; " +
        "frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  app.use(express.json());

  // Os arquivos estáticos ficam abertos de propósito: HTML, CSS e JS não têm
  // segredo nenhum, e a página precisa carregar para poder pedir o token a
  // quem ainda não pareou. O que é protegido é a API abaixo.
  app.use(express.static(caminhos.publico));

  // Declarada aqui e definida mais abaixo (depois que o WebSocket existe):
  // a rota de config precisa avisar os clientes quando o layout muda.
  let avisarConfigAtualizada = () => {};

  // Antes do /api protegido: a tela de boas-vindas é onde o token é revelado,
  // então ela não pode exigir token. Ela se protege por só responder no
  // próprio PC. Como este router só trata /bemvindo, o resto de /api segue
  // para o middleware de token logo abaixo.
  app.use('/api', criarRotaBemVindo(PORTA));
  app.use('/api', exigirToken, criarRotaConfig(integracoes, () => avisarConfigAtualizada()));
  app.use('/api', exigirToken, criarRotaIntegracoes(integracoes));
  // Favoritar é uso normal do deck (vem do tablet), então só exige token —
  // não exigirLocal, ao contrário do que reconfigura o app.
  app.use('/api', exigirToken, criarRotaFavoritos());
  // Mesma lógica: o modo de edição de layout roda no tablet, e esta rota não
  // consegue mexer em ação nem integração — veja routes/layout.js.
  app.use('/api', exigirToken, criarRotaLayout(integracoes, () => avisarConfigAtualizada()));
  app.use('/action', exigirToken, criarRotaAcoes(integracoes));
  app.use('/atalhos', exigirToken, criarRotaAtalhos());
  app.use('/media', exigirToken, criarRotaMedia());
  // Mesmo caso do /spotify: a rota de autorização é aberta pelo navegador
  // como link comum, sem header de token. Ela se protege por exigirLocal;
  // as listagens exigem token dentro do próprio router.
  app.use('/discord', criarRotaDiscord());
  app.use('/homeassistant', criarRotaHomeAssistant());
  // O /spotify tem uma particularidade: as rotas de OAuth não podem exigir
  // token, porque o Spotify redireciona o navegador de volta para /callback
  // sem ele. Elas se protegem por outro caminho (só respondem no próprio PC),
  // tratado dentro da própria rota.
  app.use('/spotify', criarRotaSpotifyAuth());

  const servidorHttp = http.createServer(app);
  // O servidor nunca lê mensagem do cliente — o WebSocket é só de ida. Sem
  // maxPayload, o padrão do `ws` aceitaria quadros de até 100 MiB.
  const wss = new WebSocket.Server({ server: servidorHttp, path: '/ws', maxPayload: 4 * 1024 });
  // O `ws` repassa os erros do servidor HTTP (porta ocupada, por exemplo)
  // como 'error' do wss. Sem listener aqui isso virava exceção não tratada
  // ANTES do servidorHttp.on('error') abaixo, e a mensagem "o Deckly já está
  // rodando?" nunca aparecia. Quem trata é o handler do HTTP.
  wss.on('error', () => {});

  // Integrações que fazem polling (Spotify) param quando não há nenhum tablet
  // olhando. Hook opcional: quem não tem definirAudiencia ignora.
  function avisarAudiencia() {
    const temAlguem = wss.clients.size > 0;
    for (const integracao of Object.values(integracoes)) {
      if (typeof integracao.definirAudiencia === 'function') integracao.definirAudiencia(temAlguem);
    }
  }

  // Estado global: espelha o estado de cada integração, é enviado por completo
  // quando um cliente conecta e atualizado via broadcast a cada mudança.
  const estadoGlobal = {};
  for (const [nomeIntegracao, integracao] of Object.entries(integracoes)) {
    estadoGlobal[nomeIntegracao] = integracao.estado;
    integracao.on('estado', (novoEstado) => {
      estadoGlobal[nomeIntegracao] = novoEstado;
      transmitir({ tipo: 'estado', integracao: nomeIntegracao, dados: novoEstado });
    });
  }

  function transmitir(mensagem) {
    const payload = JSON.stringify(mensagem);
    wss.clients.forEach((cliente) => {
      if (cliente.readyState === WebSocket.OPEN) cliente.send(payload);
    });
  }

  // O WebSocket carrega o estado ao vivo (o que está tocando, cena do OBS,
  // volume), então também precisa de token. Um navegador não consegue mandar
  // header no handshake de WebSocket — por isso ele vai na query string.
  wss.on('connection', (socket, req) => {
    // PRIMEIRA coisa, antes de qualquer checagem: um quadro malformado (ou
    // maior que o maxPayload) vira evento 'error' no socket, e sem listener
    // isso é exceção não tratada — o processo morria. Bastavam 6 bytes vindos
    // de qualquer aparelho da rede, SEM token, logo depois do handshake: o
    // close() da recusa ainda está em andamento quando o quadro chega.
    socket.on('error', () => socket.terminate());
    // O handshake de WebSocket é um "upgrade", e upgrade não passa pelos
    // middlewares do Express — nem pelo exigirHostConhecido. Então a mesma
    // recusa de nome DNS é aplicada aqui à mão, senão sobraria um caminho
    // por onde uma página maliciosa alcançaria o servidor pelo nome dela.
    if (!hostAceito(req.headers.host)) {
      socket.close(4003, 'Acesse por endereço IP');
      return;
    }

    const ip = req.socket.remoteAddress;
    if (bloqueioRestante(ip) > 0) {
      socket.close(4029, 'Tentativas de token demais');
      return;
    }

    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (!conferirToken(token)) {
      // Só conta como tentativa quando veio token: o cliente sem token
      // nenhum é o que ainda não pareou, e ele não deve se trancar sozinho.
      if (token) registrarFalha(ip);
      socket.close(4001, 'Token de acesso inválido');
      return;
    }
    registrarSucesso(ip);
    socket.send(JSON.stringify({ tipo: 'estado_completo', dados: estadoGlobal }));
    avisarAudiencia();
    // No 'close' o socket já saiu de wss.clients, então a contagem bate.
    socket.on('close', avisarAudiencia);
  });

  // Chamada pela rota PUT /api/config depois de gravar: cada cliente rebusca
  // /api/config e se re-renderiza, sem precisar reiniciar o servidor.
  avisarConfigAtualizada = () => {
    transmitir({ tipo: 'config_atualizado' });
  };

  // A porta já pode estar ocupada por uma instância anterior (ou por outro
  // programa). Sem isto o processo morreria com um stack trace — no modo
  // segundo plano, dentro do log, onde ninguém acha.
  servidorHttp.on('error', (erro) => {
    if (erro.code === 'EADDRINUSE') {
      console.error(`Porta ${PORTA} já está em uso — o Deckly já está rodando?`);
      console.error('Encerre a instância anterior ou mude PORT no .env.');
    } else {
      console.error(`Falha ao subir o servidor: ${erro.message}`);
    }
    process.exit(1);
  });

  // A porta HTTP sobe imediatamente — não espera as integrações. Cada
  // integração inicializa em segundo plano e só reflete no app quando estiver
  // pronta (via o mesmo evento 'estado' de sempre). Isso evita que uma
  // integração lenta ou indisponível (ex.: OBS fechado, cuja tentativa de
  // conexão pode demorar bem mais que o normal para dar timeout dependendo da
  // rede) trave a subida do servidor inteiro.
  servidorHttp.listen(PORTA, '0.0.0.0', () => {
    // Rodando em segundo plano quem cuida das boas-vindas é o processo
    // lançador, que ainda tem console e navegador na mão. Aqui a saída vai
    // para o deckly.log, e o banner leva o token de acesso, a URL de
    // pareamento e o QR junto — arquivo que o CONTRIBUTING pede anexado em
    // issue pública. Do filho sai só a linha que diz que o servidor subiu.
    if (segundoPlano.ehFilho()) {
      console.log(`Deckly rodando na porta ${PORTA}.`);
      return;
    }

    const { urlLocal } = mostrarBoasVindas(PORTA);

    // Abre a tela de boas-vindas sozinha quando é a PRIMEIRA execução (o
    // token acabou de ser gerado) — é o momento em que a pessoa precisa ver o
    // token e o QR, e é o caso de quem acabou de receber o programa. Nas
    // vezes seguintes fica quieto, para não abrir uma aba a cada boot do PC.
    // ABRIR_NAVEGADOR no .env força "sempre" ou "nunca".
    const preferencia = (process.env.ABRIR_NAVEGADOR || 'primeira').toLowerCase();
    const primeiraVez = ORIGEM_TOKEN === 'gerado agora';
    if (preferencia === 'sempre' || (preferencia === 'primeira' && primeiraVez)) {
      abrirNoNavegador(`${urlLocal}/bemvindo/`);
    }
  });

  for (const integracao of Object.values(integracoes)) {
    if (!integracao.inicializar) continue;
    integracao.inicializar().catch((erro) => {
      console.warn(`[${integracao.nome}] erro ao inicializar: ${erro.message}`);
    });
  }
}
