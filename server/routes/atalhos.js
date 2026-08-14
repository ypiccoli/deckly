// Listagens usadas pelos botões do tipo "lista" (seletores): janelas
// abertas agora e jogos instalados na Steam. São GET porque o frontend
// busca as opções antes de mostrar o seletor — não são ações de botão,
// então não passam pelo dispatcher de /action/:id.
//
// Ambas respondem no formato { ok, opcoes: [{ id, nome, detalhe }] }, que
// é o que public/js/app.js espera para montar qualquer seletor.

const express = require('express');
const atalhos = require('../integrations/atalhos');

module.exports = function criarRotaAtalhos() {
  const router = express.Router();

  router.get('/janelas', async (req, res) => {
    try {
      const janelas = await atalhos.listarJanelas();
      res.json({
        ok: true,
        opcoes: janelas.map((j) => ({ id: j.id, nome: j.nome, detalhe: j.app })),
      });
    } catch (erro) {
      res.status(500).json({ ok: false, erro: erro.message });
    }
  });

  router.get('/jogos', async (req, res) => {
    try {
      const jogos = await atalhos.listarJogos();
      res.json({
        ok: true,
        opcoes: jogos.map((j) => ({ id: j.id, nome: j.nome })),
      });
    } catch (erro) {
      res.status(500).json({ ok: false, erro: erro.message });
    }
  });

  return router;
};
