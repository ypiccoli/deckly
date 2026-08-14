// Integração com o Spotify (Web API).
//
// Fluxo de autorização (uma vez só, pela aba "Integrações" da tela de
// configuração):
//   1. Crie um app em https://developer.spotify.com/dashboard e cadastre o
//      Redirect URI que a própria tela mostra.
//   2. Cole Client ID e Client Secret na tela e salve (vai para o .env).
//   3. Clique em "Conectar ao Spotify": o servidor redireciona para lá, você
//      autoriza, e /spotify/callback (server/routes/spotify-auth.js) troca o
//      código pelo refresh token, **grava no .env e reconfigura na hora**.
//
// Nada disso exige editar arquivo nem reiniciar o servidor. O access token
// (curta duração) é renovado sozinho a partir do refresh token (longa
// duração) sempre que necessário.

const EventEmitter = require('events');

const URL_CONTAS_SPOTIFY = 'https://accounts.spotify.com';
const URL_API_SPOTIFY = 'https://api.spotify.com/v1';
const ESCOPOS = ['user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing'].join(' ');
const INTERVALO_POLLING_MS = 5000;

// O Redirect URI precisa bater EXATAMENTE com o cadastrado no painel do
// Spotify, e é a tela de configuração que diz qual cadastrar. Se ele fosse
// fixo em :3000, quem mudasse PORT veria a instrução errada e levaria um
// "INVALID_CLIENT: Invalid redirect URI" sem entender por quê.
function _redirectPadrao() {
  return `http://127.0.0.1:${process.env.PORT || 3000}/spotify/callback`;
}

class IntegracaoSpotify extends EventEmitter {
  constructor() {
    super();
    this.nome = 'spotify';
    this.estado = {
      conectado: false,
      tocando: false,
      musica: null,
      artista: null,
      volume: 50,
      dispositivo: null,
    };

    this.clientId = process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.redirectUri = process.env.SPOTIFY_REDIRECT_URI || _redirectPadrao();
    this.refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
    this.habilitado = Boolean(this.clientId && this.clientSecret && this.refreshToken);

    this.accessToken = null;
    this.accessTokenExpiraEm = 0;
    this._intervaloPolling = null;
  }

