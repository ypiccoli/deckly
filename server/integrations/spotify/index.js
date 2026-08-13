// Integração com o Spotify (Web API) — ESTRUTURADA, ainda não conectada.
//
// Para habilitar (veja o passo a passo completo no README):
//   1. Crie um app em https://developer.spotify.com/dashboard
//   2. Preencha SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REDIRECT_URI no .env
//   3. Faça o fluxo OAuth "Authorization Code" uma vez para obter um refresh token
//      e preencha SPOTIFY_REFRESH_TOKEN no .env
//   4. Implemente os TODOs abaixo usando a Web API (https://api.spotify.com/v1/me/player/*)

const EventEmitter = require('events');

class IntegracaoSpotify extends EventEmitter {
  constructor() {
    super();
    this.nome = 'spotify';
    this.estado = {
      conectado: false,
      tocando: false,
      musica: null,
      artista: null,
    };
    this.habilitado = Boolean(
      process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_REFRESH_TOKEN,
    );
  }

  async inicializar() {
    if (!this.habilitado) {
      console.log('[spotify] Não configurado (preencha SPOTIFY_* no .env para habilitar) — módulo inativo por enquanto.');
      return;
    }
    // TODO: obter access token via refresh token e iniciar polling do "now playing"
    // (GET /v1/me/player), emitindo this.emit('estado', this.estado) a cada mudança.
  }

  async _obterAccessToken() {
    // TODO: POST https://accounts.spotify.com/api/token
    //   body: grant_type=refresh_token&refresh_token=<SPOTIFY_REFRESH_TOKEN>
    //   header: Authorization: Basic base64(client_id:client_secret)
    throw new Error('Integração Spotify ainda não configurada. Veja o README para habilitar.');
  }

  _garantirConfigurado() {
    if (!this.habilitado) {
      throw new Error('Integração Spotify ainda não configurada. Veja o README para habilitar.');
    }
  }

  get acoes() {
    return {
      playPause: async () => {
        this._garantirConfigurado();
        // TODO: PUT /v1/me/player/pause ou /v1/me/player/play conforme this.estado.tocando
        return this.estado;
      },
      proximaFaixa: async () => {
        this._garantirConfigurado();
        // TODO: POST /v1/me/player/next
        return this.estado;
      },
      faixaAnterior: async () => {
        this._garantirConfigurado();
        // TODO: POST /v1/me/player/previous
        return this.estado;
      },
    };
  }
}

module.exports = new IntegracaoSpotify();
