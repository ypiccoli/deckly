// Gera o executável do Windows (npm run build).
//
// Por que cada etapa existe:
//   1. esbuild junta todo o server/ num arquivo só — o empacotador do Node
//      (SEA) embute UM script, não uma árvore de módulos.
//   2. public/, scripts/*.ps1 e o modelo de config viram "assets" embutidos.
//      Os .ps1 precisam existir em disco na hora de rodar (o PowerShell
//      recebe um caminho), então o app os grava na pasta de dados ao subir —
//      veja server/lib/caminhos.js.
//   3. O blob do SEA é injetado dentro de uma cópia do node.exe do Windows.
//
// Dá para rodar isto do WSL: o node.exe do Windows é baixado e usado via
// interop, então não é preciso um Windows separado para construir.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const RAIZ = path.join(__dirname, '..');
const BUILD = path.join(RAIZ, 'build');
const VERSAO_NODE = `v${process.versions.node}`;
const NOME_EXE = 'deckly.exe';

// Marca que o postject procura dentro do binário para saber onde injetar.
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function log(etapa, msg) {
  console.log(`[${etapa}] ${msg}`);
}

function listarArquivos(pastaBase, pastaAtual = pastaBase) {
  const encontrados = [];
  for (const entrada of fs.readdirSync(pastaAtual, { withFileTypes: true })) {
    const completo = path.join(pastaAtual, entrada.name);
    if (entrada.isDirectory()) {
      encontrados.push(...listarArquivos(pastaBase, completo));
    } else {
      encontrados.push(path.relative(RAIZ, completo).split(path.sep).join('/'));
    }
  }
  return encontrados;
}

async function main() {
  fs.rmSync(BUILD, { recursive: true, force: true });
  fs.mkdirSync(BUILD, { recursive: true });

  // ---- 1. bundle -----------------------------------------------------
  log('1/5', 'juntando o servidor num arquivo só (esbuild)…');
  await esbuild.build({
    entryPoints: [path.join(RAIZ, 'server', 'index.js')],
    outfile: path.join(BUILD, 'bundle.js'),
    bundle: true,
    platform: 'node',
    target: `node${process.versions.node.split('.')[0]}`,
    format: 'cjs',
    // node:sea é embutido no runtime; deixar o esbuild tentar resolvê-lo
    // quebraria o build.
    external: ['node:sea'],
    logLevel: 'warning',
  });
  const tamanhoBundle = (fs.statSync(path.join(BUILD, 'bundle.js')).size / 1024).toFixed(0);
  log('1/5', `bundle.js gerado (${tamanhoBundle} KB)`);

  // ---- 2. assets -----------------------------------------------------
  log('2/5', 'reunindo os arquivos que vão embutidos…');
  const arquivosCodigo = [
    ...listarArquivos(path.join(RAIZ, 'public')),
    ...listarArquivos(path.join(RAIZ, 'scripts')).filter((f) => f.endsWith('.ps1')),
    // A GPLv3 (seção 4) exige que uma cópia da licença acompanhe o programa.
    // Quem baixa só o .exe nunca vê o repositório, então ela vai embutida e é
    // gravada em dados/LICENSE junto com o resto do código.
    'LICENSE',
  ];
  const modelos = {
    'config/pages.config.example.json': 'config/pages.config.example.json',
    '.env.example': '.env',
  };

  const assets = {};
  for (const relativo of arquivosCodigo) assets[relativo] = relativo;
  for (const origem of Object.keys(modelos)) assets[origem] = origem;

  const manifesto = { codigo: arquivosCodigo, modelos };
  fs.writeFileSync(path.join(BUILD, 'manifesto.json'), JSON.stringify(manifesto, null, 2));
  assets['manifesto.json'] = path.relative(RAIZ, path.join(BUILD, 'manifesto.json'))
    .split(path.sep)
    .join('/');
  log('2/5', `${arquivosCodigo.length} arquivos de código + ${Object.keys(modelos).length} modelos`);

  // ---- 3. node.exe do Windows ----------------------------------------
  const nodeExe = path.join(BUILD, 'node-windows.exe');
  log('3/5', `baixando node.exe ${VERSAO_NODE} para Windows…`);
  const url = `https://nodejs.org/dist/${VERSAO_NODE}/win-x64/node.exe`;
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Falha ao baixar ${url}: HTTP ${resposta.status}`);
  fs.writeFileSync(nodeExe, Buffer.from(await resposta.arrayBuffer()));
  fs.chmodSync(nodeExe, 0o755);
  log('3/5', `node.exe baixado (${(fs.statSync(nodeExe).size / 1024 / 1024).toFixed(0)} MB)`);

  // ---- 4. blob do SEA -------------------------------------------------
  log('4/5', 'gerando o blob do executável…');
  const configSea = path.join(BUILD, 'sea-config.json');
  fs.writeFileSync(
    configSea,
    JSON.stringify(
      {
        main: 'build/bundle.js',
        output: 'build/sea.blob',
        disableExperimentalSEAWarning: true,
        assets,
      },
      null,
      2,
    ),
  );
  // Usa o próprio node.exe do Windows para gerar o blob, garantindo que ele
  // case com o binário em que será injetado.
  execFileSync(nodeExe, ['--experimental-sea-config', configSea], { cwd: RAIZ, stdio: 'inherit' });

  // ---- 5. injeção ------------------------------------------------------
  log('5/5', 'injetando o blob no executável…');
  const exeFinal = path.join(BUILD, NOME_EXE);
  fs.copyFileSync(nodeExe, exeFinal);
  execFileSync(
    process.execPath,
    [
      path.join(RAIZ, 'node_modules', 'postject', 'dist', 'cli.js'),
      exeFinal,
      'NODE_SEA_BLOB',
      path.join(BUILD, 'sea.blob'),
      '--sentinel-fuse',
      FUSE,
    ],
    { stdio: 'inherit' },
  );
  fs.chmodSync(exeFinal, 0o755);

  // Limpa o que era só intermediário.
  for (const lixo of ['node-windows.exe', 'sea.blob', 'sea-config.json', 'manifesto.json', 'bundle.js']) {
    fs.rmSync(path.join(BUILD, lixo), { force: true });
  }

  const mb = (fs.statSync(exeFinal).size / 1024 / 1024).toFixed(0);
  console.log('');
  console.log(`  Pronto: build/${NOME_EXE} (${mb} MB)`);
  console.log('');
  console.log('  Para distribuir, basta esse arquivo. Na primeira execução ele cria');
  console.log('  uma pasta "dados" ao lado, com a configuração e o token.');
  console.log('');
}

main().catch((erro) => {
  console.error('');
  console.error('Falha no build:', erro.message);
  process.exit(1);
});
