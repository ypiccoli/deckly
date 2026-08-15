// Rotas auxiliares do Discord.
//
//   GET /discord/destinos   nomes configurados (modo teclado)
//   GET /discord/canais     canais de voz de verdade (modo RPC)
//   GET /discord/autorizar  aprova o app no Discord e grava o token
//
// As duas primeiras respondem no formato { ok, opcoes: [...] } de todas as
// listagens (veja routes/atalhos.js), que é o que faz um botão do tipo
// "lista" funcionar sem código específico no frontend.

const express = require('express');
const discord = require('../integrations/discord');
const envStore = require('../lib/env-store');
const { exigirLocal, exigirToken } = require('../lib/auth');

function pagina(titulo, blocos) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titulo} — Deckly</title></head>
<body style="font-family:'Segoe UI',system-ui,sans-serif;background:#0f1115;color:#eef0f4;margin:0;padding:40px 24px">
<div style="max-width:560px;margin:0 auto;background:#1b1e27;border:1px solid #2a2e3a;border-radius:18px;padding:28px">
<h1 style="margin:0 0 14px;font-size:1.3rem">${titulo}</h1>
${blocos.join('\n')}
</div></body></html>`;
}

module.exports = function criarRotaDiscord() {
  const router = express.Router();

  // Modo teclado: nomes digitados pela pessoa, usados no Quick Switcher.
  router.get('/destinos', exigirToken, (req, res) => {
    res.json({
      ok: true,
      opcoes: discord.destinos.map((nome) => ({ id: nome, nome, detalhe: null, ativo: false })),
    });
  });

  // Modo RPC: os canais de voz de verdade, por servidor.
  router.get('/canais', exigirToken, async (req, res) => {
    try {
      const opcoes = await discord.listarCanaisDeVoz();
      res.json({ ok: true, opcoes });
    } catch (erro) {
      res.status(500).json({ ok: false, erro: erro.message });
    }
  });

  // Autorização do modo RPC. Como o Spotify, é um passo de navegador: abre,
  // a pessoa aprova numa janela do próprio Discord, e o token é gravado e
  // aplicado na hora — sem copiar e colar nada.
  router.get('/autorizar', exigirLocal, async (req, res) => {
    try {
      const token = await discord.autorizarRpc();
      envStore.gravar({ DISCORD_ACCESS_TOKEN: token });
      await discord.reconfigurar();

      res.send(pagina('Discord conectado!', [
        '<p>Autorizado e ativo — os botões de Discord agora acendem conforme o seu ' +
          'estado real de mudo e surdo.</p>',
        '<p>Pode fechar esta aba.</p>',
      ]));
    } catch (erro) {
      res.status(500).send(pagina('Não deu para conectar', [
        `<p>${erro.message}</p>`,
        '<p>Confira se o Discord está aberto neste PC (o app, não a versão web) e se o ' +
          'Client ID e o Client Secret estão certos.</p>',
      ]));
    }
  });

  return router;
};
