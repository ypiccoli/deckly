// Cliente do RPC local do Discord (IPC por named pipe).
//
// É por aqui que dá para saber o estado de verdade (mudo, surdo, em qual
// canal você está) e agir sem simular teclado. O modo de atalhos continua
// existindo porque este exige que a pessoa crie um app no portal de
// desenvolvedores do Discord — veja o README.
//
// PROTOCOLO
//
// O Discord expõe um named pipe local. Cada quadro é:
//
//   [ 4 bytes opcode LE ][ 4 bytes tamanho LE ][ payload JSON UTF-8 ]
//
// Opcodes: 0 HANDSHAKE, 1 FRAME (dados), 2 CLOSE, 3 PING, 4 PONG.
//
// A conversa é: HANDSHAKE com o client_id -> o Discord responde READY ->
// AUTHORIZE (a pessoa aprova numa janela do próprio Discord) -> troca do
// código por um access_token no endpoint OAuth normal -> AUTHENTICATE. Só
// depois disso os comandos valem.
//
// O access token vale 7 dias. A aprovação só precisa acontecer uma vez
// porque a mesma troca devolve um refresh token, e `renovarToken()` compra
// um access token novo com ele sem interromper ninguém.
//
// Cada comando leva um `nonce`; a resposta volta com o mesmo nonce, e é
// assim que pedidos concorrentes não se confundem. Eventos assinados
// (SUBSCRIBE) chegam sem nonce, com `evt` preenchido.

const net = require('net');
const { randomUUID } = require('crypto');

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

const TEMPO_LIMITE_COMANDO_MS = 15000;
// O AUTHORIZE espera a pessoa clicar "Autorizar" numa janela do Discord.
const TEMPO_LIMITE_AUTORIZACAO_MS = 120000;

const URL_TOKEN = 'https://discord.com/api/oauth2/token';

// O Discord abre até 10 pipes (ipc-0 a ipc-9); o primeiro que aceitar vale.
// Vários existem para permitir mais de um cliente Discord aberto.
function caminhosPipe() {
  const caminhos = [];
  for (let i = 0; i < 10; i++) {
    if (process.platform === 'win32') {
      caminhos.push(`\\\\?\\pipe\\discord-ipc-${i}`);
    } else {
      // No Linux/macOS o socket fica na pasta de runtime do usuário.
      const base =
        process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || '/tmp';
      caminhos.push(`${base.replace(/\/$/, '')}/discord-ipc-${i}`);
    }
  }
  return caminhos;
}

class ClienteRpcDiscord {
  constructor({ clientId, clientSecret, accessToken, refreshToken, aoMudarEstado, aoDesconectar }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = accessToken || null;
    this.refreshToken = refreshToken || null;
    this.aoMudarEstado = aoMudarEstado || (() => {});
    this.aoDesconectar = aoDesconectar || (() => {});

    this.socket = null;
    this.conectado = false;
    this.autenticado = false;
    this.usuario = null;

    this._buffer = Buffer.alloc(0);
    this._pendentes = new Map(); // nonce -> { resolve, reject, timer }
  }

  /* ---------------- transporte ---------------- */

  _enviar(opcode, dados) {
    if (!this.socket) throw new Error('RPC do Discord não está conectado.');
    const corpo = Buffer.from(JSON.stringify(dados), 'utf8');
    const cabecalho = Buffer.alloc(8);
    cabecalho.writeInt32LE(opcode, 0);
    cabecalho.writeInt32LE(corpo.length, 4);
    this.socket.write(Buffer.concat([cabecalho, corpo]));
  }

  // O pipe entrega bytes, não mensagens: um quadro pode chegar partido em
  // várias leituras, e várias leituras podem trazer vários quadros. Por isso
  // acumula e só consome quando o quadro inteiro estiver no buffer.
  _receber(pedaco) {
    this._buffer = Buffer.concat([this._buffer, pedaco]);
    while (this._buffer.length >= 8) {
      const opcode = this._buffer.readInt32LE(0);
      const tamanho = this._buffer.readInt32LE(4);
      if (this._buffer.length < 8 + tamanho) return;

      const corpo = this._buffer.subarray(8, 8 + tamanho).toString('utf8');
      this._buffer = this._buffer.subarray(8 + tamanho);

      let dados;
      try {
        dados = JSON.parse(corpo);
      } catch {
        continue;
      }
      this._tratarQuadro(opcode, dados);
    }
  }

