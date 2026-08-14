// Servidor do Stream Deck Web: Express (HTTP + API) + WebSocket (estado ao vivo).

require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const { obterPaginas } = require('./config-loader');
const criarRotaAcoes = require('./routes/actions');
const criarRotaSpotifyAuth = require('./routes/spotify-auth');
const criarRotaAtalhos = require('./routes/atalhos');

const media = require('./integrations/media');
const obs = require('./integrations/obs');
const spotify = require('./integrations/spotify');
const hue = require('./integrations/hue');
const atalhos = require('./integrations/atalhos');

const integracoes = { media, obs, spotify, hue, atalhos };

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/config', (req, res) => {
  res.json({ paginas: obterPaginas() });
});

app.use('/action', criarRotaAcoes(integracoes));
app.use('/spotify', criarRotaSpotifyAuth());
app.use('/atalhos', criarRotaAtalhos());

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

wss.on('connection', (socket) => {
  socket.send(JSON.stringify({ tipo: 'estado_completo', dados: estadoGlobal }));
});

const PORTA = process.env.PORT || 3000;

// A porta HTTP sobe imediatamente — não espera as integrações. Cada
// integração inicializa em segundo plano e só reflete no app quando estiver
// pronta (via o mesmo evento 'estado' de sempre). Isso evita que uma
// integração lenta ou indisponível (ex.: OBS fechado, cuja tentativa de
// conexão pode demorar bem mais que o normal para dar timeout dependendo da
// rede) trave a subida do servidor inteiro.
servidorHttp.listen(PORTA, '0.0.0.0', () => {
  console.log('');
  console.log(`Stream Deck Web rodando na porta ${PORTA}`);
  console.log(`  -> Neste PC:        http://localhost:${PORTA}`);
  console.log(`  -> No tablet (LAN): http://<IP-do-PC-na-rede>:${PORTA}`);
  console.log('');
});

for (const integracao of Object.values(integracoes)) {
  if (!integracao.inicializar) continue;
  integracao.inicializar().catch((erro) => {
    console.warn(`[${integracao.nome}] erro ao inicializar: ${erro.message}`);
  });
}

module.exports = app;
