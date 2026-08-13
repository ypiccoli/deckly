// Cliente WebSocket: mantém conexão com o servidor e reconecta sozinho.
// Expõe window.clienteWs.aoReceberMensagem(fn) para o app.js escutar o estado ao vivo.

class ClienteWs {
  constructor() {
    this.socket = null;
    this.ouvintes = new Set();
    this.ouvintesConexao = new Set();
    // Guarda o último estado conhecido para "repetir" a quem se inscrever
    // depois que ele já aconteceu — sem isso, se o WS conectar (ou mandar o
    // estado_completo) antes do app.js terminar de buscar /api/config e se
    // inscrever, a notificação se perde e a UI fica presa em "conectando…".
    this.conectado = false;
    this.ultimaMensagemCompleta = null;
    this._conectar();
  }

  _conectar() {
    const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${protocolo}://${location.host}/ws`;
    this.socket = new WebSocket(url);

    this.socket.addEventListener('open', () => this._notificarConexao(true));

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
      setTimeout(() => this._conectar(), 2000);
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
