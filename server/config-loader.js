// Carrega e indexa a configuração de páginas/botões definida em config/pages.config.js.

const config = require('../config/pages.config');

function obterPaginas() {
  return config.paginas;
}

function encontrarBotao(id) {
  for (const pagina of config.paginas) {
    const botao = pagina.botoes.find((b) => b.id === id);
    if (botao) return botao;
  }
  return null;
}

module.exports = { obterPaginas, encontrarBotao };
