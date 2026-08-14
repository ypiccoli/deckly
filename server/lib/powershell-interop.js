// Utilitário compartilhado: executa um script PowerShell no Windows a
// partir do servidor Node — seja rodando dentro do WSL2 (via interop com
// powershell.exe) ou nativamente no Windows. Usado por qualquer integração
// que precise agir no sistema operacional (media, atalhos).
//
// spawn (não execFile) com stdin explicitamente ignorado: o interop
// WSL->Windows já travou aqui antes, aparentemente esperando algo em stdin
// que nunca chegava (execFile deixa stdin como pipe aberto por padrão).
// Também tem timeout manual — se travar, falha depois de alguns segundos em
// vez de derrubar quem estiver esperando (ex.: a subida do servidor).

const { spawn, execFileSync } = require('child_process');

const TIMEOUT_MS = 10000;

function detectarModo() {
  // Nome da variável ficou de quando só a integração de mídia existia — hoje
  // vale para qualquer ação de sistema via PowerShell (media, atalhos).
  const forcado = (process.env.MEDIA_BACKEND || 'auto').toLowerCase();
  if (forcado === 'wsl-windows') return 'wsl';
  if (forcado === 'windows') return 'nativo';

  if (process.platform === 'win32') return 'nativo';
  if (process.env.WSL_DISTRO_NAME) return 'wsl';
  return null;
}

function resolverCaminhoScript(caminhoWsl, modo) {
  if (modo === 'wsl') {
    const saida = execFileSync('wslpath', ['-w', caminhoWsl], { encoding: 'utf8' });
    return saida.trim();
  }
  return caminhoWsl;
}

function executarScript(caminhoScript, acao, valor, extra) {
  return new Promise((resolve, reject) => {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', caminhoScript, '-Acao', acao];
    if (valor !== undefined && valor !== null && valor !== '') {
      args.push('-Valor', String(valor));
    }
    if (extra !== undefined && extra !== null && extra !== '') {
      args.push('-Extra', String(extra));
    }

    const processo = spawn('powershell.exe', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    let finalizado = false;

    const timer = setTimeout(() => {
      if (finalizado) return;
      finalizado = true;
      processo.kill();
      reject(new Error(`Ação "${acao}" excedeu ${TIMEOUT_MS / 1000}s e foi cancelada.`));
    }, TIMEOUT_MS);

    processo.stdout.on('data', (dado) => { stdout += dado; });
    processo.stderr.on('data', (dado) => { stderr += dado; });

    processo.on('error', (erro) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timer);
      reject(new Error(`Falha ao executar ação "${acao}": ${erro.message}`));
    });

    processo.on('close', (codigo) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timer);

      if (codigo !== 0) {
        reject(new Error(`Falha ao executar ação "${acao}": ${stderr || `código de saída ${codigo}`}`));
        return;
      }
      const saida = stdout.trim();
      // Listagem vazia: o ConvertTo-Json do PowerShell não imprime nada para
      // um array sem itens, então stdout vem vazio em vez de "[]".
      if (!saida) {
        resolve([]);
        return;
      }
      try {
        const linhas = saida.split('\n');
        const ultimaLinha = linhas[linhas.length - 1];
        resolve(JSON.parse(ultimaLinha));
      } catch (erroParse) {
        reject(new Error(`Resposta inesperada do script: ${stdout}`));
      }
    });
  });
}

module.exports = { detectarModo, resolverCaminhoScript, executarScript };
