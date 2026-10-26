// Service worker mínimo: só o necessário para o PWA ser instalável e
// funcionar em rede instável. Só arquivo estático é cacheado; requisição
// dinâmica (ações, listas, WS, config) sempre vai direto para a rede.

// A versão serve para descartar o cache antigo no `activate`. Ela NÃO é mais
// a única linha de defesa contra arquivo velho: veja a estratégia do `fetch`
// mais abaixo. Depender de subir isto à mão já falhou uma vez, e o sintoma é
// péssimo de diagnosticar — CSS novo com JS antigo deixa a tela meio
// quebrada, sem erro nenhum no console.
const CACHE_NOME = 'deckly-v15';
const ARQUIVOS_ESTATICOS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js',
  '/js/editor-layout.js',
  '/js/token.js',
  '/js/ws-client.js',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE_NOME).then((cache) => cache.addAll(ARQUIVOS_ESTATICOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((chave) => chave !== CACHE_NOME).map((chave) => caches.delete(chave))))
      .then(() => self.clients.claim()),
  );
});

// Rede primeiro, cache como reserva.
//
// Era o contrário (cache primeiro), e isso trocava um problema por outro: o
// deck sempre abria rápido, mas ficava preso na versão gravada no aparelho
// até alguém lembrar de subir o CACHE_NOME. Quando esquecido, o tablet
// misturava CSS novo com JS antigo e a interface quebrava em silêncio.
//
// O servidor está na mesma LAN, então buscar da rede custa alguns
// milissegundos — e o cache continua salvando o caso que motivou o service
// worker: Wi-Fi caindo ou PC ainda subindo.
//
// O QUE vai para o cache é decidido por lista positiva: só arquivo estático
// da própria origem (página, script, estilo, imagem, manifesto, fonte). Antes
// era "tudo que não for /api, /action ou /ws", e isso guardava no disco do
// tablet as listas autenticadas — títulos de janela do PC, canais do
// Discord, entidades da casa — e fazia o cache crescer a cada URL nova.
const DESTINOS_ESTATICOS = new Set(['document', 'script', 'style', 'image', 'manifest', 'font']);

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;
  if (!DESTINOS_ESTATICOS.has(pedido.destination)) return;

  // A chave do cache é a URL SEM query: o link de pareamento (/?token=…)
  // senão gravaria o token na chave do Cache Storage.
  const chave = url.origin + url.pathname;

  evento.respondWith(
    fetch(pedido)
      .then((resposta) => {
        // Só guarda resposta boa: cachear um 404 do servidor subindo
        // deixaria o erro grudado no aparelho.
        if (resposta && resposta.ok) {
          const copia = resposta.clone();
          caches.open(CACHE_NOME).then((cache) => cache.put(chave, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(chave)),
  );
});
