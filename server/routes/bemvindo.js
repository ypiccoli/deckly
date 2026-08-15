// Dados da tela de boas-vindas: status, token, endereços e o QR de
// pareamento.
//
// Esta é a ÚNICA rota que não exige token — e não poderia exigir: é
// justamente onde a pessoa descobre qual é o token. A proteção aqui é
// outra: só responde no próprio PC (`exigirLocal`), ou seja, quem já está
// na máquina onde o servidor roda. Quem está na rede não consegue
// descobrir o token por aqui.

const express = require('express');
const { exigirLocal, exigirToken } = require('../lib/auth');
const { TOKEN, ORIGEM } = require('../lib/token');
const { gerarSvg } = require('../lib/qr');
const { descobrirIpLan } = require('../lib/rede');
const segundoPlano = require('../lib/segundo-plano');

module.exports = function criarRotaBemVindo(porta) {
  const router = express.Router();

  router.get('/bemvindo', exigirLocal, (req, res) => {
    const ip = descobrirIpLan();
    const urlLan = ip ? `http://${ip}:${porta}` : null;
    const urlPareamento = urlLan ? `${urlLan}/?token=${encodeURIComponent(TOKEN)}` : null;

    res.json({
      ok: true,
      token: TOKEN,
      origemToken: ORIGEM,
      porta,
      urlLocal: `http://127.0.0.1:${porta}`,
      urlLan,
      urlPareamento,
      qr: urlPareamento ? gerarSvg(urlPareamento) : null,
      // Rodando destacado do console, esta tela vira o único jeito prático de
      // desligar o servidor — e o log some de vista, então dizemos onde está.
      segundoPlano: segundoPlano.ehFilho(),
      arquivoLog: segundoPlano.ehFilho() ? segundoPlano.arquivoLog : null,
    });
  });

  // Desligar o servidor sem depender do Gerenciador de Tarefas. Pede token
  // além de ser local: um POST de formulário vindo de outro site abriria a
  // porta para derrubarem o servidor de fora, e o token corta isso.
  router.post('/bemvindo/encerrar', exigirLocal, exigirToken, (req, res) => {
    res.json({ ok: true, mensagem: 'Encerrando o Deckly…' });
    // Um respiro para a resposta chegar antes do processo morrer.
    setTimeout(() => process.exit(0), 250);
  });

  return router;
};
