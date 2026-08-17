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

  // Descreve o que esta integração oferece, para a tela de configuração
  // conseguir montar os formulários sozinha (veja GET /api/catalogo).
  get catalogo() {
    const semParametros = (rotulo) => ({ rotulo, parametros: [] });
    return {
      rotulo: 'Atalhos e programas do Windows',
      disponivel: Boolean(this.controlador),
      motivoIndisponivel: this.controlador ? null : 'Só funciona no Windows ou no WSL2.',
      estados: [],
      listas: [
        { fonte: '/atalhos/janelas', rotulo: 'Janelas abertas agora', acaoSugerida: 'focarJanela' },
        { fonte: '/atalhos/jogos', rotulo: 'Jogos instalados na Steam', acaoSugerida: 'abrirJogo' },
      ],
      acoes: {
        print: semParametros('Captura de tela (Win+Shift+S)'),
        bloquear: semParametros('Bloquear o PC'),
        areaTrabalho: semParametros('Mostrar área de trabalho'),
        snapEsquerda: semParametros('Encaixar janela à esquerda'),
        snapDireita: semParametros('Encaixar janela à direita'),
        areaTransferencia: semParametros('Área de transferência (Win+V)'),
        moverMonitorEsquerda: semParametros('Mover janela para o monitor da esquerda'),
        moverMonitorDireita: semParametros('Mover janela para o monitor da direita'),
        enviarTeclas: {
          rotulo: 'Enviar atalho de teclado',
          parametros: [
            {
              nome: 'combo',
              rotulo: 'Combinação de teclas',
              tipo: 'texto',
              obrigatorio: true,
              ajuda: 'Ex.: CTRL+SHIFT+M. Vale CTRL, SHIFT, ALT, WIN, letras, números, F1–F24 e teclas como ENTER, ESC, TAB, setas.',
            },
          ],
        },
        focarProcesso: {
          rotulo: 'Trazer um programa para frente',
          parametros: [
            {
              nome: 'processo',
              rotulo: 'Nome do processo',
              tipo: 'texto',
              obrigatorio: true,
              ajuda: 'Sem o .exe (ex.: Discord, vivaldi, Code). Falha se o programa não estiver aberto.',
            },
          ],
        },
        digitarTexto: {
          rotulo: 'Digitar um texto',
          parametros: [
            {
              nome: 'texto',
              rotulo: 'Texto',
              tipo: 'texto',
              obrigatorio: true,
              ajuda: 'Digitado na janela que estiver em foco. Combine com "Trazer um programa para frente" numa macro.',
            },
          ],
        },
        abrirApp: {
          rotulo: 'Abrir programa',
          parametros: [
            {
              nome: 'caminho',
              rotulo: 'Caminho, comando ou atalho .lnk',
              tipo: 'texto',
              obrigatorio: true,
              ajuda: 'Prefira o .lnk do Menu Iniciar para apps que se auto-atualizam. Comandos no PATH também valem (ex.: code, wt).',
            },
            {
              nome: 'argumentos',
              rotulo: 'Argumentos (opcional)',
              tipo: 'texto',
              obrigatorio: false,
              ajuda: 'Passados na linha de comando, para programas que precisam deles.',
            },
          ],
        },
        abrirUwp: {
          rotulo: 'Abrir app da Store (MSIX)',
          parametros: [
            {
              nome: 'appId',
              rotulo: 'AppUserModelID',
              tipo: 'texto',
              obrigatorio: true,
              ajuda: 'Descubra com: Get-StartApps | Where-Object { $_.Name -like \'*Nome*\' }',
            },
          ],
        },
        abrirUrl: {
          rotulo: 'Abrir site',
          parametros: [
            { nome: 'url', rotulo: 'Endereço', tipo: 'texto', obrigatorio: true },
            {
              nome: 'navegador',
              rotulo: 'Navegador específico (opcional)',
              tipo: 'texto',
              obrigatorio: false,
              ajuda:
                'Caminho do .exe. Em branco, abre no navegador padrão do Windows — prefira ' +
                'assim se for compartilhar seu deck com alguém, senão o botão quebra em quem ' +
                'não tiver esse navegador instalado.',
            },
          ],
        },
        abrirJogo: {
          rotulo: 'Abrir jogo da Steam',
          parametros: [{ nome: 'appId', rotulo: 'AppID na Steam', tipo: 'texto', obrigatorio: false }],
          aceitaLista: true,
        },
        focarJanela: {
          rotulo: 'Ir para uma janela',
          parametros: [{ nome: 'handle', rotulo: 'Identificador da janela', tipo: 'texto', obrigatorio: false }],
          aceitaLista: true,
        },
      },
    };
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
      enviarTeclas: (parametros = {}) => {
        this._garantirDisponivel();
        if (!parametros.combo) throw new Error('Parâmetro "combo" é obrigatório.');
        return this.controlador.enviarTeclas(parametros.combo);
      },
      focarProcesso: (parametros = {}) => {
        this._garantirDisponivel();
        if (!parametros.processo) throw new Error('Parâmetro "processo" é obrigatório.');
        return this.controlador.focarProcesso(parametros.processo);
      },
      digitarTexto: (parametros = {}) => {
        this._garantirDisponivel();
        if (parametros.texto == null) throw new Error('Parâmetro "texto" é obrigatório.');
        return this.controlador.digitarTexto(String(parametros.texto));
      },

      abrirUrl: (parametros = {}) => {
        this._garantirDisponivel();
        if (!parametros.url) throw new Error('Parâmetro "url" é obrigatório.');
        // "navegador" é opcional: sem ele, abre no navegador padrão do Windows.
        return this.controlador.abrirUrl(parametros.url, parametros.navegador);
      },
      abrirApp: (parametros = {}) => {
        this._garantirDisponivel();
        if (!parametros.caminho) throw new Error('Parâmetro "caminho" é obrigatório.');
        return this.controlador.abrirApp(parametros.caminho, parametros.argumentos);
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
