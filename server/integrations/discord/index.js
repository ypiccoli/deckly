// Integração com o Discord, em dois modos.
//
//   teclado (padrão) — simula os atalhos do Discord. Funciona para qualquer
//     pessoa, sem cadastro nenhum, mas é cego: o Discord não conta se você
//     está mudo, então os botões não acendem, e navegar entre canais depende
//     de digitar nomes no Quick Switcher.
//
//   rpc — fala com o Discord pelo canal local (named pipe). Sabe o estado de
//     verdade (mudo, surdo, canal atual), então os botões acendem, e lista
//     servidores e canais reais para entrar num toque. O preço é criar um app
//     no portal de desenvolvedores do Discord: o escopo `rpc` só vale para o
//     dono do app e uma lista de testadores até a Discord aprovar. Serve
//     para quem monta o próprio deck; não serve para distribuir.
//
// É por isso que o template público continua em `teclado` e o modo `rpc` é
// opt-in — cada um resolve um problema diferente.
//
// "Transmitir" (Go Live) não existe em nenhum dos dois: o Discord não expõe
// isso nem por API, nem por RPC, nem por tecla de atalho.

const EventEmitter = require('events');
const atalhos = require('../atalhos');
const { ClienteRpcDiscord } = require('./rpc');

const PADROES = {
  DISCORD_TECLA_MUDO: 'CTRL+SHIFT+M',
  DISCORD_TECLA_SURDO: 'CTRL+SHIFT+D',
  DISCORD_TECLA_ATENDER: 'CTRL+ENTER',
  DISCORD_TECLA_RECUSAR: 'ESC',
  DISCORD_TECLA_PAINEL_SOM: 'CTRL+SHIFT+B',
  DISCORD_TECLA_SERVIDOR_ANTERIOR: 'CTRL+ALT+UP',
  DISCORD_TECLA_SERVIDOR_PROXIMO: 'CTRL+ALT+DOWN',
  DISCORD_TECLA_CANAL_ANTERIOR: 'ALT+UP',
  DISCORD_TECLA_CANAL_PROXIMO: 'ALT+DOWN',
  DISCORD_TECLA_LIGACAO_ATUAL: 'CTRL+SHIFT+ALT+V',
  DISCORD_TECLA_BUSCA: 'CTRL+K',
};

const PROCESSO = 'Discord';
const ESCOPOS_RPC = ['rpc', 'rpc.voice.read', 'rpc.voice.write'];
const ATRASO_RECONEXAO_INICIAL_MS = 5000;
const ATRASO_RECONEXAO_MAXIMO_MS = 60000;

class IntegracaoDiscord extends EventEmitter {
  constructor() {
    super();
    this.nome = 'discord';
    this.estado = {
      modo: 'teclado',
      conectado: false,
      mudo: false,
      surdo: false,
      canal: null,
      servidor: null,
    };

    this.rpc = null;
    this._timeoutReconexao = null;
    this._atrasoReconexao = ATRASO_RECONEXAO_INICIAL_MS;
    this._avisouFalha = false;
  }

  get modo() {
    return String(process.env.DISCORD_MODO || 'teclado').toLowerCase() === 'rpc' ? 'rpc' : 'teclado';
  }

  _atualizarEstado(parcial) {
    this.estado = { ...this.estado, ...parcial };
    this.emit('estado', this.estado);
  }

  /* ================= modo teclado ================= */

  get _focarAntes() {
    return String(process.env.DISCORD_FOCAR_ANTES || 'true').toLowerCase() !== 'false';
  }

  _combo(chave) {
    return process.env[chave] || PADROES[chave];
  }

  async _tecla(chave) {
    const combo = this._combo(chave);
    if (!combo) throw new Error(`Atalho ${chave} não configurado.`);
    if (this._focarAntes) await atalhos.acoes.focarProcesso({ processo: PROCESSO });
    return atalhos.acoes.enviarTeclas({ combo });
  }

