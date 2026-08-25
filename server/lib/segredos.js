// Tira segredo de texto que vai virar log ou resposta de erro.
//
// Existe por causa de um vazamento real: quando o access token do Discord
// expira, o próprio Discord responde "Invalid access token: <o token>", e essa
// mensagem era interpolada num console.log. No modo empacotado o console vai
// para `deckly.log`, um arquivo solto ao lado do .exe — ou seja, a credencial
// ficava em texto puro num arquivo sem proteção nenhuma.
//
// A substituição diz QUAL chave foi ocultada («DISCORD_ACCESS_TOKEN oculto»).
// Sem isso a mensagem perde o valor de diagnóstico: "token inválido" sem
// saber qual token não ajuda ninguém a consertar nada.

// Nomes de variável que guardam segredo. É por nome, e não por valor: não há
// como olhar para uma string e saber se ela é uma senha.
const NOME_SENSIVEL = /TOKEN|SECRET|SENHA|PASSWORD|KEY/i;

// Valor curto demais não é redigido. Um segredo de 4 caracteres não é
// segredo, e apagar "1234" de toda mensagem estragaria texto legítimo
// ("porta 3000", "erro 404") sem proteger nada de verdade.
const TAMANHO_MINIMO = 6;

function _escapar(valor) {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Varre process.env a cada chamada, de propósito: o env-store grava
// credencial nova em tempo de execução (é o que a aba Integrações faz), e um
// cache devolveria o valor velho justamente depois de uma troca. O custo não
// importa — isto só roda em caminho de erro.
function redigir(texto) {
  let saida = String(texto ?? '');
  for (const [chave, valor] of Object.entries(process.env)) {
    if (!valor || valor.length < TAMANHO_MINIMO) continue;
    if (!NOME_SENSIVEL.test(chave)) continue;
    if (!saida.includes(valor)) continue;
    saida = saida.replace(new RegExp(_escapar(valor), 'g'), `«${chave} oculto»`);
  }
  return saida;
}

module.exports = { redigir };
