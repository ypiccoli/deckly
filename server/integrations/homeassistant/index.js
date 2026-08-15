// Integração com o Home Assistant.
//
// POR QUE ESTA E NÃO UMA POR MARCA
//
// Quase todo dispositivo inteligente barato vendido no Brasil (Positivo,
// Intelbras, Multilaser, Elgin…) é Tuya por baixo, e cada marca com API
// própria significaria uma integração nova aqui. O Home Assistant já resolve
// isso: ele fala com Tuya, Hue, Sonoff, Shelly, Xiaomi, Zigbee, Z-Wave e
// centenas de outros, e expõe **uma API só** para tudo. Uma integração aqui
// cobre qualquer marca que ele suporte — inclusive as que você comprar
// depois, sem código novo. Veja docs/casa-inteligente.md.
//
// COMO SE COMUNICA
//
// Duas vias, cada uma no que faz melhor:
//   - WebSocket (/api/websocket) para o estado ao vivo. É o que faz o botão
//     de luz acender quando alguém apaga pelo interruptor da parede. Com
//     polling isso chegaria atrasado e com peso desnecessário no Pi.
//   - REST (/api/services/...) para agir. Chamada simples, sem estado.
//
// O `ws` já é dependência do projeto (o servidor usa para falar com o
// tablet), então nada novo entra por causa disto.

const EventEmitter = require('events');
const WebSocket = require('ws');

const INTERVALO_RECONEXAO_INICIAL_MS = 5000;
const INTERVALO_RECONEXAO_MAXIMO_MS = 60000;
const TEMPO_LIMITE_MS = 10000;

// Domínios que fazem sentido num botão de deck. Um sensor de temperatura não
// tem o que "acionar"; uma luz, uma tomada ou uma cena têm.
const DOMINIOS_ACIONAVEIS = new Set([
  'light',
  'switch',
  'fan',
  'scene',
  'script',
  'automation',
  'input_boolean',
  'media_player',
  'cover',
  'climate',
]);

// Chave de estado precisa ser um dot-path (ex.: homeassistant.entidades.X),
// e entity_id tem ponto no meio ("light.sala"). Trocar por underscore evita
// que o resolvedor de estado do frontend se perca no meio do caminho.
function chaveDe(entityId) {
  return entityId.replace(/\./g, '_');
}

class IntegracaoHomeAssistant extends EventEmitter {
  constructor() {
    super();
    this.nome = 'homeassistant';
    this.estado = { conectado: false, entidades: {} };

    this.ws = null;
    this._proximoId = 1;
    this._timeoutReconexao = null;
    this._atrasoReconexao = INTERVALO_RECONEXAO_INICIAL_MS;
    this._avisouFalha = false;
  }

  get url() {
    return String(process.env.HOME_ASSISTANT_URL || '').replace(/\/$/, '');
  }

  get token() {
    return process.env.HOME_ASSISTANT_TOKEN || '';
  }

  get habilitado() {
    return Boolean(this.url && this.token);
  }

  _atualizarEstado(parcial) {
    this.estado = { ...this.estado, ...parcial };
    this.emit('estado', this.estado);
  }

  _garantirConfigurado() {
    if (!this.habilitado) {
      throw new Error('Home Assistant não configurado — informe o endereço e o token na aba Integrações.');
    }
  }

  /* ---------------- REST (agir) ---------------- */

