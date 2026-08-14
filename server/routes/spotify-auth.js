// Rotas auxiliares do Spotify que não se encaixam no dispatcher genérico de
// ações (routes/actions.js): a autorização OAuth (fluxo "Authorization Code",
// feita uma vez pelo navegador — redireciona e recebe de volta) e a listagem
// de dispositivos ativos (GET, não uma ação disparada por um botão comum —
// o frontend busca essa lista antes de mostrar o seletor "Tocar em…").

const express = require('express');
const spotify = require('../integrations/spotify');
const { exigirToken, exigirLocal } = require('../lib/auth');
const envStore = require('../lib/env-store');

// Estas rotas são as únicas do app que respondem HTML solto: o Spotify
// devolve o navegador para cá, então a resposta é lida por uma pessoa, não
// pelo frontend. Um casco mínimo no visual do resto do app.
function pagina(titulo, blocos) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titulo} — Stream Deck Web</title></head>
<body style="font-family:'Segoe UI',system-ui,sans-serif;background:#0f1115;color:#eef0f4;margin:0;padding:40px 24px">
<div style="max-width:560px;margin:0 auto;background:#1b1e27;border:1px solid #2a2e3a;border-radius:18px;padding:28px">
<h1 style="margin:0 0 14px;font-size:1.3rem">${titulo}</h1>
${blocos.join('\n')}
</div></body></html>`;
}

module.exports = function criarRotaSpotifyAuth() {
  const router = express.Router();

  // /login e /callback NÃO podem exigir token: o Spotify redireciona o
  // navegador de volta para /callback sem ele. São protegidas por serem
  // acessíveis só do próprio PC — o que casa com o fluxo, que é feito uma
  // vez na máquina onde o servidor roda.
  router.get('/login', exigirLocal, (req, res) => {
    if (!spotify.clientId || !spotify.clientSecret) {
      res
        .status(400)
        .send(pagina('Faltam as credenciais', [
          '<p>Preencha o Client ID e o Client Secret na tela de configuração ' +
            '(aba <strong>Integrações</strong>) e salve antes de conectar.</p>',
        ]));
      return;
    }
    res.redirect(spotify.obterUrlAutorizacao());
  });

  router.get('/callback', exigirLocal, async (req, res) => {
    const { code, error } = req.query;

    if (error) {
      res.status(400).send(pagina('Autorização recusada', [
        `<p>O Spotify respondeu: <code>${error}</code></p>`,
        '<p>Volte à tela de configuração e tente de novo.</p>',
      ]));
      return;
    }
    if (!code) {
      res.status(400).send(pagina('Resposta incompleta', [
        '<p>O Spotify não mandou o código de autorização. Tente conectar de novo.</p>',
      ]));
      return;
    }

    try {
      const dados = await spotify.trocarCodigoPorToken(code);
      if (!dados.refresh_token) {
        throw new Error('o Spotify não devolveu um refresh token');
      }

      // Grava sozinho e reconfigura na hora. Antes, esta página mostrava o
      // refresh token para a pessoa copiar no .env e reiniciar o servidor —
      // dois passos manuais que não precisavam existir.
      envStore.gravar({ SPOTIFY_REFRESH_TOKEN: dados.refresh_token });
      await spotify.reconfigurar();

      res.send(pagina('Spotify conectado!', [
        '<p>Pronto: as credenciais foram salvas e a integração já está ativa — ' +
          'não precisa reiniciar nada.</p>',
        '<p>Pode fechar esta aba e voltar para a tela de configuração.</p>',
      ]));
    } catch (erro) {
      res.status(500).send(pagina('Falhou ao conectar', [
        `<p>${erro.message}</p>`,
        '<p>Confira se o Client ID e o Client Secret estão certos, e se o ' +
          'Redirect URI cadastrado no painel do Spotify é exatamente ' +
          `<code>${spotify.redirectUri}</code>.</p>`,
      ]));
    }
  });

  // Responde no mesmo formato { ok, opcoes: [{ id, nome, detalhe, ativo }] }
  // usado por todas as listagens de seletor (veja server/routes/atalhos.js),
  // para o frontend montar qualquer seletor com o mesmo código.
  // Usada pelo deck (seletor "Tocar em…"), então exige token como as demais.
  router.get('/dispositivos', exigirToken, async (req, res) => {
    try {
      const dispositivos = await spotify.listarDispositivos();
      res.json({
        ok: true,
        opcoes: dispositivos.map((d) => ({
          id: d.id,
          nome: d.name,
          detalhe: d.type,
          ativo: Boolean(d.is_active),
        })),
      });
    } catch (erro) {
      res.status(500).json({ ok: false, erro: erro.message });
    }
  });

  return router;
};
