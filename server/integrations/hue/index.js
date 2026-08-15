// Integração com Philips Hue (CLIP API v2) — ESTRUTURADA, ainda não conectada.
//
// Para habilitar (veja o passo a passo completo no README):
//   1. Descubra o IP da bridge na sua rede (app oficial Hue, ou https://discovery.meethue.com/)
//      e preencha HUE_BRIDGE_IP no .env
//   2. Aperte o botão físico da bridge e, em seguida, gere uma application key
//      (POST https://<bridge>/api com {"devicetype":"deckly"}) e preencha
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

  // Aparece na tela de credenciais, mas sem campos: preencher IP e chave da
  // bridge não faria nada enquanto as chamadas HTTP forem TODO. Melhor dizer
  // isso do que aceitar dados e não funcionar.
  get configuracao() {
    return {
      rotulo: 'Philips Hue',
      resumo: 'Acender e apagar luzes da casa.',
      naoImplementado:
        'A integração com a Hue ainda não está pronta — a estrutura existe, mas as ' +
        'chamadas para a bridge não foram implementadas. Os botões de luz não funcionam.',
      campos: [],
    };
  }

  // Descreve o que esta integração oferece, para a tela de configuração
  // conseguir montar os formulários sozinha (veja GET /api/catalogo).
  get catalogo() {
    return {
      rotulo: 'Philips Hue',
      disponivel: this.habilitado,
      motivoIndisponivel: this.habilitado
        ? null
        : 'Falta configurar HUE_BRIDGE_IP e HUE_APPLICATION_KEY no .env — veja o README.',
      // O estado só ganha forma depois de conectar na bridge: as chaves saem
      // dos nomes dos grupos (ex.: hue.sala.ligada).
      estados: [],
      acoes: {
        alternarLuz: {
          rotulo: 'Acender / apagar luz',
          parametros: [{ nome: 'grupo', rotulo: 'Nome do grupo de luzes', tipo: 'texto', obrigatorio: true }],
        },
      },
    };
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