  // Usado por server/routes/spotify-auth.js para montar o link de autorização.
  obterUrlAutorizacao() {
    const parametros = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: ESCOPOS,
      redirect_uri: this.redirectUri,
    });
    return `${URL_CONTAS_SPOTIFY}/authorize?${parametros.toString()}`;
  }

  // Usado por server/routes/spotify-auth.js na troca inicial código -> tokens.
  async trocarCodigoPorToken(codigo) {
    const resposta = await fetch(`${URL_CONTAS_SPOTIFY}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: codigo,
        redirect_uri: this.redirectUri,
      }),
    });
    if (!resposta.ok) {
      throw new Error(`Falha ao trocar código por token (${resposta.status}): ${await resposta.text()}`);
    }
    return resposta.json();
  }

  async _obterAccessToken() {
    this._garantirConfigurado();
    if (this.accessToken && Date.now() < this.accessTokenExpiraEm) {
      return this.accessToken;
    }

    const resposta = await fetch(`${URL_CONTAS_SPOTIFY}/api/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }),
    });
    if (!resposta.ok) {
      throw new Error(`Falha ao renovar o access token do Spotify (${resposta.status}): ${await resposta.text()}`);
    }

    const dados = await resposta.json();
    this.accessToken = dados.access_token;
    this.accessTokenExpiraEm = Date.now() + (dados.expires_in - 60) * 1000;
    if (dados.refresh_token) this.refreshToken = dados.refresh_token;
    return this.accessToken;
  }

  async _chamarApi(caminho, opcoes = {}) {
    const token = await this._obterAccessToken();
    return fetch(`${URL_API_SPOTIFY}${caminho}`, {
      ...opcoes,
      headers: { ...(opcoes.headers || {}), Authorization: `Bearer ${token}` },
    });
  }

  _garantirConfigurado() {
    if (!this.habilitado) {
      throw new Error('Integração Spotify ainda não configurada. Veja o README para habilitar.');
    }
  }

  _atualizarEstado(parcial) {
    this.estado = { ...this.estado, ...parcial };
    this.emit('estado', this.estado);
  }

  async _atualizarNowPlaying() {
    try {
      const resposta = await this._chamarApi('/me/player');
      if (resposta.status === 204) {
        this._atualizarEstado({ conectado: true, tocando: false, musica: null, artista: null, dispositivo: null });
        return;
      }
      if (!resposta.ok) return;

      const dados = await resposta.json();
      this._atualizarEstado({
        conectado: true,
        tocando: Boolean(dados.is_playing),
        musica: dados.item?.name || null,
        artista: dados.item?.artists?.map((a) => a.name).join(', ') || null,
        volume: dados.device?.volume_percent ?? this.estado.volume,
        dispositivo: dados.device?.name || null,
      });
    } catch (erro) {
      console.warn(`[spotify] Falha ao buscar now playing: ${erro.message}`);
    }
  }

  // Usado por server/routes/spotify-auth.js na rota GET /spotify/dispositivos.
  async listarDispositivos() {
    this._garantirConfigurado();
    const resposta = await this._chamarApi('/me/player/devices');
    if (!resposta.ok) {
      throw new Error(`Spotify retornou ${resposta.status} ao listar dispositivos.`);
    }
    const dados = await resposta.json();
    return dados.devices || [];
  }

  async inicializar() {
    if (!this.habilitado) {
      console.log(
        '[spotify] Não configurado (preencha SPOTIFY_* no .env para habilitar) — módulo inativo por enquanto.',
      );
      return;
    }
    try {
      await this._obterAccessToken();
      await this._atualizarNowPlaying();
      this._intervaloPolling = setInterval(() => this._atualizarNowPlaying(), INTERVALO_POLLING_MS);
      console.log('[spotify] Conectado à Web API do Spotify.');
    } catch (erro) {
      console.warn(`[spotify] Falha ao conectar (${erro.message}). Refaça a autorização em /spotify/login se o refresh token expirou.`);
    }
  }

  // O que a tela de configuração precisa perguntar. O refresh token não
  // aparece como campo de propósito: ele é obtido pelo botão "Conectar ao
  // Spotify" (o fluxo OAuth em server/routes/spotify-auth.js) e gravado
  // sozinho. Pedir para alguém copiar um refresh token de uma página e colar
  // num arquivo era o passo mais hostil do setup inteiro.
  get configuracao() {
    return {
      rotulo: 'Spotify',
      resumo: 'Música tocando, controle de faixa e volume só do Spotify.',
      aviso: 'Exige conta Spotify Premium — é limitação da API deles, não deste app.',
      comoObter: [
        'Entre em developer.spotify.com/dashboard com a sua conta e clique em "Create app".',
        'Nome e descrição podem ser qualquer coisa ("Stream Deck", por exemplo).',
        'Em "Redirect URI", cole exatamente: ' + this.redirectUri,
        'Marque "Web API", salve, e copie o Client ID e o Client Secret para os campos abaixo.',
        'Salve aqui e clique em "Conectar ao Spotify" para autorizar.',
      ],
      campos: [
        { env: 'SPOTIFY_CLIENT_ID', rotulo: 'Client ID', tipo: 'senha' },
        { env: 'SPOTIFY_CLIENT_SECRET', rotulo: 'Client Secret', tipo: 'senha' },
      ],
      // A UI mostra este passo como um botão, depois dos campos salvos.
      autorizacao: {
        url: '/spotify/login',
        rotulo: 'Conectar ao Spotify',
        pronto: Boolean(this.refreshToken),
        precisaAntes: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'],
      },
    };
  }

  // Relê as credenciais do .env e reinicia o polling. Chamada pela tela de
  // configuração ao salvar e pelo callback do OAuth, para valer na hora.
  async reconfigurar() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID;
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    this.redirectUri = process.env.SPOTIFY_REDIRECT_URI || _redirectPadrao();
    this.refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
    this.habilitado = Boolean(this.clientId && this.clientSecret && this.refreshToken);

    // O access token em memória foi emitido para as credenciais antigas.
    this.accessToken = null;
    this.accessTokenExpiraEm = 0;

    clearInterval(this._intervaloPolling);
    this._intervaloPolling = null;

    if (!this.habilitado) {
      this._atualizarEstado({ conectado: false, tocando: false, musica: null, artista: null, dispositivo: null });
      return;
    }
    await this.inicializar();
  }

  // Descreve o que esta integração oferece, para a tela de configuração
  // conseguir montar os formulários sozinha (veja GET /api/catalogo).
  get catalogo() {
    return {
      rotulo: 'Spotify',
      disponivel: this.habilitado,
      motivoIndisponivel: this.habilitado
        ? null
        : 'Falta configurar SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET e SPOTIFY_REFRESH_TOKEN no .env — veja o README.',
      estados: [
        { chave: 'spotify.tocando', rotulo: 'Está tocando', tipo: 'booleano' },
        { chave: 'spotify.musica', rotulo: 'Música atual', tipo: 'texto' },
        { chave: 'spotify.artista', rotulo: 'Artista atual', tipo: 'texto' },
        { chave: 'spotify.dispositivo', rotulo: 'Dispositivo tocando', tipo: 'texto' },
        { chave: 'spotify.volume', rotulo: 'Volume do Spotify (0–100)', tipo: 'numero' },
        { chave: 'spotify.conectado', rotulo: 'Spotify conectado', tipo: 'booleano' },
      ],
      listas: [
        { fonte: '/spotify/dispositivos', rotulo: 'Dispositivos do Spotify', acaoSugerida: 'transferirReproducao' },
      ],
      acoes: {
        playPause: { rotulo: 'Play / Pause', parametros: [] },
        proximaFaixa: { rotulo: 'Próxima faixa', parametros: [] },
        faixaAnterior: { rotulo: 'Faixa anterior', parametros: [] },
        definirVolume: {
          rotulo: 'Definir volume do Spotify',
          paraSlider: true,
          parametros: [{ nome: 'valor', rotulo: 'Volume (0–100)', tipo: 'numero', obrigatorio: false }],
        },
        transferirReproducao: {
          rotulo: 'Tocar em outro dispositivo',
          parametros: [{ nome: 'dispositivoId', rotulo: 'ID do dispositivo', tipo: 'texto', obrigatorio: false }],
          aceitaLista: true,
        },
      },
    };
  }

  get acoes() {
    return {
      playPause: async () => {
        this._garantirConfigurado();
        const caminho = this.estado.tocando ? '/me/player/pause' : '/me/player/play';
        const resposta = await this._chamarApi(caminho, { method: 'PUT' });
        if (!resposta.ok && resposta.status !== 204) {
          throw new Error(`Spotify retornou ${resposta.status} — verifique se há um dispositivo Spotify ativo (app aberto em algum lugar).`);
        }
        await this._atualizarNowPlaying();
        return this.estado;
      },
      proximaFaixa: async () => {
        this._garantirConfigurado();
        const resposta = await this._chamarApi('/me/player/next', { method: 'POST' });
        if (!resposta.ok && resposta.status !== 204) {
          throw new Error(`Spotify retornou ${resposta.status} — verifique se há um dispositivo Spotify ativo.`);
        }
        await this._atualizarNowPlaying();
        return this.estado;
      },
      faixaAnterior: async () => {
        this._garantirConfigurado();
        const resposta = await this._chamarApi('/me/player/previous', { method: 'POST' });
        if (!resposta.ok && resposta.status !== 204) {
          throw new Error(`Spotify retornou ${resposta.status} — verifique se há um dispositivo Spotify ativo.`);
        }
        await this._atualizarNowPlaying();
        return this.estado;
      },
      definirVolume: async (parametros = {}) => {
        this._garantirConfigurado();
        const valor = Math.round(Number(parametros.valor ?? parametros.value ?? 0));
        const resposta = await this._chamarApi(`/me/player/volume?volume_percent=${valor}`, { method: 'PUT' });
        if (!resposta.ok && resposta.status !== 204) {
          throw new Error(`Spotify retornou ${resposta.status} — verifique se há um dispositivo Spotify ativo.`);
        }
        this._atualizarEstado({ volume: valor });
        return this.estado;
      },
      transferirReproducao: async (parametros = {}) => {
        this._garantirConfigurado();
        // "opcaoId" vem da escolha do usuário no seletor (tipo "lista").
        const dispositivoId = parametros.opcaoId || parametros.dispositivoId;
        if (!dispositivoId) throw new Error('Parâmetro "dispositivoId" é obrigatório.');
        const resposta = await this._chamarApi('/me/player', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_ids: [dispositivoId], play: true }),
        });
        if (!resposta.ok && resposta.status !== 204) {
          throw new Error(`Spotify retornou ${resposta.status} ao transferir a reprodução.`);
        }
        await this._atualizarNowPlaying();
        return this.estado;
      },
    };
  }
}

module.exports = new IntegracaoSpotify();
