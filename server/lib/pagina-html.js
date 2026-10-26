// Páginas HTML soltas das rotas de OAuth (Spotify e Discord): são lidas por
// uma pessoa no navegador, não pelo frontend.
//
// Tudo que entra aqui de fora PRECISA passar por escaparHtml(). Antes, o
// `?error=` do callback do Spotify ia cru para o HTML: um site qualquer aberto
// no PC navegava para http://127.0.0.1:3000/spotify/callback?error=<script>…,
// e o script rodava na origem do Deckly — de onde lia o token em
// /api/bemvindo e gravava um botão "abrir programa". Execução de código com
// um clique, sem o Spotify nem estar configurado.

function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

// `titulo` é escapado aqui; os `blocos` são HTML montado por quem chama, que
// deve escapar cada pedaço dinâmico.
function pagina(titulo, blocos) {
  const t = escaparHtml(titulo);
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t} — Deckly</title></head>
<body style="font-family:'Segoe UI',system-ui,sans-serif;background:#0f1115;color:#eef0f4;margin:0;padding:40px 24px">
<div style="max-width:560px;margin:0 auto;background:#1b1e27;border:1px solid #2a2e3a;border-radius:18px;padding:28px">
<h1 style="margin:0 0 14px;font-size:1.3rem">${t}</h1>
${blocos.join('\n')}
</div></body></html>`;
}

module.exports = { escaparHtml, pagina };
