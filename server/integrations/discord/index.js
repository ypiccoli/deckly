// Integração com o Discord: voz, navegação entre servidores/canais e um
// seletor de destinos pelo Quick Switcher.
//
// POR QUE VIA TECLADO, E NÃO PELA API
//
// O Discord tem um canal local (RPC, por named pipe) com SET_VOICE_SETTINGS,
// que faria isso direito e ainda devolveria o estado — daria para o botão
// acender. Mas o escopo `rpc` só vale para o dono do app e até 50 testadores
// até a Discord aprovar manualmente: funcionaria para uma pessoa, não para
// quem baixa o .exe. Então: teclado.
//
// OS ATALHOS SÃO OS PADRÃO DO DISCORD
//
// Os valores abaixo são os que já vêm no Discord (Configurações > Atalhos de
// teclado). Essa lista é só de leitura — não dá para editar. Quem quiser
// outras teclas precisa criar um atalho GLOBAL em "Teclas de Atalho", que é
// uma tela diferente.
//
// A diferença entre as duas telas é o que decide o FOCO:
//
//   - Atalhos embutidos (os padrão): só valem com o Discord em foco.
//   - Teclas de Atalho (criadas por você): valem com ele em segundo plano.
//
// Como o padrão é o embutido, cada ação traz o Discord para frente antes de
// mandar a tecla (DISCORD_FOCAR_ANTES). Isso rouba o foco do que estiver
// aberto — o preço de não precisar configurar nada. Quem criar atalhos
// globais próprios pode desligar isso e nunca perder o foco.
//
// "Transmitir" (Go Live) não está aqui: o Discord não expõe isso nem por
// API nem por tecla — só pelo botão da interface.

const EventEmitter = require('events');
const atalhos = require('../atalhos');

// Atalhos que já vêm no Discord. Mudar aqui não muda no Discord — estes
// valores existem para casar com o que ele já faz.
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

class IntegracaoDiscord extends EventEmitter {
  constructor() {
    super();
    this.nome = 'discord';
    // Sem estado ao vivo: o Discord não conta se você está mudo. Os botões
    // desta integração não acendem, e isso é esperado.
    this.estado = {};
  }

  get _focarAntes() {
    return String(process.env.DISCORD_FOCAR_ANTES || 'true').toLowerCase() !== 'false';
  }

  _combo(chave) {
    return process.env[chave] || PADROES[chave];
  }

  async _focar() {
    if (!this._focarAntes) return;
    await atalhos.acoes.focarProcesso({ processo: PROCESSO });
  }

  async _tecla(chave) {
    const combo = this._combo(chave);
    if (!combo) throw new Error(`Atalho ${chave} não configurado.`);
    await this._focar();
    return atalhos.acoes.enviarTeclas({ combo });
  }

