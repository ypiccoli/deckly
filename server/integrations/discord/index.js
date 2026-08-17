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

// O Discord é instalado pelo Squirrel, não pela Store: o caminho real é uma
// pasta `app-1.0.xxxx` que muda a cada atualização automática. O Update.exe
// fica fora dela e sempre lança a versão mais nova — é o único alvo estável.
const LANCADOR_DISCORD = '%LOCALAPPDATA%\\Discord\\Update.exe';
const ARGUMENTOS_LANCADOR = '--processStart Discord.exe';

// Como reconhecer o canal de ausentes. O RPC não expõe o `afk_channel_id`
// que a guild tem na API HTTP, então só resta o nome — e na prática ele é
// sempre uma variação destes. Ajustável por DISCORD_NOMES_AFK.
const NOMES_AFK_PADRAO = 'afk, ausente, ausentes, away, inativo, inativos';

class IntegracaoDiscord extends EventEmitter {
  constructor() {
    super();
    this.nome = 'discord';
    this.estado = {
      modo: 'teclado',
      conectado: false,
      mudo: false,
      surdo: false,
      emChamada: false,
      noAfk: false,
      podeVoltar: false,
      canal: null,
      canalId: null,
      servidor: null,
      servidorId: null,
    };

    this.rpc = null;
    this._nomesServidores = new Map(); // guild_id -> nome, preenchido sob demanda
    // Último canal de voz diferente do atual, para o botão "Voltar".
    this._canalAnterior = null; // { id, nome }
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

  // Desligar o foco só é seguro para atalhos GLOBAIS, que a pessoa criou em
  // "Teclas de Atalho". Os embutidos (o que vale quando a variável está em
  // branco) só funcionam com o Discord em foco: mandá-los sem focar não faz
  // nada — pior, aciona o atalho na janela que estiver aberta. Por isso a
  // flag vale por atalho, e não global: quem não configurou nada sempre foca.
  _precisaFocar(chave) {
    const temAtalhoProprio = Boolean(process.env[chave]);
    return temAtalhoProprio ? this._focarAntes : true;
  }

  async _tecla(chave) {
    const combo = this._combo(chave);
    if (!combo) throw new Error(`Atalho ${chave} não configurado.`);
    if (this._precisaFocar(chave)) await this._focarOuAbrir();
    return atalhos.acoes.enviarTeclas({ combo });
  }

  // Traz o Discord para frente; se ele não estiver aberto, lança e espera a
  // janela aparecer. O `abrirUwp` que este projeto usava antes só funcionava
  // por acaso: o Squirrel registra um AppUserModelID no shell, mas ele não é
  // um app empacotado, então `shell:AppsFolder` acertava ou não conforme o
  // estado do cache do Explorer — daí o "às vezes abre".
  async _focarOuAbrir() {
    try {
      await atalhos.acoes.focarProcesso({ processo: PROCESSO });
      return { ok: true, resultado: 'focado' };
    } catch {
      await atalhos.acoes.abrirApp({
        caminho: LANCADOR_DISCORD,
        argumentos: ARGUMENTOS_LANCADOR,
      });
      // O Discord demora a desenhar a janela; sem esperar, um focarProcesso
      // logo em seguida ainda não acharia nada.
      for (let tentativa = 0; tentativa < 10; tentativa++) {
        await new Promise((r) => setTimeout(r, 800));
        try {
          await atalhos.acoes.focarProcesso({ processo: PROCESSO });
          return { ok: true, resultado: 'aberto' };
        } catch {
          // ainda subindo
        }
      }
      return { ok: true, resultado: 'aberto', aviso: 'Abri o Discord, mas a janela demorou a aparecer.' };
    }
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

  // Fora de canal de voz o Discord responde erro em vez de devolver null.
  async _canalAtual() {
    try {
      return await this.rpc.obterCanalAtual();
    } catch {
      return null;
    }
  }

  // O canal só traz o guild_id; o nome do servidor vem de GET_GUILDS, que é
  // caro para chamar a cada troca de canal — daí o cache.
  async _nomeServidor(guildId) {
    if (!guildId) return null;
    if (this._nomesServidores.has(guildId)) return this._nomesServidores.get(guildId);
    try {
      const { guilds } = await this.rpc.listarServidores();
      for (const g of guilds || []) this._nomesServidores.set(g.id, g.name);
    } catch {
      return null;
    }
    return this._nomesServidores.get(guildId) || null;
  }

  async _aplicarCanal(canal) {
    // Guarda de onde viemos antes de sobrescrever, para o botão "Voltar".
    // Sair do canal (canal null) não conta como destino: senão "Voltar"
    // depois de desligar tentaria entrar em lugar nenhum.
    const anterior = this.estado;
    if (anterior.canalId && anterior.canalId !== canal?.id) {
      this._canalAnterior = { id: anterior.canalId, nome: anterior.canal };
    }

    this._atualizarEstado({
      emChamada: Boolean(canal?.id),
      // Acende o botão de AFK enquanto você está no canal de ausentes.
      noAfk: Boolean(canal?.id) && this._pareceAfk(canal.name),
      // O "Voltar" só acende quando há de fato para onde voltar — antes
      // usava emChamada e vivia aceso, prometendo o que não podia cumprir.
      podeVoltar: Boolean(this._canalAnterior?.id && this._canalAnterior.id !== canal?.id),
      canal: canal?.name || null,
      canalId: canal?.id || null,
      servidorId: canal?.guild_id || null,
      servidor: await this._nomeServidor(canal?.guild_id),
    });
  }

  async _sincronizarEstadoRpc() {
    const voz = await this.rpc.obterConfiguracaoVoz();
    this._atualizarEstado({
      modo: 'rpc',
      conectado: true,
      mudo: Boolean(voz.mute),
      surdo: Boolean(voz.deaf),
    });
    await this._aplicarCanal(await this._canalAtual());
  }

  _tratarEventoRpc(evento, dados) {
    if (evento === 'VOICE_SETTINGS_UPDATE') {
      this._atualizarEstado({ mudo: Boolean(dados.mute), surdo: Boolean(dados.deaf) });
    } else if (evento === 'VOICE_CHANNEL_SELECT') {
      // channel_id null = saiu do canal.
      if (!dados.channel_id) {
        this._aplicarCanal(null).catch(() => {});
      } else {
        this._canalAtual()
          .then((c) => this._aplicarCanal(c))
          .catch(() => {});
      }
    }
  }

  get _nomesAfk() {
    return String(process.env.DISCORD_NOMES_AFK || NOMES_AFK_PADRAO)
      .split(',')
      .map((n) => this._normalizar(n))
      .filter(Boolean);
  }

  // Nomes de canal vêm cheios de emoji, caixa alta e enfeite —
  // "🔇 AUSENTES 🔇", "┃💤・afk". Reduz a letras e números sem acento para
  // comparar só o que importa.
  _normalizar(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  // Uma regra só, usada pela ação de AFK e pelo estado que acende o botão —
  // senão o botão poderia levar a um canal que ele não reconhece como AFK.
  _pareceAfk(nomeDoCanal) {
    const nome = this._normalizar(nomeDoCanal);
    if (!nome) return false;
    return this._nomesAfk.some((termo) => nome.includes(termo));
  }

  // Canais de voz do servidor atual, em ordem de exibição. Usado tanto pela
  // navegação quanto pela busca do AFK.
  async _canaisDeVozDoServidor(guildId) {
    const { channels } = await this.rpc.listarCanais(guildId);
    return (channels || [])
      .filter((c) => c.type === 2)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  // Vai para o canal de ausentes do servidor em que você está. O RPC não
  // entrega o afk_channel_id da guild (só a API HTTP tem, e ela exigiria um
  // bot no servidor), então o canal é reconhecido pelo nome.
  async _irParaAfk() {
    this._garantirRpc();
    const atual = await this._canalAtual();
    if (!atual?.id) {
      throw new Error('Entre num canal de voz primeiro — o AFK é procurado no servidor em que você está.');
    }

    const vozes = await this._canaisDeVozDoServidor(atual.guild_id);
    const afk = vozes.find((c) => this._pareceAfk(c.name));

    if (!afk) {
      const servidor = (await this._nomeServidor(atual.guild_id)) || 'este servidor';
      throw new Error(`Não achei um canal de ausentes em ${servidor}.`);
    }
    if (afk.id === atual.id) {
      throw new Error('Você já está no canal de ausentes.');
    }

    await this.rpc.entrarNoCanal(String(afk.id), { forcar: true });
    return { ok: true, canal: afk.name };
  }

  // Volta para o último canal de voz diferente do atual. Apertar duas vezes
  // alterna entre os dois — é o que se espera de um "voltar".
  async _voltarAoCanalAnterior() {
    this._garantirRpc();
    if (!this._canalAnterior?.id) {
      throw new Error('Ainda não há canal anterior nesta sessão — entre em dois canais para o botão ter para onde voltar.');
    }
    if (this._canalAnterior.id === this.estado.canalId) {
      throw new Error('Você já está no canal anterior.');
    }

    const destino = this._canalAnterior;
    await this.rpc.entrarNoCanal(String(destino.id), { forcar: this.estado.emChamada });
    return { ok: true, canal: destino.nome };
  }

  // Canal anterior/próximo de verdade: anda pela lista de canais de VOZ do
  // servidor em que você está e entra no vizinho. No modo teclado isto era
  // ALT+UP/ALT+DOWN, que move a seleção na lista de canais de TEXTO da barra
  // lateral — nunca trocou de canal de voz, mesmo com o Discord em foco.
  async _navegarCanalDeVoz(passo) {
    this._garantirRpc();
    const atual = await this._canalAtual();
    if (!atual?.id) {
      throw new Error('Você não está em nenhum canal de voz. Entre em um pelo botão "Canais".');
    }

    const { channels } = await this.rpc.listarCanais(atual.guild_id);
    const vozes = (channels || [])
      .filter((c) => c.type === 2)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    if (vozes.length < 2) throw new Error('Este servidor não tem outro canal de voz.');

    const indice = vozes.findIndex((c) => c.id === atual.id);
    const alvo = vozes[(((indice + passo) % vozes.length) + vozes.length) % vozes.length];
    // Sempre `forcar`: por definição já estamos num canal aqui.
    await this.rpc.entrarNoCanal(String(alvo.id), { forcar: true });
    return { ok: true, canal: alvo.name };
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
          // Por id, não por nome: "Geral" existe em metade dos servidores, e
          // comparar por nome acendia o canal errado.
          ativo: this.estado.canalId === canal.id,
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
    this._nomesServidores.clear();
    this._canalAnterior = null;
    this._atualizarEstado({
      modo: this.modo,
      conectado: false,
      emChamada: false,
      noAfk: false,
      podeVoltar: false,
      canal: null,
      canalId: null,
      servidor: null,
      servidorId: null,
    });
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
        {
          env: 'DISCORD_NOMES_AFK',
          rotulo: 'Nomes que valem como canal de ausentes',
          tipo: 'texto',
          padrao: NOMES_AFK_PADRAO,
          ajuda:
            'Separados por vírgula, usados pelo botão de AFK. A comparação ignora acento, ' +
            'caixa e emoji, então "🔇 AUSENTES 🔇" casa com "ausentes".',
        },
      );
    } else {
      campos.push({
        env: 'DISCORD_DESTINOS',
        rotulo: 'Ir para (canais e servidores)',
        tipo: 'texto',
        ajuda: 'Separados por vírgula. No modo RPC isto não é necessário — os canais são listados sozinhos.',
      });
    }

    // Mesmo no modo RPC sobram ações sem equivalente no protocolo (atender,
    // recusar, painel de som, busca), que continuam saindo por atalho de
    // teclado. Por isso estes campos valem nos dois modos.
    campos.push(
      {
        env: 'DISCORD_FOCAR_ANTES',
        rotulo: 'Trazer o Discord para frente antes',
        tipo: 'booleano',
        padrao: 'true',
        ajuda:
          'Só desligue se você tiver criado atalhos GLOBAIS próprios em Discord > Teclas de ' +
          'Atalho. Os atalhos embutidos exigem foco, e para eles o Discord é trazido para ' +
          'frente de qualquer jeito.',
      },
      { env: 'DISCORD_TECLA_MUDO', rotulo: 'Ativar/desativar microfone', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_MUDO },
      { env: 'DISCORD_TECLA_SURDO', rotulo: 'Ativar/desativar áudio (surdo)', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_SURDO },
      { env: 'DISCORD_TECLA_ATENDER', rotulo: 'Atender chamada', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_ATENDER },
      { env: 'DISCORD_TECLA_RECUSAR', rotulo: 'Recusar chamada', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_RECUSAR },
      { env: 'DISCORD_TECLA_PAINEL_SOM', rotulo: 'Alternar painel de som', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_PAINEL_SOM },
      { env: 'DISCORD_TECLA_SERVIDOR_ANTERIOR', rotulo: 'Servidor anterior', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_SERVIDOR_ANTERIOR },
      { env: 'DISCORD_TECLA_SERVIDOR_PROXIMO', rotulo: 'Próximo servidor', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_SERVIDOR_PROXIMO },
      { env: 'DISCORD_TECLA_LIGACAO_ATUAL', rotulo: 'Ir para a ligação atual', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_LIGACAO_ATUAL },
      { env: 'DISCORD_TECLA_BUSCA', rotulo: 'Abrir a busca (Quick Switcher)', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_BUSCA },
    );

    if (!ehRpc) {
      campos.push(
        { env: 'DISCORD_TECLA_CANAL_ANTERIOR', rotulo: 'Canal anterior', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_CANAL_ANTERIOR },
        { env: 'DISCORD_TECLA_CANAL_PROXIMO', rotulo: 'Próximo canal', tipo: 'texto', padrao: PADROES.DISCORD_TECLA_CANAL_PROXIMO },
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

    // Valem nos dois modos. As que dependem de atalho de teclado trazem o
    // Discord para frente antes, porque os atalhos embutidos exigem foco.
    const acoes = {
      alternarMudo: acao('Ativar/desativar microfone'),
      alternarSurdo: acao('Ativar/desativar áudio (surdo)'),
      abrirDiscord: acao('Abrir o Discord'),
      canalAnterior: acao(ehRpc ? 'Canal de voz anterior' : 'Canal anterior (na lista)'),
      canalProximo: acao(ehRpc ? 'Próximo canal de voz' : 'Próximo canal (na lista)'),
      atenderChamada: acao('Atender chamada'),
      recusarChamada: acao('Recusar chamada'),
      painelSom: acao('Alternar painel de som'),
      servidorAnterior: acao('Servidor anterior'),
      servidorProximo: acao('Próximo servidor'),
      ligacaoAtual: acao('Ir para a ligação atual'),
      abrirBusca: acao('Abrir a busca do Discord'),
    };

    if (ehRpc) {
      Object.assign(acoes, {
        sairDoCanal: acao('Sair do canal de voz (desligar)'),
        irParaAfk: acao('Ir para o canal de ausentes (AFK)'),
        voltarAoCanalAnterior: acao('Voltar ao canal anterior'),
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
            { chave: 'discord.emChamada', rotulo: 'Em canal de voz', tipo: 'booleano' },
            { chave: 'discord.noAfk', rotulo: 'No canal de ausentes (AFK)', tipo: 'booleano' },
            { chave: 'discord.podeVoltar', rotulo: 'Tem canal anterior para voltar', tipo: 'booleano' },
            { chave: 'discord.canal', rotulo: 'Canal de voz atual', tipo: 'texto' },
            { chave: 'discord.servidor', rotulo: 'Servidor atual', tipo: 'texto' },
            // Não serve para mostrar em tela; é o que a estrela de favoritar
            // usa para saber qual item está sendo exibido.
            { chave: 'discord.canalId', rotulo: 'ID do canal de voz atual', tipo: 'texto' },
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

      // Vale nos dois modos: foca o Discord, e o abre se estiver fechado.
      abrirDiscord: () => this._focarOuAbrir(),

      // Só no modo RPC
      entrarNoCanal: async (parametros = {}) => {
        this._garantirRpc();
        const id = parametros.opcaoId || parametros.canalId;
        if (!id) throw new Error('Nenhum canal informado.');
        // Já estando num canal, trocar exige `forcar` — senão o Discord
        // recusa e o seletor só funcionaria fora de chamada.
        await this.rpc.entrarNoCanal(String(id), { forcar: this.estado.emChamada });
        return this.estado;
      },
      sairDoCanal: async () => {
        this._garantirRpc();
        if (!this.estado.emChamada) throw new Error('Você não está em nenhum canal de voz.');
        await this.rpc.entrarNoCanal(null);
        return this.estado;
      },

      // No modo RPC trocam de canal de voz de verdade; no modo teclado
      // continuam sendo ALT+UP/ALT+DOWN, que só movem a seleção na lista.
      canalAnterior: () =>
        ehRpc() ? this._navegarCanalDeVoz(-1) : this._tecla('DISCORD_TECLA_CANAL_ANTERIOR'),
      canalProximo: () =>
        ehRpc() ? this._navegarCanalDeVoz(1) : this._tecla('DISCORD_TECLA_CANAL_PROXIMO'),

      irParaAfk: () => this._irParaAfk(),
      voltarAoCanalAnterior: () => this._voltarAoCanalAnterior(),

      // Sem equivalente no RPC: seguem por atalho de teclado nos dois modos.
      atenderChamada: () => this._tecla('DISCORD_TECLA_ATENDER'),
      recusarChamada: () => this._tecla('DISCORD_TECLA_RECUSAR'),
      painelSom: () => this._tecla('DISCORD_TECLA_PAINEL_SOM'),
      servidorAnterior: () => this._tecla('DISCORD_TECLA_SERVIDOR_ANTERIOR'),
      servidorProximo: () => this._tecla('DISCORD_TECLA_SERVIDOR_PROXIMO'),
      ligacaoAtual: () => this._tecla('DISCORD_TECLA_LIGACAO_ATUAL'),
      abrirBusca: () => this._tecla('DISCORD_TECLA_BUSCA'),
      irPara: (parametros = {}) => this._irParaPorBusca(parametros.opcaoId || parametros.destino),
    };
  }
}

module.exports = new IntegracaoDiscord();
