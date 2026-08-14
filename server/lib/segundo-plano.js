// Modo segundo plano: deixar o servidor rodando depois de fechar o cmd.
//
// No Windows, fechar a janela do console mata todos os processos ligados a
// ela — não dá para "soltar" um processo que já está preso ao console. A
// saída é o executável relançar a si mesmo destacado (`detached`, sem
// console) e o processo original sair. Quem fica rodando é o filho, que não
// pertence mais a janela nenhuma.
//
// Quem faz o quê:
//   - PAI (o que a pessoa clicou): confere se já não há uma instância no ar,
//     lança o filho, espera a porta responder, imprime o token/QR no console
//     e sai. É só um lançador — nunca sobe servidor.
//   - FILHO (marcado pela variável de ambiente abaixo): é o servidor de
//     verdade. Como não tem console, tudo que ele escreveria na tela vai
//     para `stream-deck.log` na pasta de dados.
//
// Só vale para o .exe. Rodando do código-fonte (`npm start`, `npm run dev`)
// o console é exatamente onde os logs devem aparecer, então nada disso liga.

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const caminhos = require('./caminhos');

// Marca que separa o pai do filho: o filho tem essa variável no ambiente, e
// é por isso que ele não fica relançando a si mesmo para sempre.
const MARCA_FILHO = 'STREAM_DECK_SEGUNDO_PLANO';

const ARQUIVO_LOG = path.join(caminhos.raiz, 'stream-deck.log');
const LIMITE_LOG_BYTES = 512 * 1024;
const ESPERA_MAXIMA_MS = 20000;
const INTERVALO_TENTATIVA_MS = 300;

function ehFilho() {
  return process.env[MARCA_FILHO] === '1';
}

// `--console` (ou `--primeiro-plano`) é a escotilha de saída para quando
// algo dá errado e a pessoa precisa ver os logs ao vivo.
function pediuConsole() {
  return process.argv.slice(1).some((a) => a === '--console' || a === '--primeiro-plano');
}

function habilitado() {
  if (!caminhos.empacotado) return false;
  if (ehFilho()) return false;
  if (pediuConsole()) return false;
  const preferencia = String(process.env.SEGUNDO_PLANO || 'true').toLowerCase();
  return !['false', 'nao', 'não', '0', 'off'].includes(preferencia);
}

function pausa(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Tenta abrir uma conexão na porta em vez de tentar escutar nela: assim dá
// para saber se já tem alguém no ar sem roubar a porta de quem está.
function portaRespondendo(porta) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: porta });
    const encerrar = (resultado) => {
      socket.destroy();
      resolve(resultado);
    };
    socket.setTimeout(1000);
    socket.on('connect', () => encerrar(true));
    socket.on('timeout', () => encerrar(false));
    socket.on('error', () => encerrar(false));
  });
}

async function esperarSubir(porta) {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  while (Date.now() < limite) {
    if (await portaRespondendo(porta)) return true;
    await pausa(INTERVALO_TENTATIVA_MS);
  }
  return false;
}

// O filho não tem console, então stdout e stderr vão para um arquivo. Ele é
// zerado quando passa do limite — é log de diagnóstico, não histórico.
function abrirLog() {
  try {
    if (fs.existsSync(ARQUIVO_LOG) && fs.statSync(ARQUIVO_LOG).size > LIMITE_LOG_BYTES) {
      fs.rmSync(ARQUIVO_LOG);
    }
  } catch {
    // Não conseguir limpar o log não é motivo para não subir.
  }
  const fd = fs.openSync(ARQUIVO_LOG, 'a');
  fs.writeSync(fd, `\n===== ${new Date().toLocaleString('pt-BR')} — iniciando em segundo plano =====\n`);
  return fd;
}

function mostrarFimDoLog(linhas = 15) {
  try {
    const conteudo = fs.readFileSync(ARQUIVO_LOG, 'utf8').trimEnd().split('\n');
    console.error('  Últimas linhas de ' + ARQUIVO_LOG + ':');
    for (const linha of conteudo.slice(-linhas)) console.error('    ' + linha);
  } catch {
    console.error('  (não consegui ler ' + ARQUIVO_LOG + ')');
  }
}

async function lancar(porta) {
  // Carregados aqui dentro para o filho não pagar por eles.
  const mostrarBoasVindas = require('./boas-vindas');
  const abrirNoNavegador = require('./abrir-navegador');
  const { ORIGEM } = require('./token');

  const urlBemVindo = `http://127.0.0.1:${porta}/bemvindo/`;

  // Clicou duas vezes no .exe? Em vez de subir uma segunda cópia (que só
  // brigaria pela porta), abre a tela da instância que já está rodando.
  if (await portaRespondendo(porta)) {
    console.log('');
    console.log(`  O Stream Deck Web já está rodando na porta ${porta}.`);
    console.log(`  Abrindo ${urlBemVindo}`);
    console.log('');
    abrirNoNavegador(urlBemVindo);
    await pausa(1500);
    process.exit(0);
  }

  const fd = abrirLog();
  // Sem argumentos: o app não recebe nenhum, e passar `process.argv[1]`
  // adiante (que no SEA é o caminho do próprio .exe) só confundiria.
  const filho = spawn(process.execPath, [], {
    detached: true,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
    env: { ...process.env, [MARCA_FILHO]: '1' },
  });
  filho.on('error', (erro) => {
    console.error('');
    console.error(`  Não consegui iniciar em segundo plano: ${erro.message}`);
    console.error('  Rode com  --console  para ver o servidor nesta janela.');
    console.error('');
    process.exit(1);
  });
  filho.unref();

  if (!(await esperarSubir(porta))) {
    console.error('');
    console.error('  O servidor não respondeu a tempo.');
    mostrarFimDoLog();
    console.error('');
    console.error('  Rode com  --console  para acompanhar a subida nesta janela.');
    console.error('');
    process.exit(1);
  }

  mostrarBoasVindas(porta);

  console.log(`  Rodando em segundo plano (PID ${filho.pid}). Pode fechar esta janela.`);
  console.log('');
  console.log(`  Para encerrar   ${urlBemVindo} > botão "Encerrar servidor"`);
  console.log('                  (ou, no cmd: taskkill /IM ' + path.basename(process.execPath) + ' /F)');
  console.log(`  Log do servidor ${ARQUIVO_LOG}`);
  console.log('');

  // Mesma regra de sempre (ABRIR_NAVEGADOR), só que decidida aqui: o filho
  // não abre nada, porque quando ele sobe o token já foi criado pelo pai e
  // ele nunca veria a condição de "primeira execução".
  const preferencia = String(process.env.ABRIR_NAVEGADOR || 'primeira').toLowerCase();
  if (preferencia === 'sempre' || (preferencia === 'primeira' && ORIGEM === 'gerado agora')) {
    abrirNoNavegador(urlBemVindo);
  }

  await pausa(500);
  process.exit(0);
}

// Chamada no topo de server/index.js. Devolve `true` quando este processo é
// só o lançador — nesse caso o index.js não deve subir servidor nenhum. O
// trabalho do lançador continua em segundo plano (o event loop segue vivo
// por causa das esperas) e termina com um process.exit().
function talvezLancarEmSegundoPlano(porta) {
  if (!habilitado()) return false;
  lancar(porta).catch((erro) => {
    console.error(`  Falha ao iniciar em segundo plano: ${erro.message}`);
    process.exit(1);
  });
  return true;
}

module.exports = {
  talvezLancarEmSegundoPlano,
  ehFilho,
  arquivoLog: ARQUIVO_LOG,
};
