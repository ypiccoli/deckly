// Listagem de entidades do Home Assistant para o seletor do deck.
//
// Mesmo formato { ok, opcoes: [...] } das outras listagens, então o botão do
// tipo "lista" funciona sem código específico no frontend.
//
// Serve para dois momentos: escolher a entidade ao montar um botão (na tela
// de configuração é mais fácil escolher "Luz da Sala" do que lembrar
// "light.sala") e para um seletor no próprio deck.

const express = require('express');
const homeassistant = require('../integrations/homeassistant');
const { exigirToken } = require('../lib/auth');

module.exports = function criarRotaHomeAssistant() {
  const router = express.Router();

  router.get('/entidades', exigirToken, async (req, res) => {
    try {
      const opcoes = await homeassistant.listarEntidadesAcionaveis();
      res.json({ ok: true, opcoes });
    } catch (erro) {
      res.status(500).json({ ok: false, erro: erro.message });
    }
  });

  return router;
};
