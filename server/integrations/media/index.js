// Integração de mídia: play/pause, faixa anterior/próxima, mute e volume.
//
// O controle de fato acontece no Windows (teclas de mídia + volume master),
// mesmo quando o servidor roda dentro do WSL2 — veja windows.js. Essa
// abstração permite trocar o "controlador" no futuro (ex.: rodar nativo no
// Windows, ou um backend Linux/Mac) sem tocar no resto do app.

const EventEmitter = require('events');
const { detectarModo } = require('../../lib/powershell-interop');
const { ControladorWindows } = require('./windows');

class IntegracaoMedia extends EventEmitter {
  constructor() {
    super();
    this.nome = 'media';
    this.estado = { volume: 50, mudo: false, saida: null };

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

  // Saídas de áudio ativas, para o seletor. O formato { id, nome, ativo } é
  // o mesmo de todas as listagens — veja routes/atalhos.js.
  async listarSaidas() {
    if (!this.controlador) {
      throw new Error('Integração de mídia não está disponível nesta plataforma.');
    }
    const saidas = await this.controlador.listarSaidas();
    return (saidas || []).map((s) => ({
      id: s.id,
      nome: s.nome,
      detalhe: s.padrao ? 'Em uso' : null,
      ativo: Boolean(s.padrao),
    }));
  }

  // Descreve o que esta integração oferece, para a tela de configuração
  // conseguir montar os formulários sozinha (veja GET /api/catalogo).
  get catalogo() {
    return {
      rotulo: 'Mídia do Windows',
      disponivel: Boolean(this.controlador),
      motivoIndisponivel: this.controlador ? null : 'Só funciona no Windows ou no WSL2.',
      estados: [
        { chave: 'media.volume', rotulo: 'Volume do Windows (0–100)', tipo: 'numero' },
        { chave: 'media.mudo', rotulo: 'Windows está mudo', tipo: 'booleano' },
        { chave: 'media.saida', rotulo: 'Saída de áudio em uso', tipo: 'texto' },
      ],
      listas: [{ fonte: '/media/saidas', rotulo: 'Saídas de áudio', acaoSugerida: 'definirSaida' }],
      acoes: {
        playPause: { rotulo: 'Play / Pause', parametros: [] },
        faixaAnterior: { rotulo: 'Faixa anterior', parametros: [] },
        proximaFaixa: { rotulo: 'Próxima faixa', parametros: [] },
        alternarMudo: { rotulo: 'Alternar mudo', parametros: [] },
        aumentarVolume: { rotulo: 'Aumentar volume', parametros: [] },
        diminuirVolume: { rotulo: 'Diminuir volume', parametros: [] },
        definirVolume: {
          rotulo: 'Definir volume',
          paraSlider: true,
          parametros: [{ nome: 'valor', rotulo: 'Volume (0–100)', tipo: 'numero', obrigatorio: false }],
        },
        definirSaida: {
          rotulo: 'Trocar a saída de áudio',
          parametros: [
            {
              nome: 'dispositivoId',
              rotulo: 'Dispositivo',
              tipo: 'texto',
              obrigatorio: false,
              ajuda: 'Em branco num botão do tipo Seletor: a saída é escolhida na hora, na lista.',
            },
          ],
          aceitaLista: true,
        },
      },
    };
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
      definirSaida: (parametros = {}) => {
        // "opcaoId" vem da escolha no seletor; "dispositivoId" de um botão
        // fixo numa saída específica.
        const id = parametros.opcaoId || parametros.dispositivoId;
        if (!id) throw new Error('Nenhuma saída de áudio informada.');
        // O script já devolve o estado do dispositivo novo — cada saída tem
        // seu próprio volume e mudo, então isso mantém o slider honesto.
        return this._executarEAtualizar(this.controlador.definirSaida(id));
      },
    };
  }
}

module.exports = new IntegracaoMedia();
