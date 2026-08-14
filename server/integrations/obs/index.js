// Integração com o OBS Studio via obs-websocket v5 (pacote obs-websocket-js).
//
// Requer o WebSocket Server do OBS habilitado em:
//   Ferramentas > WebSocket Server Settings > Enable WebSocket server
// e as credenciais preenchidas em OBS_WEBSOCKET_* no .env.

const EventEmitter = require('events');
const OBSWebSocket = require('obs-websocket-js').default;

// A reconexão começa rápida (quem fechou o OBS por um instante volta logo) e
// vai desacelerando até um minuto. Sem esse teto, quem nunca abre o OBS teria
// uma tentativa a cada 5 segundos para sempre.
const ATRASO_RECONEXAO_INICIAL_MS = 5000;
const ATRASO_RECONEXAO_MAXIMO_MS = 60000;
// Prazo da tentativa de conexão — veja o comentário em _conectarComPrazo().
const TEMPO_LIMITE_CONEXAO_MS = 8000;

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
    // Diferente de Spotify e Hue, o OBS não precisa de credencial nenhuma
    // para funcionar — então não dá para deduzir "não configurado" da
    // ausência de .env. Quem não usa OBS desliga aqui.
    this.habilitado = String(process.env.OBS_HABILITADO || 'true').toLowerCase() !== 'false';
    this._timeoutReconexao = null;
    this._reconfigurando = false;
    this._atrasoReconexao = ATRASO_RECONEXAO_INICIAL_MS;
    // O aviso de "não achei o OBS" sai uma vez só. As tentativas seguintes
    // são silenciosas: é o caso normal de quem nunca vai abrir o OBS, e um
    // log repetido só esconderia o que importa.
    this._jaAvisouOffline = false;
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
      // Desconexão que nós mesmos pedimos (ao reconfigurar) não é queda: não
      // merece aviso nem reagendamento — quem chamou já vai reconectar.
      if (this._reconfigurando) {
        this._atualizarEstado({ conectado: false });
        return;
      }
      if (this.estado.conectado) {
        // Estava conectado e caiu: o OBS fechou ou travou. Aqui o aviso vale,
        // e a espera volta ao começo para reconectar rápido quando reabrir.
        console.warn('[obs] Conexão com o OBS caiu. Tentando reconectar...');
        this._atrasoReconexao = ATRASO_RECONEXAO_INICIAL_MS;
        this._jaAvisouOffline = true;
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
    if (this._timeoutReconexao || !this.habilitado) return;
    const atraso = this._atrasoReconexao;
    this._atrasoReconexao = Math.min(atraso * 2, ATRASO_RECONEXAO_MAXIMO_MS);
    this._timeoutReconexao = setTimeout(() => {
      this._timeoutReconexao = null;
      this.inicializar().catch(() => {});
    }, atraso);
    // Não segura o processo vivo só por causa da tentativa agendada.
    if (this._timeoutReconexao.unref) this._timeoutReconexao.unref();
  }

  // Por que não chamar `this.obs.connect()` direto: quando ninguém atende na
  // porta, o `connect()` do obs-websocket-js depende do socket devolver erro
  // para rejeitar. Numa recusa limpa (Windows) isso é imediato, mas quando a
  // rede engole a tentativa em silêncio — o caso do WSL2 em modo espelhado,
  // que fica esperando o Windows responder — a promessa nunca resolve nem
  // rejeita. Sem prazo, a primeira tentativa ficaria pendurada para sempre e
  // a reconexão nunca chegaria a ser agendada: o OBS não conectaria nem
  // depois de aberto.
  async _conectarComPrazo(url, senha) {
    let expirar;
    const prazo = new Promise((_, rejeitar) => {
      expirar = setTimeout(
        () => rejeitar(new Error(`sem resposta em ${TEMPO_LIMITE_CONEXAO_MS / 1000}s`)),
        TEMPO_LIMITE_CONEXAO_MS,
      );
    });

    try {
      await Promise.race([this.obs.connect(url, senha), prazo]);
    } catch (erro) {
      // Deixa o socket meio aberto para trás e a próxima tentativa herdaria a
      // bagunça — o connect() só troca de socket depois de desconectar.
      await this.obs.disconnect().catch(() => {});
      throw erro;
    } finally {
      clearTimeout(expirar);
    }
  }

  async inicializar() {
    if (!this.habilitado) {
      console.log('[obs] Desligado por OBS_HABILITADO=false no .env — módulo inativo.');
      return;
    }

    const host = process.env.OBS_WEBSOCKET_HOST || 'localhost';
    const porta = process.env.OBS_WEBSOCKET_PORT || 4455;
    const senha = process.env.OBS_WEBSOCKET_PASSWORD || undefined;

    try {
      await this._conectarComPrazo(`ws://${host}:${porta}`, senha);

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
      this._atrasoReconexao = ATRASO_RECONEXAO_INICIAL_MS;
      this._jaAvisouOffline = false;
      console.log('[obs] Conectado ao OBS WebSocket.');
    } catch (erro) {
      if (!this._jaAvisouOffline) {
        this._jaAvisouOffline = true;
        // Numa recusa de conexão o obs-websocket-js devolve o erro sem
        // mensagem, e "( )" no log só confunde.
        const motivo = erro.message || 'conexão recusada';
        console.log(
          `[obs] OBS não encontrado em ${host}:${porta} (${motivo}). ` +
            'Vou tentando em segundo plano — abra o OBS com o WebSocket Server ligado e ' +
            'ele conecta sozinho. Se você não usa OBS, ponha OBS_HABILITADO=false no .env.',
        );
      }
      this._agendarReconexao();
    }
  }

  // O que a tela de configuração precisa perguntar para esta integração
  // funcionar. Mesma ideia do getter `catalogo`: quem sabe o que precisa é a
  // integração, não a UI — assim uma integração nova aparece sozinha na tela
  // de credenciais.
  get configuracao() {
    return {
      rotulo: 'OBS Studio',
      resumo: 'Trocar de cena, mutar o microfone e gravar.',
      comoObter: [
        'Abra o OBS e vá em Ferramentas > Configurações do Servidor WebSocket.',
        'Marque "Ativar servidor WebSocket".',
        'Se houver senha ali, copie para o campo abaixo. Sem senha, deixe em branco.',
      ],
      campos: [
        {
          env: 'OBS_HABILITADO',
          rotulo: 'Usar o OBS',
          tipo: 'booleano',
          padrao: 'true',
          ajuda: 'Desligue se você não usa OBS — evita tentativas de conexão à toa.',
        },
        { env: 'OBS_WEBSOCKET_HOST', rotulo: 'Endereço', tipo: 'texto', padrao: 'localhost' },
        { env: 'OBS_WEBSOCKET_PORT', rotulo: 'Porta', tipo: 'numero', padrao: '4455' },
        {
          env: 'OBS_WEBSOCKET_PASSWORD',
          rotulo: 'Senha do WebSocket',
          tipo: 'senha',
          ajuda: 'Deixe em branco se você não definiu senha no OBS.',
        },
        {
          env: 'OBS_MIC_INPUT_NAME',
          rotulo: 'Nome da fonte de microfone',
          tipo: 'texto',
          padrao: 'Mic/Aux',
          ajuda: 'Precisa bater com o nome que aparece no mixer de áudio do OBS.',
        },
      ],
    };
  }

  // Chamada depois que a tela de configuração grava as credenciais: relê o
  // .env e reconecta, para não exigir reinício do servidor.
  async reconfigurar() {
    this.habilitado = String(process.env.OBS_HABILITADO || 'true').toLowerCase() !== 'false';
    this.nomeEntradaMic = process.env.OBS_MIC_INPUT_NAME || 'Mic/Aux';

    clearTimeout(this._timeoutReconexao);
    this._timeoutReconexao = null;
    this._atrasoReconexao = ATRASO_RECONEXAO_INICIAL_MS;
    this._jaAvisouOffline = false;

    this._reconfigurando = true;
    try {
      await this.obs.disconnect().catch(() => {});
    } finally {
      this._reconfigurando = false;
    }

    if (!this.habilitado) return;
    await this.inicializar();
  }

  _motivoIndisponivel() {
    if (!this.habilitado) return 'Desligado por OBS_HABILITADO=false no .env.';
    if (this.estado.conectado) return null;
    return 'OBS não conectado — abra o OBS com o WebSocket Server ligado (ele reconecta sozinho).';
  }

  // Descreve o que esta integração oferece, para a tela de configuração
  // conseguir montar os formulários sozinha (veja GET /api/catalogo).
  get catalogo() {
    return {
      rotulo: 'OBS Studio',
      disponivel: this.estado.conectado,
      motivoIndisponivel: this._motivoIndisponivel(),
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
