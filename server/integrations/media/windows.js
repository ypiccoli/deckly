// Executa o script scripts/windows-media.ps1 via powershell.exe (interop
// WSL2 ou nativo) usando o utilitário compartilhado em server/lib.

const { caminhoScript, resolverCaminhoScript, executarScript } = require('../../lib/powershell-interop');

const CAMINHO_SCRIPT = caminhoScript('windows-media.ps1');

class ControladorWindows {
  constructor({ modo }) {
    this.modo = modo;
    this.caminhoScript = resolverCaminhoScript(CAMINHO_SCRIPT, modo);
  }

  playPause() { return executarScript(this.caminhoScript, 'playpause'); }
  faixaAnterior() { return executarScript(this.caminhoScript, 'anterior'); }
  proximaFaixa() { return executarScript(this.caminhoScript, 'proxima'); }
  alternarMudo() { return executarScript(this.caminhoScript, 'mute'); }
  aumentarVolume() { return executarScript(this.caminhoScript, 'volume_subir'); }
  diminuirVolume() { return executarScript(this.caminhoScript, 'volume_descer'); }
  definirVolume(valor) { return executarScript(this.caminhoScript, 'definir_volume', valor); }
  status() { return executarScript(this.caminhoScript, 'status'); }

  // Saída de áudio (fone, caixa, monitor…). A listagem é a única chamada
  // deste script que devolve um array em vez do estado de volume.
  listarSaidas() { return executarScript(this.caminhoScript, 'listar_saidas'); }
  definirSaida(id) { return executarScript(this.caminhoScript, 'definir_saida', id); }
}

module.exports = { ControladorWindows };
