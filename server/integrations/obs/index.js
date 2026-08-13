// Integração com o OBS Studio via obs-websocket v5 (pacote obs-websocket-js).
//
// Requer o WebSocket Server do OBS habilitado em:
//   Ferramentas > WebSocket Server Settings > Enable WebSocket server
// e as credenciais preenchidas em OBS_WEBSOCKET_* no .env.

const EventEmitter = require('events');
const OBSWebSocket = require('obs-websocket-js').default;

const ATRASO_RECONEXAO_MS = 5000;

class IntegracaoObs extends EventEmitter {
  constructor() {
    super();
    this.nome = 'obs';
    this.estado = {
      conectado: false,
      cenaAtual: null,
      micMudo: false,
      gravando: false,
    };
    this.obs = new OBSWebSocket();
    this.nomeEntradaMic = process.env.OBS_MIC_INPUT_NAME || 'Mic/Aux';
    this._timeoutReconexao = null;
    this._configurarEventos();
  }

  _configurarEventos() {
    this.obs.on('CurrentProgramSceneChanged', ({ sceneName }) => {
      this._atualizarEstado({ cenaAtual: sceneName });
    });

    this.obs.on('InputMuteStateChanged', ({ inputName, inputMuted }) => {
      if (inputName === this.nomeEntradaMic) {
        this._atualizarEstado({ micMudo: inputMuted });
      }
    });

    this.obs.on('RecordStateChanged', ({ outputActive }) => {
      this._atualizarEstado({ gravando: outputActive });
    });

    this.obs.on('ConnectionClosed', () => {
      if (this.estado.conectado) {
        console.warn('[obs] Conexão com o OBS caiu. Tentando reconectar em 5s...');
      }
      this._atualizarEstado({ conectado: false });
      this._agendarReconexao();
    });
  }

  _atualizarEstado(parcial) {
    this.estado = { ...this.estado, ...parcial };
    this.emit('estado', this.estado);
  }

  _agendarReconexao() {
    if (this._timeoutReconexao) return;
    this._timeoutReconexao = setTimeout(() => {
      this._timeoutReconexao = null;
      this.inicializar().catch(() => {});
    }, ATRASO_RECONEXAO_MS);
  }

  async inicializar() {
    const host = process.env.OBS_WEBSOCKET_HOST || 'localhost';
    const porta = process.env.OBS_WEBSOCKET_PORT || 4455;
    const senha = process.env.OBS_WEBSOCKET_PASSWORD || undefined;

    try {
      await this.obs.connect(`ws://${host}:${porta}`, senha);

      const { currentProgramSceneName } = await this.obs.call('GetSceneList');
      const { outputActive } = await this.obs.call('GetRecordStatus');

      let micMudo = false;
      try {
        const resultado = await this.obs.call('GetInputMute', { inputName: this.nomeEntradaMic });
        micMudo = resultado.inputMuted;
      } catch {
        console.warn(`[obs] Entrada de áudio "${this.nomeEntradaMic}" não encontrada no OBS (ajuste OBS_MIC_INPUT_NAME no .env).`);
      }

      this._atualizarEstado({
        conectado: true,
        cenaAtual: currentProgramSceneName,
        gravando: outputActive,
        micMudo,
      });
      console.log('[obs] Conectado ao OBS WebSocket.');
    } catch (erro) {
      console.warn(`[obs] Não foi possível conectar ao OBS (${erro.message}). Tentando novamente em 5s...`);
      this._agendarReconexao();
    }
  }

  get acoes() {
    return {
      trocarCena: async (parametros = {}) => {
        if (!parametros.cena) throw new Error('Parâmetro "cena" é obrigatório.');
        await this.obs.call('SetCurrentProgramScene', { sceneName: parametros.cena });
        return this.estado;
      },
      alternarMicMudo: async (parametros = {}) => {
        const entrada = parametros.entrada || this.nomeEntradaMic;
        await this.obs.call('ToggleInputMute', { inputName: entrada });
        return this.estado;
      },
      alternarGravacao: async () => {
        await this.obs.call('ToggleRecord');
        return this.estado;
      },
    };
  }
}

module.exports = new IntegracaoObs();
