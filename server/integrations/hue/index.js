// Integração com Philips Hue (CLIP API v2) — ESTRUTURADA, ainda não conectada.
//
// Para habilitar (veja o passo a passo completo no README):
//   1. Descubra o IP da bridge na sua rede (app oficial Hue, ou https://discovery.meethue.com/)
//      e preencha HUE_BRIDGE_IP no .env
//   2. Aperte o botão físico da bridge e, em seguida, gere uma application key
//      (POST https://<bridge>/api com {"devicetype":"stream-deck-web"}) e preencha
//      HUE_APPLICATION_KEY no .env
//   3. Implemente os TODOs abaixo usando a CLIP API v2 (https://<bridge>/clip/v2/resource/*)

const EventEmitter = require('events');

class IntegracaoHue extends EventEmitter {
  constructor() {
    super();
    this.nome = 'hue';
    this.estado = {};
    this.habilitado = Boolean(process.env.HUE_BRIDGE_IP && process.env.HUE_APPLICATION_KEY);
  }

  async inicializar() {
    if (!this.habilitado) {
      console.log(
        '[hue] Não configurado (preencha HUE_BRIDGE_IP e HUE_APPLICATION_KEY no .env para habilitar) — módulo inativo por enquanto.',
      );
      return;
    }
    // TODO: GET https://<bridge>/clip/v2/resource/grouped_light para popular this.estado
    // com o estado inicial de cada grupo (ex.: { sala: { ligada: true }, quarto: { ligada: false } }).
  }

  _garantirConfigurado() {
    if (!this.habilitado) {
      throw new Error('Integração Hue ainda não configurada. Veja o README para habilitar.');
    }
  }

  get acoes() {
    return {
      alternarLuz: async (parametros = {}) => {
        this._garantirConfigurado();
        if (!parametros.grupo) throw new Error('Parâmetro "grupo" é obrigatório.');
        // TODO: PUT https://<bridge>/clip/v2/resource/grouped_light/<id-do-grupo>
        //   body: { on: { on: !estadoAtualDoGrupo } }
        return this.estado;
      },
    };
  }
}

module.exports = new IntegracaoHue();
