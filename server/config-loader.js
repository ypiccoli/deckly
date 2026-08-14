// Carrega e indexa a configuração de páginas/botões.
//
// Mesmo padrão do .env / .env.example: `config/pages.config.js` é o arquivo
// PESSOAL (ignorado pelo Git — tem caminhos, IPs e nomes de cena da sua
// máquina) e `config/pages.config.example.js` é a versão de exemplo, essa
// sim versionada. O pessoal tem prioridade; sem ele, o servidor sobe com o
// exemplo para que um clone novo funcione de primeira.

const fs = require('fs');
const path = require('path');

const CAMINHO_PESSOAL = path.join(__dirname, '..', 'config', 'pages.config.js');
const CAMINHO_EXEMPLO = path.join(__dirname, '..', 'config', 'pages.config.example.js');

const usandoPessoal = fs.existsSync(CAMINHO_PESSOAL);
if (!usandoPessoal) {
  console.log(
    '[config] Usando config/pages.config.example.js — copie para config/pages.config.js ' +
      'para personalizar sem versionar seus dados.',
  );
}

const config = require(usandoPessoal ? CAMINHO_PESSOAL : CAMINHO_EXEMPLO);

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