  async _chamarServico(dominio, servico, dados = {}) {
    this._garantirConfigurado();
    const resposta = await fetch(`${this.url}/api/services/${dominio}/${servico}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dados),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!resposta.ok) {
      throw new Error(
        `Home Assistant recusou ${dominio}.${servico} (${resposta.status}): ${await resposta.text()}`,
      );
    }
    return resposta.json().catch(() => ({}));
  }

  // Usado pelo botão "testar" e pela primeira carga, quando o WebSocket
  // ainda não subiu.
  async listarEstados() {
    this._garantirConfigurado();
    const resposta = await fetch(`${this.url}/api/states`, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (resposta.status === 401) {
      throw new Error('Token do Home Assistant inválido ou expirado.');
    }
    if (!resposta.ok) {
      throw new Error(`Home Assistant respondeu ${resposta.status} ao listar entidades.`);
    }
    return resposta.json();
  }

  // Alimenta o seletor de entidades do deck.
  async listarEntidadesAcionaveis() {
    const estados = await this.listarEstados();
    return estados
      .filter((e) => DOMINIOS_ACIONAVEIS.has(e.entity_id.split('.')[0]))
      .map((e) => ({
        id: e.entity_id,
        nome: e.attributes?.friendly_name || e.entity_id,
        detalhe: e.entity_id.split('.')[0],
        ativo: e.state === 'on',
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  /* ---------------- WebSocket (estado ao vivo) ---------------- */

  _registrarEntidade(entityId, estadoBruto, atributos) {
    const entidades = { ...this.estado.entidades };
    entidades[chaveDe(entityId)] = {
      id: entityId,
      // Booleano explícito: 'off' é uma string não vazia, ou seja, truthy —
      // sem isto todo botão ficaria aceso o tempo todo.
      ligado: estadoBruto === 'on',
      estado: estadoBruto,
      nome: atributos?.friendly_name || entityId,
      brilho: atributos?.brightness != null ? Math.round((atributos.brightness / 255) * 100) : null,
    };
    return entidades;
  }

  _agendarReconexao() {
    if (this._timeoutReconexao || !this.habilitado) return;
    const atraso = this._atrasoReconexao;
    this._atrasoReconexao = Math.min(atraso * 2, INTERVALO_RECONEXAO_MAXIMO_MS);
    this._timeoutReconexao = setTimeout(() => {
      this._timeoutReconexao = null;
      this._conectar().catch(() => {});
    }, atraso);
    if (this._timeoutReconexao.unref) this._timeoutReconexao.unref();
  }

  async _conectar() {
    if (!this.habilitado) return;

    const urlWs = this.url.replace(/^http/, 'ws') + '/api/websocket';
    const socket = new WebSocket(urlWs);
    this.ws = socket;

    socket.on('message', (dado) => {
      let msg;
      try {
        msg = JSON.parse(dado.toString());
      } catch {
        return;
      }

      // O HA manda auth_required, espera auth, responde auth_ok.
      if (msg.type === 'auth_required') {
        socket.send(JSON.stringify({ type: 'auth', access_token: this.token }));
        return;
      }
      if (msg.type === 'auth_invalid') {
        console.warn('[homeassistant] Token recusado. Gere outro no seu perfil do Home Assistant.');
        socket.close();
        return;
      }
      if (msg.type === 'auth_ok') {
        socket.send(
          JSON.stringify({ id: this._proximoId++, type: 'subscribe_events', event_type: 'state_changed' }),
        );
        this._cargaInicial();
        return;
      }

      if (msg.type === 'event' && msg.event?.event_type === 'state_changed') {
        const { entity_id: entityId, new_state: novo } = msg.event.data;
        if (!novo) return;
        this._atualizarEstado({
          entidades: this._registrarEntidade(entityId, novo.state, novo.attributes),
        });
      }
    });

    socket.on('open', () => {
      this._atrasoReconexao = INTERVALO_RECONEXAO_INICIAL_MS;
      this._avisouFalha = false;
    });

    socket.on('error', (erro) => {
      if (!this._avisouFalha) {
        this._avisouFalha = true;
        console.log(
          `[homeassistant] Não consegui falar com ${this.url} (${erro.message}). ` +
            'Tentando em segundo plano.',
        );
      }
    });

    socket.on('close', () => {
      if (this.ws === socket) this.ws = null;
      this._atualizarEstado({ conectado: false });
      this._agendarReconexao();
    });
  }

  // Uma leitura REST completa logo após conectar: o subscribe só traz o que
  // MUDAR daqui para frente, então sem isto os botões ficariam apagados até
  // alguém mexer em cada dispositivo.
  async _cargaInicial() {
    try {
      const estados = await this.listarEstados();
      let entidades = {};
      for (const e of estados) {
        entidades = {
          ...entidades,
          ...this._registrarEntidade(e.entity_id, e.state, e.attributes),
        };
      }
      this._atualizarEstado({ conectado: true, entidades });
      console.log(`[homeassistant] Conectado — ${estados.length} entidades.`);
    } catch (erro) {
      console.warn(`[homeassistant] Conectado, mas falhei ao ler o estado inicial: ${erro.message}`);
      this._atualizarEstado({ conectado: true });
    }
  }

  async inicializar() {
    if (!this.habilitado) {
      console.log('[homeassistant] Não configurado — informe endereço e token na aba Integrações.');
      return;
    }
    await this._conectar();
  }

  async reconfigurar() {
    clearTimeout(this._timeoutReconexao);
    this._timeoutReconexao = null;
    this._atrasoReconexao = INTERVALO_RECONEXAO_INICIAL_MS;
    this._avisouFalha = false;
    if (this.ws) {
      this.ws.removeAllListeners('close');
      this.ws.close();
      this.ws = null;
    }
    this._atualizarEstado({ conectado: false, entidades: {} });
    await this.inicializar();
  }

  /* ---------------- configuração e catálogo ---------------- */

  get configuracao() {
    return {
      rotulo: 'Home Assistant',
      resumo: 'Luzes, tomadas e cenas de qualquer marca — Positivo, Tuya, Hue e outras.',
      comoObter: [
        'No Home Assistant, clique no seu usuário (canto inferior esquerdo) e vá até o fim da página.',
        'Em "Tokens de acesso de longa duração", clique em "Criar token" e dê um nome (ex.: Deckly).',
        'Copie o token — ele só aparece uma vez — e cole abaixo.',
        'O endereço é o mesmo que você usa no navegador, ex.: http://192.168.0.50:8123',
      ],
      campos: [
        {
          env: 'HOME_ASSISTANT_URL',
          rotulo: 'Endereço do Home Assistant',
          tipo: 'texto',
          ajuda: 'Com http:// e a porta. Use o IP da rede local, não o endereço da Nabu Casa.',
        },
        {
          env: 'HOME_ASSISTANT_TOKEN',
          rotulo: 'Token de acesso de longa duração',
          tipo: 'senha',
        },
      ],
    };
  }

  get catalogo() {
    // As entidades viram chaves de estado para o editor oferecer no campo
    // "Acende quando" — assim a pessoa escolhe numa lista em vez de decorar
    // o entity_id.
    const estados = [{ chave: 'homeassistant.conectado', rotulo: 'Home Assistant conectado', tipo: 'booleano' }];
    for (const [chave, entidade] of Object.entries(this.estado.entidades)) {
      estados.push({
        chave: `homeassistant.entidades.${chave}.ligado`,
        rotulo: `${entidade.nome} está ligado`,
        tipo: 'booleano',
      });
    }

    const alvo = (rotulo, extras = []) => ({
      rotulo,
      parametros: [
        {
          nome: 'entidade',
          rotulo: 'Entidade',
          tipo: 'texto',
          obrigatorio: true,
          ajuda: 'Ex.: light.sala. Use o seletor de entidades para descobrir os nomes.',
        },
        ...extras,
      ],
    });

    return {
      rotulo: 'Home Assistant',
      disponivel: this.estado.conectado,
      motivoIndisponivel: this.estado.conectado
        ? null
        : this.habilitado
          ? 'Não consegui falar com o Home Assistant — confira o endereço e se ele está no ar.'
          : 'Falta informar o endereço e o token na aba Integrações.',
      estados,
      listas: [
        { fonte: '/homeassistant/entidades', rotulo: 'Dispositivos e cenas', acaoSugerida: 'alternar' },
      ],
      acoes: {
        alternar: alvo('Ligar / desligar (alternar)'),
        ligar: alvo('Ligar'),
        desligar: alvo('Desligar'),
        definirBrilho: alvo('Definir brilho da luz', [
          { nome: 'valor', rotulo: 'Brilho (0–100)', tipo: 'numero', obrigatorio: false },
        ]),
        ativarCena: {
          rotulo: 'Ativar cena',
          parametros: [
            { nome: 'entidade', rotulo: 'Cena', tipo: 'texto', obrigatorio: true, ajuda: 'Ex.: scene.noite' },
          ],
        },
      },
    };
  }

  get acoes() {
    // opcaoId vem do seletor genérico; `entidade` vem de um botão fixo.
    const alvoDe = (p) => {
      const entidade = p.opcaoId || p.entidade;
      if (!entidade) throw new Error('Parâmetro "entidade" é obrigatório.');
      return entidade;
    };

    return {
      alternar: async (parametros = {}) => {
        const entidade = alvoDe(parametros);
        // homeassistant.toggle funciona para luz, tomada, ventilador e afins
        // sem a gente precisar saber o domínio de cada um.
        await this._chamarServico('homeassistant', 'toggle', { entity_id: entidade });
        return this.estado;
      },
      ligar: async (parametros = {}) => {
        await this._chamarServico('homeassistant', 'turn_on', { entity_id: alvoDe(parametros) });
        return this.estado;
      },
      desligar: async (parametros = {}) => {
        await this._chamarServico('homeassistant', 'turn_off', { entity_id: alvoDe(parametros) });
        return this.estado;
      },
      definirBrilho: async (parametros = {}) => {
        const entidade = alvoDe(parametros);
        const valor = Number(parametros.valor);
        if (Number.isNaN(valor)) throw new Error('Parâmetro "valor" (0–100) é obrigatório.');
        await this._chamarServico('light', 'turn_on', {
          entity_id: entidade,
          brightness_pct: Math.max(0, Math.min(100, Math.round(valor))),
        });
        return this.estado;
      },
      ativarCena: async (parametros = {}) => {
        await this._chamarServico('scene', 'turn_on', { entity_id: alvoDe(parametros) });
        return this.estado;
      },
    };
  }
}

module.exports = new IntegracaoHomeAssistant();
