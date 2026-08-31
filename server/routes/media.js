// Listagem usada pelo botão do tipo "lista" que troca a saída de áudio do
// Windows (fone, caixa, monitor…). É GET porque o frontend busca as opções
// antes de mostrar o seletor — não é ação de botão, então não passa pelo
// dispatcher de /action/:id.
//
// Responde no formato { ok, opcoes: [{ id, nome, detalhe, ativo }] }, o
// mesmo de /atalhos/janelas e /discord/canais.

const express = require('express');
const media = require('../integrations/media');
const { redigir } = require('../lib/segredos');

module.exports = function criarRotaMedia() {
  const router = express.Router();

  router.get('/saidas', async (req, res) => {
    try {
      res.json({ ok: true, opcoes: await media.listarSaidas() });
    } catch (erro) {
      res.status(500).json({ ok: false, erro: redigir(erro.message) });
    }
  });

  return router;
};
