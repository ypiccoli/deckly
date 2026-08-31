// Cliente WebSocket: mantém conexão com o servidor e reconecta sozinho.
// Expõe window.clienteWs.aoReceberMensagem(fn) para o app.js escutar o estado ao vivo.

// Espera entre tentativas de reconexão: começa curta (queda de Wi-Fi do
// tablet volta rápido) e cresce até meio minuto.
const ESPERA_INICIAL_MS = 2000;
const ESPERA_MAXIMA_MS = 30000;

class ClienteWs {
  constructor() {
    this.socket = null;
    this.ouvintes = new Set();
    this.ouvintesConexao = new Set();
    // Não conecta no construtor: sem token o servidor derruba o socket, e
    // ficaríamos num ciclo de reconexão inútil antes do pareamento. Quem
    // chama conectar() é o app.js, depois de garantir que há token.
    // Guarda o último estado conhecido para "repetir" a quem se inscrever
    // depois que ele já aconteceu — sem isso, se o WS conectar (ou mandar o
    // estado_completo) antes do app.js terminar de buscar /api/config e se
    // inscrever, a notificação se perde e a UI fica presa em "conectando…".
    this.conectado = false;
    this.ultimaMensagemCompleta = null;
    this.esperaMs = ESPERA_INICIAL_MS;
  }

  conectar() {
    if (this.socket) return;
    this._conectar();
  }

  _conectar() {
    const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
    // O token vai na query: o handshake de WebSocket do navegador não
    // permite mandar header.
    const url = window.acesso.paraWs(`${protocolo}://${location.host}/ws`);
    this.socket = new WebSocket(url);

    this.socket.addEventListener('open', () => {
      this.esperaMs = ESPERA_INICIAL_MS;
      this._notificarConexao(true);
    });

    this.socket.addEventListener('message', (evento) => {
      try {
        const mensagem = JSON.parse(evento.data);
        if (mensagem.tipo === 'estado_completo') {
          this.ultimaMensagemCompleta = mensagem;
        }
        this.ouvintes.forEach((fn) => fn(mensagem));
      } catch (erro) {
        console.error('WS: mensagem inválida recebida', erro);
      }
    });

    this.socket.addEventListener('close', () => {
      this._notificarConexao(false);
      this.socket = null;
      // Espera crescente, e não 2s fixos: se o token não vale mais (trocado
      // no servidor, aparelho despareado), insistir de 2 em 2 segundos só
      // faria o servidor bloquear este aparelho por tentativas demais. Volta
      // ao mínimo assim que uma conexão abre.
      setTimeout(() => this._conectar(), this.esperaMs);
      this.esperaMs = Math.min(this.esperaMs * 2, ESPERA_MAXIMA_MS);
    });

    this.socket.addEventListener('error', () => {
      this.socket.close();
    });
  }

  _notificarConexao(conectado) {
    this.conectado = conectado;
    this.ouvintesConexao.forEach((fn) => fn(conectado));
  }

  aoReceberMensagem(fn) {
    this.ouvintes.add(fn);
    if (this.ultimaMensagemCompleta) fn(this.ultimaMensagemCompleta);
  }

  aoMudarConexao(fn) {
    this.ouvintesConexao.add(fn);
    fn(this.conectado);
  }
}

window.clienteWs = new ClienteWs();
