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

  // Descreve o que esta integração oferece, para a tela de configuração
  // conseguir montar os formulários sozinha (veja GET /api/catalogo).
  get catalogo() {
    return {
      rotulo: 'OBS Studio',
      disponivel: this.estado.conectado,
      motivoIndisponivel: this.estado.conectado
        ? null
        : 'OBS não conectado — abra o OBS com o WebSocket Server ligado (ele reconecta sozinho).',
      estados: [
        { chave: 'obs.cenaAtual', rotulo: 'Cena ativa', tipo: 'texto' },
        { chave: 'obs.micMudo', rotulo: 'Microfone mudo', tipo: 'booleano' },
        { chave: 'obs.gravando', rotulo: 'Gravando', tipo: 'booleano' },
        { chave: 'obs.conectado', rotulo: 'OBS conectado', tipo: 'booleano' },
      ],
      acoes: {
        trocarCena: {
          rotulo: 'Trocar de cena',
          parametros: [
            {
              nome: 'cena',
              rotulo: 'Nome da cena',
              tipo: 'texto',
              obrigatorio: true,
              ajuda: 'Precisa bater exatamente com o nome da cena no OBS.',
            },
          ],
          // Vários botões de cena compartilham estadoChave "obs.cenaAtual" e
          // cada um só acende quando a cena bate com o seu próprio parâmetro.
          comparaEstado: 'cena',
        },
        alternarMicMudo: {
          rotulo: 'Alternar mudo do microfone',
          parametros: [
            {
              nome: 'entrada',
              rotulo: 'Nome da fonte de áudio',
              tipo: 'texto',
              obrigatorio: false,
              ajuda: 'Em branco usa OBS_MIC_INPUT_NAME do .env (padrão: Mic/Aux).',
            },
          ],
        },
        alternarGravacao: { rotulo: 'Iniciar / parar gravação', parametros: [] },
      },
    };
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
