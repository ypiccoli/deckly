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

function resolverAcao(integracoes, passo) {
  const integracao = integracoes[passo.integracao];
  if (!integracao) {
    throw new Error(`Integração "${passo.integracao}" não existe.`);
  }
  const acao = integracao.acoes[passo.acao];
  if (!acao) {
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

    try {
      let estado = null;
      for (const passo of passos) {
        const acao = resolverAcao(integracoes, passo);
        // O corpo da requisição (ex.: valor do slider, escolha do seletor)
        // vale para todos os passos — na prática só macros de um passo só
        // recebem corpo, mas manter uniforme evita surpresa.
        const parametros = { ...(passo.parametros || {}), ...(req.body || {}) };
        estado = await acao(parametros);
      }
      res.json({ ok: true, estado });
    } catch (erro) {
      console.error(`[action] Erro ao executar "${req.params.id}": ${erro.message}`);
      res.status(500).json({ ok: false, erro: erro.message });
    }
  });

  return router;
};
