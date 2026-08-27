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

// Paleta fixa do seletor de cores. O Home Assistant não tem "lista de cores"
// para oferecer, e um seletor de deck precisa de poucas opções, grandes o
// suficiente para o dedo — escolher matiz num círculo de cores é gesto de
// mouse, não de tablet apoiado na mesa.
//
// Cada opção traz o próprio `icone`: é o que faz o overlay mostrar uma
// bolinha da cor em vez de sete ícones iguais. Os brancos vão como `k<kelvin>`
// porque numa lâmpada RGB+W o branco bom sai do LED branco dedicado.
const CORES = [
  { id: '#ff2d2d', nome: 'Vermelho', icone: '🔴' },
  { id: '#ff8c1a', nome: 'Laranja', icone: '🟠' },
  { id: '#ffd21a', nome: 'Amarelo', icone: '🟡' },
  { id: '#33cc55', nome: 'Verde', icone: '🟢' },
  { id: '#2d6cff', nome: 'Azul', icone: '🔵' },
  { id: '#a64dff', nome: 'Roxo', icone: '🟣' },
  { id: 'k2700', nome: 'Branco quente', icone: '⚪' },
  { id: 'k6500', nome: 'Branco frio', icone: '⬜' },
];

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

  router.get('/cores', exigirToken, (req, res) => {
    res.json({ ok: true, opcoes: CORES });
  });

  return router;
};