  _tratarQuadro(opcode, dados) {
    if (opcode === OP_PING) {
      this._enviar(OP_PONG, dados);
      return;
    }
    if (opcode === OP_CLOSE) {
      this._encerrar(new Error(dados.message || 'Discord fechou a conexão RPC.'));
      return;
    }
    if (opcode !== OP_FRAME) return;

    // Resposta de um comando que enviamos.
    if (dados.nonce && this._pendentes.has(dados.nonce)) {
      const { resolve, reject, timer } = this._pendentes.get(dados.nonce);
      this._pendentes.delete(dados.nonce);
      clearTimeout(timer);
      if (dados.evt === 'ERROR') {
        reject(new Error(dados.data?.message || 'Erro no RPC do Discord.'));
      } else {
        resolve(dados.data);
      }
      return;
    }

    // Evento assinado (chega sozinho, sem nonce).
    if (dados.evt === 'READY') {
      this.conectado = true;
      return;
    }
    if (dados.evt) {
      this.aoMudarEstado(dados.evt, dados.data);
    }
  }

  _comando(cmd, args, { evt, tempoLimite = TEMPO_LIMITE_COMANDO_MS } = {}) {
    return new Promise((resolve, reject) => {
      const nonce = randomUUID();
      const timer = setTimeout(() => {
        this._pendentes.delete(nonce);
        reject(new Error(`O Discord não respondeu a "${cmd}" em ${tempoLimite / 1000}s.`));
      }, tempoLimite);
      this._pendentes.set(nonce, { resolve, reject, timer });

      try {
        this._enviar(OP_FRAME, { cmd, args, nonce, ...(evt ? { evt } : {}) });
      } catch (erro) {
        clearTimeout(timer);
        this._pendentes.delete(nonce);
        reject(erro);
      }
    });
  }

  _encerrar(erro) {
    for (const { reject, timer } of this._pendentes.values()) {
      clearTimeout(timer);
      reject(erro || new Error('Conexão RPC encerrada.'));
    }
    this._pendentes.clear();

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    const estavaConectado = this.conectado;
    this.conectado = false;
    this.autenticado = false;
    if (estavaConectado) this.aoDesconectar(erro);
  }

  desconectar() {
    this._encerrar(null);
  }

  /* ---------------- conexão ---------------- */

  _abrirPipe() {
    const caminhos = caminhosPipe();
    return new Promise((resolve, reject) => {
      const tentar = (indice) => {
        if (indice >= caminhos.length) {
          const erro = new Error(
            'Não achei o Discord rodando neste PC. Abra o aplicativo do Discord ' +
              '(a versão web não expõe o canal local).',
          );
          // Quem chama precisa distinguir "Discord fechado" de "token
          // vencido" para dizer o que fazer — e casar a mensagem por string
          // quebraria na primeira vez que ela fosse reescrita.
          erro.codigo = 'discord_fechado';
          reject(erro);
          return;
        }
        const socket = net.connect(caminhos[indice]);
        socket.once('error', () => {
          socket.destroy();
          tentar(indice + 1);
        });
        socket.once('connect', () => {
          socket.removeAllListeners('error');
          resolve(socket);
        });
      };
      tentar(0);
    });
  }

