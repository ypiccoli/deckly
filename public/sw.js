// Service worker mínimo: só o necessário para o PWA ser instalável e
// funcionar em rede instável. Requisições dinâmicas (ações, WS, config)
// nunca são cacheadas — sempre vão direto para a rede.

const CACHE_NOME = 'stream-deck-web-v7';
const ARQUIVOS_ESTATICOS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/app.js',
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

self.addEventListener('fetch', (evento) => {
  const url = new URL(evento.request.url);

  const ehDinamico =
    url.pathname.startsWith('/action') || url.pathname.startsWith('/api') || url.pathname.startsWith('/ws');
  if (ehDinamico || evento.request.method !== 'GET') return;

  evento.respondWith(caches.match(evento.request).then((resposta) => resposta || fetch(evento.request)));
});
