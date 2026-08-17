// Salvar SÓ o layout: posição, tamanho, colunas e altura da linha.
//
//   PUT /api/layout
//
// Existe separada de PUT /api/config por causa da trava de acesso. Gravar o
// config inteiro exige estar no próprio PC (`exigirLocal`), porque um botão
// pode mandar abrir qualquer programa — reconfigurar o deck vale tanto quanto
// executar código na máquina. Mas arrastar botão é justamente o que se quer
// fazer NO TABLET, olhando o resultado na tela em que ele será usado.
//
// A saída não é afrouxar a trava e torcer: é uma rota que não tem como fazer
// mal. `configStore.aplicarLayout()` lê integração, ação e parâmetros do
// disco e nunca do corpo da requisição, e recusa qualquer mudança no conjunto
// de botões. O pior que esta rota permite a quem tem o token é embaralhar a
// grade — e quem tem o token já podia acionar todos os botões.

const express = require('express');
const configStore = require('../config-store');

module.exports = function criarRotaLayout(integracoes, aoAtualizarConfig) {
  const router = express.Router();

  router.put('/layout', (req, res) => {
    const { config: novoConfig, erros } = configStore.aplicarLayout(req.body?.paginas);
    if (erros.length > 0) {
      res.status(400).json({ ok: false, erros });
      return;
    }

    // Rede de segurança: mesmo o resultado sendo montado a partir do disco,
    // colunas, alturaBotao e os spans vieram de fora e têm limites (1–12,
    // 60–260, 1–6). Reusa o validador de sempre, para os limites viverem num
    // lugar só.
    const errosValidacao = configStore.validar(novoConfig, integracoes);
    if (errosValidacao.length > 0) {
      res.status(400).json({ ok: false, erros: errosValidacao });
      return;
    }

    try {
      configStore.salvar(novoConfig);
    } catch (erro) {
      console.error(`[layout] Falha ao gravar: ${erro.message}`);
      res.status(500).json({ ok: false, erros: [`Não foi possível gravar o arquivo: ${erro.message}`] });
      return;
    }

    if (aoAtualizarConfig) aoAtualizarConfig();
    res.json({ ok: true, paginas: configStore.obterPaginas() });
  });

  return router;
};
