// Mensagem de subida no console: endereços, token e um QR para parear o
// tablet sem precisar digitar nada.
//
// O console não é o canal principal — quando o programa sobe junto com o
// Windows, a janela fica minimizada e ninguém lê. Por isso a mesma
// informação vive também na tela de boas-vindas (`/bemvindo/`), que abre
// sozinha na primeira execução. Aqui fica a versão para quem está de olho
// no terminal.

const qrcode = require('qrcode-terminal');
const { TOKEN, ORIGEM } = require('./token');
const { descobrirIpLan } = require('./rede');

module.exports = function mostrarBoasVindas(porta) {
  const ip = descobrirIpLan();
  const urlLocal = `http://127.0.0.1:${porta}`;
  const urlLan = ip ? `http://${ip}:${porta}` : null;
  const urlPareamento = urlLan ? `${urlLan}/?token=${encodeURIComponent(TOKEN)}` : null;

  console.log('');
  console.log(`Stream Deck Web rodando na porta ${porta}`);
  console.log('');
  console.log(`  Esta tela, no navegador   ${urlLocal}/bemvindo/`);
  console.log(`  Abrir o deck              ${urlLocal}`);
  console.log(`  Configurar botões         ${urlLocal}/config/`);
  if (urlLan) console.log(`  No tablet (rede local)    ${urlLan}`);
  console.log('');
  console.log(`  Token de acesso           ${TOKEN}   (${ORIGEM})`);
  console.log('');

  if (urlPareamento) {
    console.log('  Para parear o tablet, escaneie o QR abaixo ou abra o link:');
    console.log(`  ${urlPareamento}`);
    console.log('');
    qrcode.generate(urlPareamento, { small: true }, (qr) => {
      console.log(qr.split('\n').map((linha) => '  ' + linha).join('\n'));
      console.log('');
    });
  } else {
    console.log('  Não consegui descobrir o IP desta máquina na rede.');
    console.log(`  Veja o IP com "ipconfig" e acesse http://<IP>:${porta}/?token=${TOKEN}`);
    console.log('');
  }

  return { urlLocal, urlLan, urlPareamento };
};
