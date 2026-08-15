// Executa o script scripts/windows-atalhos.ps1 via powershell.exe (interop
// WSL2 ou nativo) usando o utilitário compartilhado em server/lib.

const { caminhoScript, resolverCaminhoScript, executarScript } = require('../../lib/powershell-interop');

const CAMINHO_SCRIPT = caminhoScript('windows-atalhos.ps1');

class ControladorAtalhos {
  constructor({ modo }) {
    this.modo = modo;
    this.caminhoScript = resolverCaminhoScript(CAMINHO_SCRIPT, modo);
  }

  // Teclas / ações de sistema
  print() { return executarScript(this.caminhoScript, 'print'); }
  bloquear() { return executarScript(this.caminhoScript, 'bloquear'); }
  areaTrabalho() { return executarScript(this.caminhoScript, 'area_trabalho'); }
  snapEsquerda() { return executarScript(this.caminhoScript, 'snap_esquerda'); }
  snapDireita() { return executarScript(this.caminhoScript, 'snap_direita'); }
  areaTransferencia() { return executarScript(this.caminhoScript, 'clipboard'); }
  moverMonitorEsquerda() { return executarScript(this.caminhoScript, 'mover_monitor_esquerda'); }
  moverMonitorDireita() { return executarScript(this.caminhoScript, 'mover_monitor_direita'); }

  // Combo livre ("CTRL+SHIFT+M"). É o que permite acionar atalhos globais de
  // outros programas — a integração do Discord é feita inteiramente disto.
  enviarTeclas(combo) { return executarScript(this.caminhoScript, 'enviar_teclas', combo); }
  focarProcesso(nome) { return executarScript(this.caminhoScript, 'focar_processo', nome); }
  digitarTexto(texto) { return executarScript(this.caminhoScript, 'digitar_texto', texto); }

  // Abrir coisas
  abrirUrl(url, navegador) { return executarScript(this.caminhoScript, 'abrir_url', url, navegador); }
  abrirApp(caminho) { return executarScript(this.caminhoScript, 'abrir_app', caminho); }
  abrirUwp(appId) { return executarScript(this.caminhoScript, 'abrir_uwp', appId); }
  abrirJogo(appId) { return executarScript(this.caminhoScript, 'abrir_jogo', appId); }

  // Janelas e jogos (listar + agir)
  listarJanelas() { return executarScript(this.caminhoScript, 'listar_janelas'); }
  focarJanela(handle) { return executarScript(this.caminhoScript, 'focar_janela', handle); }
  listarJogos() { return executarScript(this.caminhoScript, 'listar_jogos'); }
}

module.exports = { ControladorAtalhos };