  get destinos() {
    return String(process.env.DISCORD_DESTINOS || '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
  }

  // Quick Switcher: foca, abre a busca, digita e confirma. É o caminho do
  // modo teclado — no modo rpc entramos no canal pelo id, sem digitar nada.
  async _irParaPorBusca(nome) {
    if (!nome) throw new Error('Nenhum destino informado.');
    await atalhos.acoes.focarProcesso({ processo: PROCESSO });
    await atalhos.acoes.enviarTeclas({ combo: this._combo('DISCORD_TECLA_BUSCA') });
    await atalhos.acoes.digitarTexto({ texto: nome });
    // A busca do Discord é assíncrona; sem esta pausa o ENTER chega antes do
    // resultado aparecer e não seleciona nada.
    await new Promise((r) => setTimeout(r, 450));
    await atalhos.acoes.enviarTeclas({ combo: 'ENTER' });
    return { ok: true, destino: nome };
  }

  /* ================= modo rpc ================= */

  _credenciaisRpc() {
    return {
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      accessToken: process.env.DISCORD_ACCESS_TOKEN,
    };
  }

  _garantirRpc() {
    if (this.modo !== 'rpc') {
      throw new Error('Esta ação exige o modo RPC. Mude na aba Integrações.');
    }
    if (!this.rpc || !this.rpc.autenticado) {
      throw new Error('RPC do Discord não está conectado. Abra o Discord e confira as credenciais.');
    }
  }

  _agendarReconexaoRpc() {
    if (this._timeoutReconexao || this.modo !== 'rpc') return;
    const atraso = this._atrasoReconexao;
    this._atrasoReconexao = Math.min(atraso * 2, ATRASO_RECONEXAO_MAXIMO_MS);
    this._timeoutReconexao = setTimeout(() => {
      this._timeoutReconexao = null;
      this._conectarRpc().catch(() => {});
    }, atraso);
    if (this._timeoutReconexao.unref) this._timeoutReconexao.unref();
  }

  async _conectarRpc() {
    const { clientId, clientSecret, accessToken } = this._credenciaisRpc();
    if (!clientId || !clientSecret) {
      console.log('[discord] Modo RPC sem Client ID/Secret — preencha na aba Integrações.');
      return;
    }
    if (!accessToken) {
      console.log('[discord] Modo RPC ainda não autorizado — use "Conectar ao Discord" na aba Integrações.');
      return;
    }

    if (this.rpc) this.rpc.desconectar();

    this.rpc = new ClienteRpcDiscord({
      clientId,
      clientSecret,
      accessToken,
      aoMudarEstado: (evento, dados) => this._tratarEventoRpc(evento, dados),
      aoDesconectar: () => {
        this._atualizarEstado({ conectado: false });
        this._agendarReconexaoRpc();
      },
    });

    try {
      await this.rpc.conectar();
      await this.rpc.autenticar();

      await this.rpc.assinar('VOICE_SETTINGS_UPDATE');
      await this.rpc.assinar('VOICE_CHANNEL_SELECT');

      await this._sincronizarEstadoRpc();

      this._atrasoReconexao = ATRASO_RECONEXAO_INICIAL_MS;
      this._avisouFalha = false;
      console.log(`[discord] RPC conectado${this.rpc.usuario ? ` como ${this.rpc.usuario.username}` : ''}.`);
    } catch (erro) {
      if (!this._avisouFalha) {
        this._avisouFalha = true;
        console.log(`[discord] RPC indisponível (${erro.message}). Tentando em segundo plano.`);
      }
      this._atualizarEstado({ conectado: false });
      this._agendarReconexaoRpc();
    }
  }

  async _sincronizarEstadoRpc() {
    const voz = await this.rpc.obterConfiguracaoVoz();
    let canal = null;
    try {
      canal = await this.rpc.obterCanalAtual();
    } catch {
      // Fora de canal de voz o Discord responde erro em vez de null.
    }
    this._atualizarEstado({
      modo: 'rpc',
      conectado: true,
      mudo: Boolean(voz.mute),
      surdo: Boolean(voz.deaf),
      canal: canal?.name || null,
      servidor: canal?.guild_id || null,
    });
  }

  _tratarEventoRpc(evento, dados) {
    if (evento === 'VOICE_SETTINGS_UPDATE') {
      this._atualizarEstado({ mudo: Boolean(dados.mute), surdo: Boolean(dados.deaf) });
    } else if (evento === 'VOICE_CHANNEL_SELECT') {
      // channel_id null = saiu do canal.
      if (!dados.channel_id) {
        this._atualizarEstado({ canal: null, servidor: null });
      } else {
        this.rpc
          .obterCanalAtual()
          .then((c) => this._atualizarEstado({ canal: c?.name || null, servidor: c?.guild_id || null }))
          .catch(() => {});
      }
    }
  }

  // Chamada pela rota de autorização. Conecta sem token só para pedir a
  // aprovação, e devolve o access_token para quem chamou gravar no .env.
  async autorizarRpc() {
    const { clientId, clientSecret } = this._credenciaisRpc();
    if (!clientId || !clientSecret) {
      throw new Error('Preencha o Client ID e o Client Secret do Discord antes de autorizar.');
    }
    const cliente = new ClienteRpcDiscord({ clientId, clientSecret });
    try {
      await cliente.conectar();
      const token = await cliente.autorizar(ESCOPOS_RPC);
      return token;
    } finally {
      cliente.desconectar();
    }
  }

  // Servidores e canais de voz, para o seletor. Só existe no modo RPC — é a
  // vantagem concreta dele sobre o modo teclado.
  async listarCanaisDeVoz() {
    this._garantirRpc();
    const { guilds } = await this.rpc.listarServidores();
    const opcoes = [];
    for (const servidor of guilds || []) {
      let canais;
      try {
        ({ channels: canais } = await this.rpc.listarCanais(servidor.id));
      } catch {
        continue; // Servidor sem permissão de leitura: pula.
      }
      for (const canal of canais || []) {
        // type 2 = canal de voz na API do Discord.
        if (canal.type !== 2) continue;
        opcoes.push({
          id: canal.id,
          nome: canal.name,
          detalhe: servidor.name,
          ativo: this.estado.canal === canal.name,
        });
      }
    }
    return opcoes;
  }

  /* ================= ciclo de vida ================= */

  async inicializar() {
    if (this.modo !== 'rpc') {
      this._atualizarEstado({ modo: 'teclado', conectado: false });
      return;
    }
    await this._conectarRpc();
  }

  async reconfigurar() {
    clearTimeout(this._timeoutReconexao);
    this._timeoutReconexao = null;
    this._atrasoReconexao = ATRASO_RECONEXAO_INICIAL_MS;
    this._avisouFalha = false;
    if (this.rpc) {
      this.rpc.desconectar();
      this.rpc = null;
    }
    this._atualizarEstado({ modo: this.modo, conectado: false, canal: null, servidor: null });
    await this.inicializar();
  }

  /* ================= catálogo e configuração ================= */

  get configuracao() {
    const ehRpc = this.modo === 'rpc';
    const campos = [
      {
        env: 'DISCORD_MODO',
        rotulo: 'Modo',
        tipo: 'lista',
        opcoes: [
          { valor: 'teclado', rotulo: 'Atalhos de teclado (funciona sem cadastro)' },
          { valor: 'rpc', rotulo: 'RPC (botões acendem, exige app no Discord)' },
        ],
        padrao: 'teclado',
        ajuda: 'RPC dá estado ao vivo e lista os canais de verdade, mas exige criar um app no portal do Discord.',
      },
    ];

    if (ehRpc) {
      campos.push(
        {
          env: 'DISCORD_CLIENT_ID',
          rotulo: 'Client ID (Discord)',
          tipo: 'senha',
        },
        {
          env: 'DISCORD_CLIENT_SECRET',
          rotulo: 'Client Secret (Discord)',
          tipo: 'senha',
        },
      );
    } else {
      campos.push(
        {
          env: 'DISCORD_FOCAR_ANTES',
          rotulo: 'Trazer o Discord para frente antes',
          tipo: 'booleano',
          padrao: 'true',
          ajuda: 'Necessário para os atalhos padrão, que só valem com o Discord em foco.',
        },
        {
          env: 'DISCORD_DESTINOS',
          rotulo: 'Ir para (canais e servidores)',
          tipo: 'texto',
          ajuda: 'Separados por vírgula. No modo RPC isto não é necessário — os canais são listados sozinhos.',
        },
        { env: 'DISCORD_TECLA_MUDO', rotulo: 'Ativar/desativar microfone', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_MUDO },
        { env: 'DISCORD_TECLA_SURDO', rotulo: 'Ativar/desativar áudio (surdo)', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_SURDO },
        { env: 'DISCORD_TECLA_ATENDER', rotulo: 'Atender chamada', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_ATENDER },
        { env: 'DISCORD_TECLA_RECUSAR', rotulo: 'Recusar chamada', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_RECUSAR },
        { env: 'DISCORD_TECLA_PAINEL_SOM', rotulo: 'Alternar painel de som', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_PAINEL_SOM },
        { env: 'DISCORD_TECLA_CANAL_ANTERIOR', rotulo: 'Canal anterior', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_CANAL_ANTERIOR },
        { env: 'DISCORD_TECLA_CANAL_PROXIMO', rotulo: 'Próximo canal', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_CANAL_PROXIMO },
        { env: 'DISCORD_TECLA_SERVIDOR_ANTERIOR', rotulo: 'Servidor anterior', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_SERVIDOR_ANTERIOR },
        { env: 'DISCORD_TECLA_SERVIDOR_PROXIMO', rotulo: 'Próximo servidor', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_SERVIDOR_PROXIMO },
        { env: 'DISCORD_TECLA_LIGACAO_ATUAL', rotulo: 'Ir para a ligação atual', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_LIGACAO_ATUAL },
        { env: 'DISCORD_TECLA_BUSCA', rotulo: 'Abrir a busca (Quick Switcher)', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_BUSCA },
      );
    }

    return {
      rotulo: 'Discord',
      resumo: ehRpc
        ? 'Mudo, surdo e canais — com estado ao vivo nos botões.'
        : 'Mudo, surdo e navegação — por atalho de teclado.',
      aviso: ehRpc
        ? 'O modo RPC exige um app seu no portal de desenvolvedores do Discord. Ele funciona ' +
          'para você (dono do app) e para quem você cadastrar como testador — não serve para ' +
          'distribuir o deck para outras pessoas.'
        : 'Usa os atalhos que já vêm no Discord, que só funcionam com ele em foco — por isso ' +
          'cada botão traz o Discord para frente. Os botões não acendem: neste modo o Discord ' +
          'não informa se você está mudo. Mude para RPC se quiser retorno visual.',
      comoObter: ehRpc
        ? [
            'Entre em discord.com/developers/applications e clique em "New Application".',
            'Em OAuth2, copie o Client ID e o Client Secret para os campos abaixo e salve.',
            'Ainda em OAuth2 > Redirects, adicione http://127.0.0.1 (o RPC exige o campo, mas não redireciona nada).',
            'Com o Discord aberto, clique em "Conectar ao Discord" e aprove a janela que aparecer.',
          ]
        : [
            'Nada a fazer: já usa os atalhos padrão do Discord.',
            'Para conferir: Discord > Configurações do Usuário > Atalhos de teclado.',
            'Em "Ir para (canais e servidores)", liste nomes separados por vírgula para o seletor.',
          ],
      campos,
      autorizacao: ehRpc
        ? {
            url: '/discord/autorizar',
            rotulo: 'Conectar ao Discord',
            pronto: Boolean(process.env.DISCORD_ACCESS_TOKEN),
            precisaAntes: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
          }
        : null,
    };
  }

  get catalogo() {
    const ehRpc = this.modo === 'rpc';
    const disponivel = ehRpc ? this.estado.conectado : Boolean(atalhos.catalogo.disponivel);
    const acao = (rotulo) => ({ rotulo, parametros: [] });

    const acoes = {
      alternarMudo: acao('Ativar/desativar microfone'),
      alternarSurdo: acao('Ativar/desativar áudio (surdo)'),
    };

    if (ehRpc) {
      Object.assign(acoes, {
        sairDoCanal: acao('Sair do canal de voz'),
        entrarNoCanal: {
          rotulo: 'Entrar num canal de voz',
          parametros: [
            { nome: 'canalId', rotulo: 'ID do canal', tipo: 'texto', obrigatorio: false },
          ],
          aceitaLista: true,
        },
      });
    } else {
      Object.assign(acoes, {
        atenderChamada: acao('Atender chamada'),
        recusarChamada: acao('Recusar chamada'),
        painelSom: acao('Alternar painel de som'),
        canalAnterior: acao('Canal anterior'),
        canalProximo: acao('Próximo canal'),
        servidorAnterior: acao('Servidor anterior'),
        servidorProximo: acao('Próximo servidor'),
        ligacaoAtual: acao('Ir para a ligação atual'),
        abrirBusca: acao('Abrir a busca do Discord'),
        irPara: {
          rotulo: 'Ir para um canal ou servidor',
          parametros: [
            { nome: 'destino', rotulo: 'Nome do canal ou servidor', tipo: 'texto', obrigatorio: false },
          ],
          aceitaLista: true,
        },
      });
    }

    return {
      rotulo: 'Discord',
      disponivel,
      motivoIndisponivel: disponivel
        ? null
        : ehRpc
          ? 'RPC não conectado — abra o Discord e confira as credenciais na aba Integrações.'
          : 'Depende dos atalhos do Windows, que só funcionam no Windows ou no WSL2.',
      // Só o modo RPC tem estado: no modo teclado o Discord não informa nada,
      // e um botão que promete acender e não acende é pior que um que não
      // promete.
      estados: ehRpc
        ? [
            { chave: 'discord.mudo', rotulo: 'Microfone mudo', tipo: 'booleano' },
            { chave: 'discord.surdo', rotulo: 'Áudio desligado (surdo)', tipo: 'booleano' },
            { chave: 'discord.canal', rotulo: 'Canal de voz atual', tipo: 'texto' },
            { chave: 'discord.conectado', rotulo: 'Discord conectado', tipo: 'booleano' },
          ]
        : [],
      listas: ehRpc
        ? [{ fonte: '/discord/canais', rotulo: 'Canais de voz', acaoSugerida: 'entrarNoCanal' }]
        : [{ fonte: '/discord/destinos', rotulo: 'Canais e servidores', acaoSugerida: 'irPara' }],
      acoes,
    };
  }

  get acoes() {
    const ehRpc = () => this.modo === 'rpc';

    return {
      alternarMudo: async () => {
        if (!ehRpc()) return this._tecla('DISCORD_TECLA_MUDO');
        this._garantirRpc();
        // Lê antes de escrever: o RPC não tem "alternar", só "definir".
        const atual = await this.rpc.obterConfiguracaoVoz();
        await this.rpc.definirConfiguracaoVoz({ mute: !atual.mute });
        return this.estado;
      },
      alternarSurdo: async () => {
        if (!ehRpc()) return this._tecla('DISCORD_TECLA_SURDO');
        this._garantirRpc();
        const atual = await this.rpc.obterConfiguracaoVoz();
        await this.rpc.definirConfiguracaoVoz({ deaf: !atual.deaf });
        return this.estado;
      },

      // Só no modo RPC
      entrarNoCanal: async (parametros = {}) => {
        this._garantirRpc();
        const id = parametros.opcaoId || parametros.canalId;
        if (!id) throw new Error('Nenhum canal informado.');
        await this.rpc.entrarNoCanal(String(id));
        return this.estado;
      },
      sairDoCanal: async () => {
        this._garantirRpc();
        await this.rpc.entrarNoCanal(null);
        return this.estado;
      },

      // Só no modo teclado
      atenderChamada: () => this._tecla('DISCORD_TECLA_ATENDER'),
      recusarChamada: () => this._tecla('DISCORD_TECLA_RECUSAR'),
      painelSom: () => this._tecla('DISCORD_TECLA_PAINEL_SOM'),
      canalAnterior: () => this._tecla('DISCORD_TECLA_CANAL_ANTERIOR'),
      canalProximo: () => this._tecla('DISCORD_TECLA_CANAL_PROXIMO'),
      servidorAnterior: () => this._tecla('DISCORD_TECLA_SERVIDOR_ANTERIOR'),
      servidorProximo: () => this._tecla('DISCORD_TECLA_SERVIDOR_PROXIMO'),
      ligacaoAtual: () => this._tecla('DISCORD_TECLA_LIGACAO_ATUAL'),
      abrirBusca: () => this._tecla('DISCORD_TECLA_BUSCA'),
      irPara: (parametros = {}) => this._irParaPorBusca(parametros.opcaoId || parametros.destino),
    };
  }
}

module.exports = new IntegracaoDiscord();
