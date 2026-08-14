// Configuração das integrações pela interface (aba "Integrações").
//
//   GET  /api/integracoes    o que cada integração precisa + se já está preenchido
//   PUT  /api/integracoes    grava as credenciais no .env e reconfigura na hora
//
// Existe para tirar da frente de quem recebe o programa a etapa de abrir o
// .env no Bloco de Notas e reiniciar o servidor. Os campos não são
// hardcoded: vêm do getter `configuracao` de cada integração, mesmo padrão
// do `catalogo`. Integração nova aparece aqui sozinha.
//
// Segurança: além do token, `exigirLocal` — isto lê e grava credenciais e
// liga/desliga integrações, então vale tanto quanto reconfigurar o app.
// **Valor de segredo nunca sai daqui**: a resposta diz só se o campo está
// preenchido. Um token do Spotify vazado por uma tela de configuração seria
// um jeito bobo de perder a conta.

const express = require('express');
const { exigirLocal } = require('../lib/auth');
const envStore = require('../lib/env-store');

// Campos assim não voltam para o navegador com o valor; só com "preenchido".
const TIPOS_SECRETOS = new Set(['senha']);

module.exports = function criarRotaIntegracoes(integracoes) {
  const router = express.Router();

  function montarDescricao(nome, integracao) {
    const cfg = integracao.configuracao;
    const valores = envStore.ler();

    return {
      nome,
      rotulo: cfg.rotulo,
      resumo: cfg.resumo || null,
      aviso: cfg.aviso || null,
      naoImplementado: cfg.naoImplementado || null,
      comoObter: cfg.comoObter || [],
      // Estado ao vivo, para a tela dizer "conectado" em vez de só "salvo".
      disponivel: Boolean(integracao.catalogo && integracao.catalogo.disponivel),
      motivoIndisponivel: integracao.catalogo ? integracao.catalogo.motivoIndisponivel : null,
      autorizacao: cfg.autorizacao || null,
      campos: (cfg.campos || []).map((campo) => {
        const valor = valores[campo.env];
        const secreto = TIPOS_SECRETOS.has(campo.tipo);
        return {
          ...campo,
          secreto,
          preenchido: Boolean(valor),
          valor: secreto ? null : valor ?? null,
        };
      }),
    };
  }

  router.get('/integracoes', exigirLocal, (req, res) => {
    const lista = [];
    for (const [nome, integracao] of Object.entries(integracoes)) {
      if (!integracao.configuracao) continue;
      lista.push(montarDescricao(nome, integracao));
    }
    res.json({ ok: true, integracoes: lista, arquivo: envStore.arquivo });
  });

  router.put('/integracoes', exigirLocal, async (req, res) => {
    const { nome, valores } = req.body || {};
    const integracao = integracoes[nome];

    if (!integracao || !integracao.configuracao) {
      res.status(400).json({ ok: false, erro: `Integração "${nome}" não existe ou não é configurável.` });
      return;
    }

    // Só grava chaves que a própria integração declarou. Sem isso, um PUT
    // conseguiria escrever qualquer variável de ambiente do processo.
    const permitidas = new Set((integracao.configuracao.campos || []).map((c) => c.env));
    const paraGravar = {};
    for (const [chave, valor] of Object.entries(valores || {})) {
      if (!permitidas.has(chave)) continue;
      // Campo de senha que voltou vazio significa "não mexi nele" — o
      // navegador nunca recebeu o valor atual para poder reenviá-lo. Para
      // apagar de verdade existe o botão "limpar", que manda null.
      if (valor === undefined) continue;
      paraGravar[chave] = valor === null ? '' : String(valor).trim();
    }

    if (Object.keys(paraGravar).length === 0) {
      res.status(400).json({ ok: false, erro: 'Nenhum campo conhecido para gravar.' });
      return;
    }

    try {
      envStore.gravar(paraGravar);
    } catch (erro) {
      res.status(500).json({ ok: false, erro: `Não deu para gravar o .env: ${erro.message}` });
      return;
    }

    // Reconfigurar pode demorar (uma conexão de rede) e pode falhar — nada
    // disso invalida a gravação, que já aconteceu. Por isso o resultado vai
    // como aviso, não como erro do PUT.
    let aviso = null;
    if (integracao.reconfigurar) {
      try {
        await integracao.reconfigurar();
      } catch (erro) {
        aviso = `Salvo, mas a reconexão falhou: ${erro.message}`;
      }
    }

    res.json({ ok: true, aviso, integracao: montarDescricao(nome, integracao) });
  });

  return router;
};
