// Dispatcher genérico: POST /action/:id
//
// Recebe o id de um botão definido em config/pages.config.js, encontra a
// integração e a ação correspondentes e as executa. Os parâmetros do corpo
// da requisição (ex.: valor do slider de volume) são mesclados por cima dos
// parâmetros estáticos definidos no config.
//
// Um botão pode ser:
//   - simples: tem "integracao" + "acao" no próprio botão;
//   - macro:   tem "acoes", uma lista de { integracao, acao, parametros }
//              executada em sequência (ex.: abrir o jogo e o overlay juntos).

const express = require('express');
const { encontrarBotao } = require('../config-store');
const { redigir } = require('../lib/segredos');

// As ÚNICAS chaves que o cliente pode contribuir para os parâmetros de uma
// ação. É o que o deck realmente manda: o slider envia { valor } e o seletor
// de lista envia { opcaoId } (public/js/app.js).
//
// Antes daqui o corpo inteiro era mesclado por cima dos parâmetros do
// config, e isso furava uma decisão de projeto: `PUT /api/config` exige
// 127.0.0.1 justamente porque criar botão é, na prática, execução de código
// (um botão pode abrir qualquer programa). Só que não era preciso criar
// botão nenhum — bastava trocar os parâmetros de um que já existisse. Um
// POST em qualquer botão de `atalhos.abrirApp` com
// { caminho: 'powershell.exe', argumentos: '-Command …' } executava o que
// quisesse, com token e sem passar pelo exigirLocal.
//
// E cada chave só vale no tipo de botão que a manda. Aceitar `opcaoId` em
// qualquer botão deixava o tablet sobrescrever o parâmetro FIXO: um botão
// "Luz da sala" recebendo { opcaoId: 'cover.garagem' } abria o portão, e
// { opcaoId: 'all' } num "desligar" apagava a casa inteira. Só valores
// escalares passam — array ou objeto não é o que nenhum dos dois manda.
const CHAVES_DO_CLIENTE = {
  valor: { tipo: 'slider', aceita: (v) => typeof v === 'number' && Number.isFinite(v) },
  opcaoId: {
    tipo: 'lista',
    aceita: (v) =>
      (typeof v === 'string' && v.length > 0 && v.length <= 200) ||
      (typeof v === 'number' && Number.isFinite(v)),
  },
};

function parametrosDoCliente(corpo, botao) {
  const filtrados = {};
  if (!corpo || typeof corpo !== 'object') return filtrados;
  const tipoBotao = botao.tipo || 'botao';
  for (const [chave, regra] of Object.entries(CHAVES_DO_CLIENTE)) {
    if (!Object.prototype.hasOwnProperty.call(corpo, chave)) continue;
    if (regra.tipo !== tipoBotao) continue;
    if (!regra.aceita(corpo[chave])) {
      throw new Error(`Valor inválido em "${chave}".`);
    }
    filtrados[chave] = corpo[chave];
  }
  return filtrados;
}

function resolverAcao(integracoes, passo) {
  // Object.hasOwn: sem isso "toString" ou "constructor" achariam coisa no
  // protótipo em vez de dizer que não existem.
  const integracao = Object.hasOwn(integracoes, passo.integracao) ? integracoes[passo.integracao] : null;
  if (!integracao) {
    throw new Error(`Integração "${passo.integracao}" não existe.`);
  }
  const acoes = integracao.acoes;
  const acao = Object.hasOwn(acoes, passo.acao) ? acoes[passo.acao] : null;
  if (typeof acao !== 'function') {
    throw new Error(`Ação "${passo.acao}" não existe na integração "${passo.integracao}".`);
  }
  return acao;
}

module.exports = function criarRotaAcoes(integracoes) {
  const router = express.Router();

  router.post('/:id', async (req, res) => {
    const botao = encontrarBotao(req.params.id);
    if (!botao) {
      res.status(404).json({ ok: false, erro: `Botão "${req.params.id}" não encontrado na configuração.` });
      return;
    }

    // Normaliza os dois formatos (simples e macro) para uma lista de passos.
    const passos = botao.acoes || [{ integracao: botao.integracao, acao: botao.acao, parametros: botao.parametros }];

    let doCliente;
    try {
      doCliente = parametrosDoCliente(req.body, botao);
    } catch (erro) {
      res.status(400).json({ ok: false, erro: erro.message });
      return;
    }

    try {
      let estado = null;
      for (const passo of passos) {
        const acao = resolverAcao(integracoes, passo);
        // O corpo da requisição (ex.: valor do slider, escolha do seletor)
        // vale para todos os passos — na prática só macros de um passo só
        // recebem corpo, mas manter uniforme evita surpresa. Só as chaves de
        // CHAVES_DO_CLIENTE passam: o resto do que define a ação vem do
        // config, que só é gravável de 127.0.0.1.
        const parametros = { ...(passo.parametros || {}), ...doCliente };
        estado = await acao(parametros);
      }
      res.json({ ok: true, estado });
    } catch (erro) {
      // redigir: mensagem de erro de integração pode trazer credencial
      // dentro (o Discord devolve o access token junto com "Invalid access
      // token"), e daqui ela iria para o log e para a tela do tablet.
      const mensagem = redigir(erro.message);
      console.error(`[action] Erro ao executar "${req.params.id}": ${mensagem}`);
      res.status(500).json({ ok: false, erro: mensagem });
    }
  });

  return router;
};
