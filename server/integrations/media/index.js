// Integração de mídia: play/pause, faixa anterior/próxima, mute e volume.
//
// O controle de fato acontece no Windows (teclas de mídia + volume master),
// mesmo quando o servidor roda dentro do WSL2 — veja windows.js. Essa
// abstração permite trocar o "controlador" no futuro (ex.: rodar nativo no
// Windows, ou um backend Linux/Mac) sem tocar no resto do app.

const EventEmitter = require('events');
const { ControladorWindows } = require('./windows');

function detectarModo() {
  const forcado = (process.env.MEDIA_BACKEND || 'auto').toLowerCase();
  if (forcado === 'wsl-windows') return 'wsl';
  if (forcado === 'windows') return 'nativo';

  if (process.platform === 'win32') return 'nativo';
  if (process.env.WSL_DISTRO_NAME) return 'wsl';
  return null;
}

class IntegracaoMedia extends EventEmitter {
  constructor() {
    super();
    this.nome = 'media';
    this.estado = { volume: 50, mudo: false };

    const modo = detectarModo();
    if (!modo) {
      console.warn(
        '[media] Nenhum backend de mídia disponível nesta plataforma (não é Windows nem WSL2). ' +
          'A integração de mídia ficará inativa — veja MEDIA_BACKEND no .env.',
      );
      this.controlador = null;
    } else {
      this.controlador = new ControladorWindows({ modo });
      console.log(`[media] Backend de mídia ativo: ${modo === 'wsl' ? 'WSL2 -> Windows (interop)' : 'Windows nativo'}`);
    }
  }

  async _executarEAtualizar(promessa) {
    if (!this.controlador) {
      throw new Error('Integração de mídia não está disponível nesta plataforma.');
    }
    const novoEstado = await promessa;
    this.estado = { ...this.estado, ...novoEstado };
    this.emit('estado', this.estado);
    return this.estado;
  }

  async inicializar() {
    if (!this.controlador) return;
    try {
      await this._executarEAtualizar(this.controlador.status());
    } catch (erro) {
      console.warn(`[media] Não foi possível obter o estado inicial de volume: ${erro.message}`);
    }
  }

  get acoes() {
    return {
      playPause: () => this._executarEAtualizar(this.controlador.playPause()),
      faixaAnterior: () => this._executarEAtualizar(this.controlador.faixaAnterior()),
      proximaFaixa: () => this._executarEAtualizar(this.controlador.proximaFaixa()),
      alternarMudo: () => this._executarEAtualizar(this.controlador.alternarMudo()),
      aumentarVolume: () => this._executarEAtualizar(this.controlador.aumentarVolume()),
      diminuirVolume: () => this._executarEAtualizar(this.controlador.diminuirVolume()),
      definirVolume: (parametros = {}) => {
        const valor = parametros.valor ?? parametros.value;
        return this._executarEAtualizar(this.controlador.definirVolume(valor));
      },
    };
  }
}

module.exports = new IntegracaoMedia();
