// Favoritos dos seletores. Montada sob /api, então já herda exigirToken.
//
//   GET  /api/favoritos?fonte=/discord/canais   ids favoritados dessa lista
//   POST /api/favoritos                         alterna (ou define) um id
//
// Não exige exigirLocal: favoritar é uso normal do deck, feito do tablet —
// diferente de PUT /api/config, que reconfigura o app.

const express = require('express');
const favoritos = require('../lib/favoritos-store');

module.exports = function criarRotaFavoritos() {
  const router = express.Router();

  router.get('/favoritos', (req, res) => {
    const fonte = req.query.fonte;
    if (!fonte) return res.status(400).json({ ok: false, erro: 'Informe a fonte da lista.' });
    res.json({ ok: true, fonte, ids: favoritos.listar(String(fonte)) });
  });

  router.post('/favoritos', (req, res) => {
    try {
      const { fonte, id, favorito } = req.body || {};
      const novo = favoritos.definir(String(fonte || ''), id, favorito);
      res.json({ ok: true, fonte, id, favorito: novo });
    } catch (erro) {
      res.status(400).json({ ok: false, erro: erro.message });
    }
  });

  return router;
};
