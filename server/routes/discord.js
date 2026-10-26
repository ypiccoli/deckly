// Rotas auxiliares do Discord.
//
//   GET /discord/destinos   nomes configurados (modo teclado)
//   GET /discord/canais     canais de voz de verdade (modo RPC)
//   GET /discord/autorizar  aprova o app no Discord e grava os tokens
//
// As duas primeiras respondem no formato { ok, opcoes: [...] } de todas as
// listagens (veja routes/atalhos.js), que é o que faz um botão do tipo
// "lista" funcionar sem código específico no frontend.

const express = require('express');
const discord = require('../integrations/discord');
const favoritos = require('../lib/favoritos-store');
const { redigir } = require('../lib/segredos');
const { exigirSoLocal, exigirToken } = require('../lib/auth');
const { pagina, escaparHtml } = require('../lib/pagina-html');

module.exports = function criarRotaDiscord() {
  const router = express.Router();

  // Modo teclado: nomes digitados pela pessoa, usados no Quick Switcher.
  router.get('/destinos', exigirToken, (req, res) => {
    res.json({
      ok: true,
      opcoes: discord.destinos.map((nome) => ({ id: nome, nome, detalhe: null, ativo: false })),
    });
  });

  // Modo RPC: os canais de voz de verdade, por servidor. Com dezenas de
  // servidores a lista fica longa, então os favoritos sobem para o topo —
  // veja lib/favoritos-store.js.
  router.get('/canais', exigirToken, async (req, res) => {
    try {
      const opcoes = await discord.listarCanaisDeVoz();
      res.json({ ok: true, opcoes: favoritos.aplicar('/discord/canais', opcoes) });
    } catch (erro) {
      res.status(500).json({ ok: false, erro: redigir(erro.message) });
    }
  });

  // Autorização do modo RPC. Como o Spotify, é um passo de navegador: abre,
  // a pessoa aprova numa janela do próprio Discord, e os tokens são gravados
  // e aplicados na hora — sem copiar e colar nada. Quem grava é a própria
  // integração: a renovação automática grava pelo mesmo caminho.
  router.get('/autorizar', exigirSoLocal, async (req, res) => {
    try {
      await discord.autorizarRpc();
      await discord.reconfigurar();

      res.send(pagina('Discord conectado!', [
        '<p>Autorizado e ativo — os botões de Discord agora acendem conforme o seu ' +
          'estado real de mudo e surdo.</p>',
        '<p>Pode fechar esta aba.</p>',
      ]));
    } catch (erro) {
      res.status(500).send(pagina('Não deu para conectar', [
        `<p>${escaparHtml(redigir(erro.message))}</p>`,
        '<p>Confira se o Discord está aberto neste PC (o app, não a versão web) e se o ' +
          'Client ID e o Client Secret estão certos.</p>',
      ]));
    }
  });

  return router;
};
