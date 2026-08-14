// Integração de atalhos: teclas de sistema/janelas do Windows (print,
// bloquear, snap...), abrir apps/sites/jogos, e alternar entre janelas
// abertas. Sem estado ao vivo — são ações "dispare e pronto", não têm o
// que refletir na UI.
//
// As listagens (janelas abertas, jogos da Steam) não são ações de botão:
// o frontend as busca por GET antes de mostrar o seletor — veja
// server/routes/atalhos.js.

const EventEmitter = require('events');
const { detectarModo } = require('../../lib/powershell-interop');
const { ControladorAtalhos } = require('./windows');

class IntegracaoAtalhos extends EventEmitter {
  constructor() {
    super();
    this.nome = 'atalhos';
    this.estado = {};

    const modo = detectarModo();
    if (!modo) {
      console.warn(
        '[atalhos] Nenhum backend disponível nesta plataforma (não é Windows nem WSL2) — integração inativa.',
      );
      this.controlador = null;
    } else {
      this.controlador = new ControladorAtalhos({ modo });
    }
  }

  _garantirDisponivel() {
    if (!this.controlador) {
      throw new Error('Integração de atalhos não está disponível nesta plataforma.');
    }
  }

  async listarJanelas() {
    this._garantirDisponivel();
    return this.controlador.listarJanelas();
  }

  async listarJogos() {
    this._garantirDisponivel();
    return this.controlador.listarJogos();
  }

  get acoes() {
    return {
      print: () => { this._garantirDisponivel(); return this.controlador.print(); },
      bloquear: () => { this._garantirDisponivel(); return this.controlador.bloquear(); },
      areaTrabalho: () => { this._garantirDisponivel(); return this.controlador.areaTrabalho(); },
      snapEsquerda: () => { this._garantirDisponivel(); return this.controlador.snapEsquerda(); },
      snapDireita: () => { this._garantirDisponivel(); return this.controlador.snapDireita(); },
      areaTransferencia: () => { this._garantirDisponivel(); return this.controlador.areaTransferencia(); },
      moverMonitorEsquerda: () => { this._garantirDisponivel(); return this.controlador.moverMonitorEsquerda(); },
      moverMonitorDireita: () => { this._garantirDisponivel(); return this.controlador.moverMonitorDireita(); },

      abrirUrl: (parametros = {}) => {
        this._garantirDisponivel();
        if (!parametros.url) throw new Error('Parâmetro "url" é obrigatório.');
        // "navegador" é opcional: sem ele, abre no navegador padrão do Windows.
        return this.controlador.abrirUrl(parametros.url, parametros.navegador);
      },
      abrirApp: (parametros = {}) => {
        this._garantirDisponivel();
        if (!parametros.caminho) throw new Error('Parâmetro "caminho" é obrigatório.');
        return this.controlador.abrirApp(parametros.caminho);
      },
      abrirUwp: (parametros = {}) => {
        this._garantirDisponivel();
        if (!parametros.appId) throw new Error('Parâmetro "appId" é obrigatório.');
        return this.controlador.abrirUwp(parametros.appId);
      },
      abrirJogo: (parametros = {}) => {
        this._garantirDisponivel();
        // "appId" fixo no config (botão de um jogo específico) ou vindo da
        // escolha do usuário no seletor (parametros.opcaoId).
        const appId = parametros.opcaoId || parametros.appId;
        if (!appId) throw new Error('Parâmetro "appId" é obrigatório.');
        return this.controlador.abrirJogo(appId);
      },
      focarJanela: (parametros = {}) => {
        this._garantirDisponivel();
        const handle = parametros.opcaoId || parametros.handle;
        if (!handle) throw new Error('Parâmetro "handle" é obrigatório.');
        return this.controlador.focarJanela(handle);
      },
    };
  }
}

module.exports = new IntegracaoAtalhos();
