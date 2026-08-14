// Gera QR code em SVG, para a tela de boas-vindas mostrar um código grande e
// fácil de escanear com o tablet.
//
// Reaproveita a implementação de QR que já vem dentro do qrcode-terminal
// (usado para desenhar o QR no console) — de lá dá para pegar a matriz de
// módulos e desenhar do jeito que quisermos, sem trazer outra dependência
// só para renderizar em imagem.

const QRCode = require('qrcode-terminal/vendor/QRCode');
const QRErrorCorrectLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');

// A "zona de silêncio" (margem branca em volta) faz parte da especificação:
// sem ela muitos leitores não reconhecem o código.
const MARGEM = 4;

function gerarSvg(texto, { corEscura = '#0f1115', corClara = '#ffffff' } = {}) {
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(texto);
  qr.make();

  const modulos = qr.getModuleCount();
  const lado = modulos + MARGEM * 2;

  // Um <rect> por módulo escuro. Para os tamanhos aqui (até ~40x40) o SVG
  // fica pequeno o bastante, e é bem mais simples de auditar que um path.
  let quadrados = '';
  for (let linha = 0; linha < modulos; linha++) {
    for (let coluna = 0; coluna < modulos; coluna++) {
      if (!qr.isDark(linha, coluna)) continue;
      quadrados += `<rect x="${coluna + MARGEM}" y="${linha + MARGEM}" width="1" height="1"/>`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" ` +
    `shape-rendering="crispEdges" role="img" aria-label="QR code para parear o tablet">` +
    `<rect width="${lado}" height="${lado}" fill="${corClara}"/>` +
    `<g fill="${corEscura}">${quadrados}</g>` +
    `</svg>`
  );
}

module.exports = { gerarSvg };
