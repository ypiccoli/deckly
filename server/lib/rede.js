// Descobre o endereço pelo qual o tablet enxerga este PC.
//
// Fica separado porque tanto a mensagem do console quanto a tela de
// boas-vindas precisam do mesmo palpite — e precisam concordar.

const os = require('os');

// Primeiro IPv4 não interno de uma interface ativa. Interfaces virtuais
// (Docker, WSL em modo NAT, Hyper-V) costumam atrapalhar mais do que ajudar
// aqui, então ficam por último na ordem de preferência.
function descobrirIpLan() {
  const interfaces = os.networkInterfaces();
  const candidatos = [];

  for (const [nome, enderecos] of Object.entries(interfaces)) {
    for (const endereco of enderecos || []) {
      if (endereco.family !== 'IPv4' || endereco.internal) continue;
      const suspeita = /^(docker|br-|veth|vEthernet|WSL)/i.test(nome);
      candidatos.push({ endereco: endereco.address, suspeita });
    }
  }

  candidatos.sort((a, b) => Number(a.suspeita) - Number(b.suspeita));
  return candidatos.length ? candidatos[0].endereco : null;
}

module.exports = { descobrirIpLan };
