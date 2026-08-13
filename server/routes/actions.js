// Dispatcher genérico: POST /action/:id
//
// Recebe o id de um botão definido em config/pages.config.js, encontra a
// integração e a ação correspondentes e as executa. Os parâmetros do corpo
// da requisição (ex.: valor do slider de volume) são mesclados por cima dos
// parâmetros estáticos definidos no config.

const express = require('express');
const { encontrarBotao } = require('../config-loader');

module.exports = function criarRotaAcoes(integracoes) {
  const router = express.Router();

  router.post('/:id', async (req, res) => {
    const botao = encontrarBotao(req.params.id);
    if (!botao) {
      res.status(404).json({ ok: false, erro: `Botão "${req.params.id}" não encontrado na configuração.` });
      return;
    }

    const integracao = integracoes[botao.integracao];
    if (!integracao) {
      res.status(500).json({ ok: false, erro: `Integração "${botao.integracao}" não existe.` });
      return;
    }

    const acao = integracao.acoes[botao.acao];
    if (!acao) {
      res.status(500).json({ ok: false, erro: `Ação "${botao.acao}" não existe na integração "${botao.integracao}".` });
      return;
    }

    const parametros = { ...(botao.parametros || {}), ...(req.body || {}) };

    try {
      const estado = await acao(parametros);
      res.json({ ok: true, estado });
    } catch (erro) {
      console.error(`[action] Erro ao executar "${req.params.id}": ${erro.message}`);
      res.status(500).json({ ok: false, erro: erro.message });
    }
  });

  return router;
};
