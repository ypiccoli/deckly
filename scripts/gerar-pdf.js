// Gera docs/Guia-Stream-Deck-Web.pdf a partir de docs/guia-primeiro-acesso.html
// (npm run docs:pdf).
//
// Por que Chrome em vez de uma biblioteca de PDF: o guia é uma página HTML
// comum, e o Chrome já está instalado em qualquer máquina que rode este
// projeto. Uma dependência a mais só para desenhar um PDF não se paga —
// ainda mais uma que teria que reimplementar layout de página.
//
// Roda tanto do WSL (achando o Chrome do Windows em /mnt/c e convertendo os
// caminhos com wslpath) quanto do Windows direto.

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, 'docs', 'guia-primeiro-acesso.html');
const DESTINO = path.join(RAIZ, 'docs', 'Guia-Stream-Deck-Web.pdf');

const NO_WSL = process.platform !== 'win32' && Boolean(process.env.WSL_DISTRO_NAME);

// Candidatos em ordem de preferência. No WSL os caminhos do Windows são
// visíveis em /mnt/c, e o executável roda por interop.
function candidatos() {
  const programas = [
    'Google/Chrome/Application/chrome.exe',
    'Microsoft/Edge/Application/msedge.exe',
    'BraveSoftware/Brave-Browser/Application/brave.exe',
  ];
  const bases = NO_WSL
    ? ['/mnt/c/Program Files', '/mnt/c/Program Files (x86)']
    : ['C:\\Program Files', 'C:\\Program Files (x86)'];

  const lista = [];
  for (const base of bases) {
    for (const programa of programas) {
      lista.push(path.join(base, NO_WSL ? programa : programa.replace(/\//g, '\\')));
    }
  }
  // Fora do Windows/WSL ainda dá para usar um Chromium do próprio Linux.
  if (!NO_WSL && process.platform !== 'win32') {
    lista.push('/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser');
  }
  return lista;
}

function acharNavegador() {
  for (const caminho of candidatos()) {
    if (fs.existsSync(caminho)) return caminho;
  }
  return null;
}

// O Chrome do Windows não entende /home/... — precisa do caminho em formato
// Windows. Mesmo motivo (e mesma solução) do powershell-interop.js.
function paraONavegador(caminhoLocal) {
  if (!NO_WSL) return caminhoLocal;
  return execFileSync('wslpath', ['-w', caminhoLocal], { encoding: 'utf8' }).trim();
}

function main() {
  if (!fs.existsSync(ORIGEM)) {
    throw new Error(`Não achei ${path.relative(RAIZ, ORIGEM)}.`);
  }

  const navegador = acharNavegador();
  if (!navegador) {
    console.error('Não achei Chrome, Edge ou Brave para gerar o PDF.');
    console.error('');
    console.error('Alternativa manual: abra docs/guia-primeiro-acesso.html no navegador,');
    console.error('use Imprimir > Salvar como PDF (margens padrão, sem cabeçalho/rodapé)');
    console.error(`e salve em ${path.relative(RAIZ, DESTINO)}.`);
    process.exit(1);
  }
  console.log(`Usando ${path.basename(navegador)}`);

  // O --print-to-pdf grava no caminho passado; --no-pdf-header-footer tira a
  // data e o "file:///..." que o Chrome imprime nas bordas por padrão.
  const resultado = spawnSync(
    navegador,
    [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${paraONavegador(DESTINO)}`,
      'file:///' + paraONavegador(ORIGEM).replace(/\\/g, '/'),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000 },
  );

  if (!fs.existsSync(DESTINO)) {
    console.error('O navegador rodou mas o PDF não apareceu.');
    if (resultado.stderr) console.error(String(resultado.stderr).trim().split('\n').slice(-5).join('\n'));
    process.exit(1);
  }

  const kb = (fs.statSync(DESTINO).size / 1024).toFixed(0);
  console.log(`docs/${path.basename(DESTINO)} gerado (${kb} KB).`);
}

main();
