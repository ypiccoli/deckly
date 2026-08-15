// Lista de destinos do Discord para o seletor do deck.
//
// Responde no mesmo formato { ok, opcoes: [{ id, nome, detalhe, ativo }] }
// de todas as listagens (veja routes/atalhos.js) — é o que faz o botão do
// tipo "lista" funcionar sem código específico no frontend.
//
// Por que a lista vem da configuração, e não do Discord: listar servidores e
// canais de verdade exigiria um bot dentro de cada servidor (e permissão de
// administrador para colocá-lo lá, que ninguém tem nos servidores dos
// outros). O Quick Switcher resolve o mesmo problema pelo teclado, mas ele
// busca por nome — então os nomes precisam vir de algum lugar, e esse lugar
// é a aba Integrações.

const express = require('express');
const discord = require('../integrations/discord');

module.exports = function criarRotaDiscord() {
  const router = express.Router();

  router.get('/destinos', (req, res) => {
    const destinos = discord.destinos;
    res.json({
      ok: true,
      opcoes: destinos.map((nome) => ({
        id: nome,
        nome,
        detalhe: null,
        ativo: false,
      })),
    });
  });

  return router;
};
