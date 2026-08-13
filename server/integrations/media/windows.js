// Executa o script scripts/windows-media.ps1 via powershell.exe.
//
// Funciona em dois modos:
//   "wsl"    -> o servidor roda dentro do WSL2 e precisa chamar o powershell.exe
//               do Windows via interop (o caminho do script é convertido para
//               um caminho Windows com `wslpath`).
//   "nativo" -> o servidor roda direto no Windows; o caminho já é um caminho
//               Windows normal.

const { execFile, execFileSync } = require('child_process');
const path = require('path');

const CAMINHO_SCRIPT_WSL = path.join(__dirname, '..', '..', '..', 'scripts', 'windows-media.ps1');

class ControladorWindows {
  constructor({ modo }) {
    this.modo = modo;
    this.caminhoScript = this._resolverCaminhoScript();
  }

  _resolverCaminhoScript() {
    if (this.modo === 'wsl') {
      const saida = execFileSync('wslpath', ['-w', CAMINHO_SCRIPT_WSL], { encoding: 'utf8' });
      return saida.trim();
    }
    return CAMINHO_SCRIPT_WSL;
  }

  _executar(acao, valor) {
    return new Promise((resolve, reject) => {
      const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', this.caminhoScript, '-Acao', acao];
      if (valor !== undefined && valor !== null && valor !== '') {
        args.push('-Valor', String(valor));
      }
      execFile('powershell.exe', args, { windowsHide: true }, (erro, stdout, stderr) => {
        if (erro) {
          reject(new Error(`Falha ao executar ação de mídia "${acao}": ${stderr || erro.message}`));
          return;
        }
        try {
          const linhas = stdout.trim().split('\n');
          const ultimaLinha = linhas[linhas.length - 1];
          resolve(JSON.parse(ultimaLinha));
        } catch (erroParse) {
          reject(new Error(`Resposta inesperada do script de mídia: ${stdout}`));
        }
      });
    });
  }

  playPause() { return this._executar('playpause'); }
  faixaAnterior() { return this._executar('anterior'); }
  proximaFaixa() { return this._executar('proxima'); }
  alternarMudo() { return this._executar('mute'); }
  aumentarVolume() { return this._executar('volume_subir'); }
  diminuirVolume() { return this._executar('volume_descer'); }
  definirVolume(valor) { return this._executar('definir_volume', valor); }
  status() { return this._executar('status'); }
}

module.exports = { ControladorWindows };
