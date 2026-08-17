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
  const { exigirToken } = require('./lib/auth');
  const { conferir: conferirToken, ORIGEM: ORIGEM_TOKEN } = require('./lib/token');
  const mostrarBoasVindas = require('./lib/boas-vindas');
  const abrirNoNavegador = require('./lib/abrir-navegador');

  const media = require('./integrations/media');
  const obs = require('./integrations/obs');
  const spotify = require('./integrations/spotify');
  const hue = require('./integrations/hue');
  const atalhos = require('./integrations/atalhos');
  const discord = require('./integrations/discord');
  const homeassistant = require('./integrations/homeassistant');

  const integracoes = { media, obs, spotify, hue, atalhos, discord, homeassistant };

  const app = express();
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
  const wss = new WebSocket.Server({ server: servidorHttp, path: '/ws' });

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
    const url = new URL(req.url, 'http://localhost');
    if (!conferirToken(url.searchParams.get('token'))) {
      socket.close(4001, 'Token de acesso inválido');
      return;
    }
    socket.send(JSON.stringify({ tipo: 'estado_completo', dados: estadoGlobal }));
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
    const { urlLocal } = mostrarBoasVindas(PORTA);

    // Rodando em segundo plano quem cuida disso é o processo lançador, que
    // ainda tem console e navegador na mão — aqui só encheria o log.
    if (segundoPlano.ehFilho()) return;

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
