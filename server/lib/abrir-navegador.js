// Abre uma URL no navegador padrão do sistema.
//
// Serve para a tela de boas-vindas aparecer sozinha na primeira execução —
// é quando a pessoa precisa ver o token e o QR, e um console minimizado não
// resolve isso.

const { spawn } = require('child_process');

function abrirNoNavegador(url) {
  try {
    if (process.platform === 'win32') {
      // O "start" é interno do cmd, e o primeiro argumento entre aspas é o
      // TÍTULO da janela — daí o "" vazio antes da URL, senão o cmd trata a
      // URL como título e não abre nada.
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
      return true;
    }

    if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
      return true;
    }

    // Linux rodando dentro do WSL ainda consegue abrir o navegador do
    // Windows pelo interop; fora do WSL, xdg-open resolve.
    const comando = process.env.WSL_DISTRO_NAME ? 'explorer.exe' : 'xdg-open';
    spawn(comando, [url], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    // Não conseguir abrir o navegador não é motivo para derrubar nada: a
    // mesma informação está no console.
    return false;
  }
}

module.exports = abrirNoNavegador;
