// Rotas auxiliares do Spotify que não se encaixam no dispatcher genérico de
// ações (routes/actions.js): a autorização OAuth (fluxo "Authorization Code",
// feita uma vez pelo navegador — redireciona e recebe de volta) e a listagem
// de dispositivos ativos (GET, não uma ação disparada por um botão comum —
// o frontend busca essa lista antes de mostrar o seletor "Tocar em…").

const express = require('express');
const spotify = require('../integrations/spotify');

module.exports = function criarRotaSpotifyAuth() {
  const router = express.Router();

  router.get('/login', (req, res) => {
    if (!spotify.clientId || !spotify.clientSecret) {
      res
        .status(500)
        .send('Preencha SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no .env e reinicie o servidor antes de autorizar.');
      return;
    }
    res.redirect(spotify.obterUrlAutorizacao());
  });

  router.get('/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
      res.status(400).send(`Spotify recusou a autorização: ${error}`);
      return;
    }
    if (!code) {
      res.status(400).send('Código de autorização ausente na resposta do Spotify.');
      return;
    }

    try {
      const dados = await spotify.trocarCodigoPorToken(code);
      res.send(`
        <!doctype html>
        <html lang="pt-BR">
          <head><meta charset="UTF-8" /><title>Spotify autorizado</title></head>
          <body style="font-family: system-ui, sans-serif; background:#0f1115; color:#eef0f4; padding:40px; max-width:640px; margin:0 auto;">
            <h1>Autorizado com sucesso!</h1>
            <p>Copie o valor abaixo para <code>SPOTIFY_REFRESH_TOKEN</code> no seu <code>.env</code>, salve e reinicie o servidor:</p>
            <pre style="background:#1b1e27; padding:16px; border-radius:8px; white-space:pre-wrap; word-break:break-all;">${dados.refresh_token}</pre>
            <p>Depois disso pode fechar esta aba.</p>
          </body>
        </html>
      `);
    } catch (erro) {
      res.status(500).send(`Erro ao trocar código por token: ${erro.message}`);
    }
  });

  router.get('/dispositivos', async (req, res) => {
    try {
      const dispositivos = await spotify.listarDispositivos();
      res.json({ ok: true, dispositivos });
    } catch (erro) {
      res.status(500).json({ ok: false, erro: erro.message });
    }
  });

  return router;
};
