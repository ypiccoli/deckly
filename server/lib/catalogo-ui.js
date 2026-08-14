// Vocabulário do editor de botões: os tipos de botão e os estilos de destaque.
//
// Fica separado das rotas porque tem dois consumidores: a tela de
// configuração (via GET /api/catalogo, que monta os formulários a partir
// disto) e o gerador da documentação (scripts/gerar-docs.js). Duplicar essas
// listas seria o jeito garantido de a doc ficar mentindo sobre o app.

const TIPOS_BOTAO = [
  { id: 'botao', rotulo: 'Botão', descricao: 'Toca e dispara uma ação.' },
  { id: 'slider', rotulo: 'Slider', descricao: 'Controle deslizante, para volume e afins.' },
  { id: 'info', rotulo: 'Mostrador', descricao: 'Só exibe informação ao vivo, não dispara nada.' },
  { id: 'lista', rotulo: 'Seletor', descricao: 'Abre uma lista de opções para escolher.' },
];

const ESTILOS_ESTADO = [
  { id: 'destaque', rotulo: 'Destaque (verde)' },
  { id: 'perigo', rotulo: 'Alerta (vermelho)' },
  { id: 'gravando', rotulo: 'Gravando (vermelho pulsante)' },
];

module.exports = { TIPOS_BOTAO, ESTILOS_ESTADO };
