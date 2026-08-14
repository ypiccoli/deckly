// Mensagem de subida: mostra os endereços, o token e um QR para parear o
// tablet sem precisar digitar nada.
//
// Descobrir o IP da LAN aqui evita o "http://<IP-do-PC-na-rede>:3000" que a
// mensagem antiga pedia para a pessoa resolver sozinha.

const os = require('os');
const qrcode = require('qrcode-terminal');
const { TOKEN, ORIGEM } = require('./token');

// Melhor palpite para "o endereço pelo qual o tablet enxerga este PC":
// primeiro IPv4 não interno de uma interface ativa.
function descobrirIpLan() {
  const interfaces = os.networkInterfaces();
  const candidatos = [];
  for (const [nome, enderecos] of Object.entries(interfaces)) {
    for (const endereco of enderecos || []) {
      if (endereco.family !== 'IPv4' || endereco.internal) continue;
      // Interfaces virtuais (Docker, WSL em modo NAT) costumam atrapalhar
      // mais do que ajudar aqui, então ficam por último.
      const suspeita = /^(docker|br-|veth|vEthernet)/i.test(nome);
      candidatos.push({ endereco: endereco.address, suspeita });
    }
  }
  candidatos.sort((a, b) => Number(a.suspeita) - Number(b.suspeita));
  return candidatos.length ? candidatos[0].endereco : null;
}

module.exports = function mostrarBoasVindas(porta) {
  const ip = descobrirIpLan();
  const urlLocal = `http://127.0.0.1:${porta}`;
  const urlLan = ip ? `http://${ip}:${porta}` : null;
  const urlPareamento = urlLan ? `${urlLan}/?token=${encodeURIComponent(TOKEN)}` : null;

  console.log('');
  console.log(`Stream Deck Web rodando na porta ${porta}`);
  console.log('');
  console.log(`  Neste PC          ${urlLocal}`);
  console.log(`  Configurar        ${urlLocal}/config/`);
  if (urlLan) console.log(`  No tablet (LAN)   ${urlLan}`);
  console.log('');
  console.log(`  Token de acesso   ${TOKEN}   (${ORIGEM})`);
  console.log('');

  if (urlPareamento) {
    console.log('  Para parear o tablet, escaneie o QR abaixo ou abra o link:');
    console.log(`  ${urlPareamento}`);
    console.log('');
    qrcode.generate(urlPareamento, { small: true }, (qr) => {
      console.log(
        qr
          .split('\n')
          .map((linha) => '  ' + linha)
          .join('\n'),
      );
      console.log('');
    });
  } else {
    console.log('  Não consegui descobrir o IP desta máquina na rede.');
    console.log('  Veja o IP com "ipconfig" (Windows) e acesse http://<IP>:' + porta + '/?token=' + TOKEN);
    console.log('');
  }
};
