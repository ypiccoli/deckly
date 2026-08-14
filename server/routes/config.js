// Rotas da configuração de páginas/botões.
//
//   GET  /api/config    layout atual (o deck busca isso no boot)
//   PUT  /api/config    grava um layout novo (usado pela tela de configuração)
//   GET  /api/catalogo  o que cada integração oferece — rótulos, ações,
//                       parâmetros e chaves de estado — para a tela de
//                       configuração montar os formulários sozinha
//
// Depois de gravar, avisa todo mundo por WebSocket (`config_atualizado`) e o
// deck se re-renderiza sozinho: mudar layout não exige mais reiniciar o
// servidor.

const express = require('express');
const configStore = require('../config-store');

module.exports = function criarRotaConfig(integracoes, aoAtualizarConfig) {
  const router = express.Router();

  router.get('/config', (req, res) => {
    res.json({ paginas: configStore.obterPaginas() });
  });

  router.put('/config', (req, res) => {
    const novoConfig = req.body;

    const erros = configStore.validar(novoConfig, integracoes);
    if (erros.length > 0) {
      // 400 e nada gravado — o arquivo em disco continua intacto.
      res.status(400).json({ ok: false, erros });
      return;
    }

    try {
      configStore.salvar(novoConfig);
    } catch (erro) {
      console.error(`[config] Falha ao gravar: ${erro.message}`);
      res.status(500).json({ ok: false, erros: [`Não foi possível gravar o arquivo: ${erro.message}`] });
      return;
    }

    if (aoAtualizarConfig) aoAtualizarConfig();
    res.json({ ok: true, paginas: configStore.obterPaginas() });
  });

  router.get('/catalogo', (req, res) => {
    const catalogo = {};
    for (const [nome, integracao] of Object.entries(integracoes)) {
      if (!integracao.catalogo) continue;
      catalogo[nome] = integracao.catalogo;
    }
    res.json({
      integracoes: catalogo,
      tipos: [
        { id: 'botao', rotulo: 'Botão', descricao: 'Toca e dispara uma ação.' },
        { id: 'slider', rotulo: 'Slider', descricao: 'Controle deslizante, para volume e afins.' },
        { id: 'info', rotulo: 'Mostrador', descricao: 'Só exibe informação ao vivo, não dispara nada.' },
        { id: 'lista', rotulo: 'Seletor', descricao: 'Abre uma lista de opções para escolher.' },
      ],
      estilosEstado: [
        { id: 'destaque', rotulo: 'Destaque (verde)' },
        { id: 'perigo', rotulo: 'Alerta (vermelho)' },
        { id: 'gravando', rotulo: 'Gravando (vermelho pulsante)' },
      ],
    });
  });

  return router;
};
