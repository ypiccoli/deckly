// Servidor do Stream Deck Web: Express (HTTP + API) + WebSocket (estado ao vivo).

require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const criarRotaAcoes = require('./routes/actions');
const criarRotaConfig = require('./routes/config');
const criarRotaSpotifyAuth = require('./routes/spotify-auth');
const criarRotaAtalhos = require('./routes/atalhos');
const { exigirToken } = require('./lib/auth');
const { conferir: conferirToken } = require('./lib/token');
const mostrarBoasVindas = require('./lib/boas-vindas');

const media = require('./integrations/media');
const obs = require('./integrations/obs');
const spotify = require('./integrations/spotify');
const hue = require('./integrations/hue');
const atalhos = require('./integrations/atalhos');

const integracoes = { media, obs, spotify, hue, atalhos };

const app = express();
app.use(express.json());

// Os arquivos estáticos ficam abertos de propósito: HTML, CSS e JS não têm
// segredo nenhum, e a página precisa carregar para poder pedir o token a
// quem ainda não pareou. O que é protegido é a API abaixo.
app.use(express.static(path.join(__dirname, '..', 'public')));

// Declarada aqui e definida mais abaixo (depois que o WebSocket existe):
// a rota de config precisa avisar os clientes quando o layout muda.
let avisarConfigAtualizada = () => {};

app.use('/api', exigirToken, criarRotaConfig(integracoes, () => avisarConfigAtualizada()));
app.use('/action', exigirToken, criarRotaAcoes(integracoes));
app.use('/atalhos', exigirToken, criarRotaAtalhos());
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

const PORTA = process.env.PORT || 3000;

// A porta HTTP sobe imediatamente — não espera as integrações. Cada
// integração inicializa em segundo plano e só reflete no app quando estiver
// pronta (via o mesmo evento 'estado' de sempre). Isso evita que uma
// integração lenta ou indisponível (ex.: OBS fechado, cuja tentativa de
// conexão pode demorar bem mais que o normal para dar timeout dependendo da
// rede) trave a subida do servidor inteiro.
servidorHttp.listen(PORTA, '0.0.0.0', () => {
  mostrarBoasVindas(PORTA);
});

for (const integracao of Object.values(integracoes)) {
  if (!integracao.inicializar) continue;
  integracao.inicializar().catch((erro) => {
    console.warn(`[${integracao.nome}] erro ao inicializar: ${erro.message}`);
  });
}

module.exports = app;