  async conectar() {
    if (this.conectado) return;
    this.socket = await this._abrirPipe();
    this.socket.on('data', (p) => this._receber(p));
    this.socket.on('error', (e) => this._encerrar(e));
    this.socket.on('close', () => this._encerrar(new Error('Discord desconectou.')));

    // O READY chega como quadro sem nonce; esperamos por ele antes de seguir.
    const pronto = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('O Discord não respondeu ao handshake.')),
        TEMPO_LIMITE_COMANDO_MS,
      );
      const checar = setInterval(() => {
        if (this.conectado) {
          clearInterval(checar);
          clearTimeout(timer);
          resolve();
        }
      }, 50);
    });

    this._enviar(OP_HANDSHAKE, { v: 1, client_id: this.clientId });
    await pronto;
  }

  // Endpoint OAuth normal (HTTP, não o pipe): serve tanto para trocar o
  // código pela primeira dupla de tokens quanto para renovar depois.
  async _trocarToken(campos, oQueEstavaFazendo) {
    const resposta = await fetch(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        ...campos,
      }),
    });
    if (!resposta.ok) {
      throw new Error(`Falha ao ${oQueEstavaFazendo} (${resposta.status}): ${await resposta.text()}`);
    }

    const dados = await resposta.json();
    this.accessToken = dados.access_token;
    // O Discord ROTACIONA o refresh token: cada renovação devolve um novo e
    // invalida o anterior. Guardar o novo não é otimização — sem isso a
    // renovação seguinte falharia.
    if (dados.refresh_token) this.refreshToken = dados.refresh_token;
    return { accessToken: this.accessToken, refreshToken: this.refreshToken };
  }

  // Devolve a dupla de tokens. Abre uma janela de aprovação no Discord — por
  // isso o prazo generoso.
  async autorizar(escopos) {
    const { code } = await this._comando(
      'AUTHORIZE',
      { client_id: this.clientId, scopes: escopos },
      { tempoLimite: TEMPO_LIMITE_AUTORIZACAO_MS },
    );

    return this._trocarToken(
      {
        grant_type: 'authorization_code',
        code,
        // O Discord exige o campo, mas no fluxo RPC ele não redireciona
        // nada; qualquer URI cadastrada no app serve.
        redirect_uri: 'http://127.0.0.1',
      },
      'trocar o código por token',
    );
  }

  // O access token do Discord vale 7 dias; o refresh token é o que evita
  // pedir a aprovação de novo toda semana.
  async renovarToken() {
    if (!this.refreshToken) {
      throw new Error('Não há refresh token guardado para renovar a autorização do Discord.');
    }
    try {
      return await this._trocarToken(
        { grant_type: 'refresh_token', refresh_token: this.refreshToken },
        'renovar a autorização do Discord',
      );
    } catch (erro) {
      // Renovação recusada é fim de linha automático: o refresh token foi
      // revogado (senha trocada, app apagado) e só a pessoa resolve.
      erro.codigo = 'renovacao_recusada';
      throw erro;
    }
  }

  async autenticar() {
    let dados;
    try {
      dados = await this._comando('AUTHENTICATE', { access_token: this.accessToken });
    } catch (erro) {
      // Token vencido é o erro esperado aqui (7 dias), e o único que a
      // integração consegue consertar sozinha — daí a marca, para ela não
      // precisar reconhecer a frase do Discord.
      if (/invalid.*token|token.*(invalid|expired)/i.test(erro.message)) {
        erro.codigo = 'token_invalido';
      }
      throw erro;
    }
    this.autenticado = true;
    this.usuario = dados.user || null;
    return dados;
  }

  /* ---------------- comandos usados pela integração ---------------- */

  assinar(evento, args = {}) {
    return this._comando('SUBSCRIBE', args, { evt: evento });
  }

  obterConfiguracaoVoz() {
    return this._comando('GET_VOICE_SETTINGS', {});
  }

  definirConfiguracaoVoz(args) {
    return this._comando('SET_VOICE_SETTINGS', args);
  }

  listarServidores() {
    return this._comando('GET_GUILDS', {});
  }

  listarCanais(idServidor) {
    return this._comando('GET_CHANNELS', { guild_id: idServidor });
  }

  // channel_id null sai do canal de voz atual.
  //
  // `force` não é "entrar à força" num canal sem permissão: é o que autoriza
  // TROCAR de canal estando em outro. Sem ele o Discord recusa com "User is
  // already joined to a voice channel" — e um botão de trocar de canal só
  // funcionaria quando você já estivesse fora de qualquer canal.
  entrarNoCanal(idCanal, { forcar = false } = {}) {
    return this._comando('SELECT_VOICE_CHANNEL', { channel_id: idCanal, force: forcar });
  }

  irParaCanalDeTexto(idCanal) {
    return this._comando('SELECT_TEXT_CHANNEL', { channel_id: idCanal });
  }

  obterCanalAtual() {
    return this._comando('GET_SELECTED_VOICE_CHANNEL', {});
  }
}

module.exports = { ClienteRpcDiscord };