  // Lista de destinos do seletor. Vem de uma variável só, separada por
  // vírgula, para caber no formulário da aba Integrações — uma lista curta
  // de nomes não merece um arquivo próprio.
  get destinos() {
    return String(process.env.DISCORD_DESTINOS || '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
  }

  // Vai para um canal/servidor pelo Quick Switcher (o CTRL+K do Discord):
  // abre a busca, digita o nome e confirma. É o único caminho sem API —
  // listar os canais de verdade exigiria um bot dentro de cada servidor.
  async irPara(nome) {
    if (!nome) throw new Error('Nenhum destino informado.');
    await atalhos.acoes.focarProcesso({ processo: PROCESSO });
    await atalhos.acoes.enviarTeclas({ combo: this._combo('DISCORD_TECLA_BUSCA') });
    await atalhos.acoes.digitarTexto({ texto: nome });
    // O Quick Switcher busca enquanto você digita; sem esta pausa o ENTER
    // chega antes de a lista ter o resultado e não seleciona nada.
    await new Promise((r) => setTimeout(r, 450));
    await atalhos.acoes.enviarTeclas({ combo: 'ENTER' });
    return { ok: true, destino: nome };
  }

  get configuracao() {
    return {
      rotulo: 'Discord',
      resumo: 'Mudo, surdo, navegação entre servidores e canais.',
      aviso:
        'Usa os atalhos de teclado que já vêm no Discord. Eles só funcionam com o ' +
        'Discord em foco, então cada botão traz o Discord para frente antes — isso ' +
        'tira o foco do que estiver aberto. Se você criar atalhos globais próprios em ' +
        'Configurações > Teclas de Atalho, informe-os abaixo e desligue "Trazer o ' +
        'Discord para frente". Os botões não acendem: o Discord não informa se você ' +
        'está mudo.',
      comoObter: [
        'Os valores abaixo já são os padrão do Discord — normalmente não é preciso mexer.',
        'Para conferir: Discord > Configurações do Usuário > Atalhos de teclado (lista só de leitura).',
        'Para atalhos que funcionem sem o Discord em foco: Configurações do Usuário > Teclas de Atalho, crie os seus e informe-os aqui.',
        'Em "Ir para (canais e servidores)", liste os nomes separados por vírgula — eles viram as opções do seletor no deck.',
      ],
      campos: [
        {
          env: 'DISCORD_FOCAR_ANTES',
          rotulo: 'Trazer o Discord para frente antes',
          tipo: 'booleano',
          padrao: 'true',
          ajuda: 'Necessário para os atalhos padrão. Desligue só se você criou atalhos globais próprios.',
        },
        {
          env: 'DISCORD_DESTINOS',
          rotulo: 'Ir para (canais e servidores)',
          tipo: 'texto',
          ajuda: 'Separados por vírgula, como aparecem no Discord. Ex.: Geral, Bate-papo, Estudos',
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
      ],
    };
  }

  async reconfigurar() {
    // As teclas são lidas do .env a cada uso; não há conexão a refazer.
  }

  get catalogo() {
    const disponivel = Boolean(atalhos.catalogo.disponivel);
    const acao = (rotulo) => ({ rotulo, parametros: [] });
    return {
      rotulo: 'Discord',
      disponivel,
      motivoIndisponivel: disponivel
        ? null
        : 'Depende dos atalhos do Windows, que só funcionam no Windows ou no WSL2.',
      estados: [],
      listas: [{ fonte: '/discord/destinos', rotulo: 'Canais e servidores', acaoSugerida: 'irPara' }],
      acoes: {
        alternarMudo: acao('Ativar/desativar microfone'),
        alternarSurdo: acao('Ativar/desativar áudio (surdo)'),
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
            {
              nome: 'destino',
              rotulo: 'Nome do canal ou servidor',
              tipo: 'texto',
              obrigatorio: false,
              ajuda: 'Em branco num botão do tipo Seletor: as opções vêm da lista configurada na aba Integrações.',
            },
          ],
          aceitaLista: true,
        },
      },
    };
  }

  get acoes() {
    return {
      alternarMudo: () => this._tecla('DISCORD_TECLA_MUDO'),
      alternarSurdo: () => this._tecla('DISCORD_TECLA_SURDO'),
      atenderChamada: () => this._tecla('DISCORD_TECLA_ATENDER'),
      recusarChamada: () => this._tecla('DISCORD_TECLA_RECUSAR'),
      painelSom: () => this._tecla('DISCORD_TECLA_PAINEL_SOM'),
      canalAnterior: () => this._tecla('DISCORD_TECLA_CANAL_ANTERIOR'),
      canalProximo: () => this._tecla('DISCORD_TECLA_CANAL_PROXIMO'),
      servidorAnterior: () => this._tecla('DISCORD_TECLA_SERVIDOR_ANTERIOR'),
      servidorProximo: () => this._tecla('DISCORD_TECLA_SERVIDOR_PROXIMO'),
      ligacaoAtual: () => this._tecla('DISCORD_TECLA_LIGACAO_ATUAL'),
      abrirBusca: () => this._tecla('DISCORD_TECLA_BUSCA'),
      // opcaoId é o que o seletor genérico do frontend devolve; `destino`
      // atende o caso de um botão comum com o nome fixo.
      irPara: (parametros = {}) => this.irPara(parametros.opcaoId || parametros.destino),
    };
  }
}

module.exports = new IntegracaoDiscord();
