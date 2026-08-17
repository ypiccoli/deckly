// Modo de edição de layout, dentro do próprio deck.
//
// Por que aqui e não numa tela separada: montar o deck era editar no PC,
// salvar, pegar o tablet e olhar — a grade se comporta de um jeito no monitor
// e de outro na tela de 10 polegadas, então cada ajuste virava uma viagem de
// ida e volta. Editando na tela real, o preview é a própria tela.
//
// A regra que orienta o arquivo inteiro: **durante a interação, nada de
// re-render**. Arrastar move o nó no DOM (`insertBefore`) e redimensionar
// escreve `grid-column: span N` no estilo do elemento; a grade CSS reflui
// sozinha. Chamar `renderizarGrade()` a cada movimento recriaria todos os
// botões — e `criarBotaoInfo` dispara um fetch de favoritos a cada criação,
// o que viraria uma tempestade de requisições. O array de botões só é
// sincronizado a partir da ordem do DOM ao soltar.
//
// Salvar usa `PUT /api/layout`, que aceita só ordem, tamanho, colunas e
// altura — por isso o modo de edição funciona no tablet sem afrouxar a trava
// que protege o resto da configuração. Veja server/routes/layout.js.

(function () {
  'use strict';

  // Distância antes de um toque virar arraste. Abaixo disso conta como
  // seleção — que é o caminho para redimensionar no tablet, onde mirar a
  // alça de um botão 1x1 direto é pedir demais do polegar.
  const LIMIAR_ARRASTE = 8;
  // Sem isto a grade oscila entre duas posições quando o dedo fica parado
  // em cima da fronteira entre dois botões.
  const HISTERESE = 4;
  const FAIXA_AUTOSCROLL = 64;
  // Mesmo teto de public/js/app.js e do validador em server/config-store.js.
  const SPAN_MAXIMO = 6;
  const COLUNAS_OPCOES = [0, 2, 3, 4, 5, 6, 8, 10, 12]; // 0 = automático
  const ALTURA_PADRAO = 120;

  let ativo = false;
  let sujo = false;
  let original = null; // clone das páginas ao entrar, para o descartar
  let selecionado = null;
  let avisouConflito = false;

  let arraste = null;
  let redimensao = null;
  let animacaoScroll = null;
  let velocidadeScroll = 0;

  const elBotaoEditar = document.getElementById('btn-editar-layout');
  const elBarra = document.getElementById('barra-edicao');

  const grade = () => window.deck.elGrade;
  const paginaAtual = () => window.deck.paginaAtiva();
  const limitar = (n, min, max) => Math.max(min, Math.min(n, max));

  /* ================= entrar e sair ================= */

  function marcarSujo() {
    sujo = true;
    elBarra.classList.add('sujo');
    atualizarBarra();
  }

  function entrar() {
    if (ativo) return;
    ativo = true;
    sujo = false;
    avisouConflito = false;
    original = JSON.parse(JSON.stringify(window.deck.paginas()));

    document.body.classList.add('modo-edicao');
    elBarra.hidden = false;
    elBotaoEditar.classList.add('ligado');
    elBotaoEditar.setAttribute('aria-pressed', 'true');

    // Salvar em outro aparelho no meio de uma edição jogaria fora o que está
    // sendo arrastado agora. Avisa e deixa a escolha com quem está editando.
    window.deck.desviarRecarga(() => {
      avisouConflito = true;
      atualizarBarra();
    });

    window.deck.renderizarGrade();
    atualizarBarra();
  }

  function sair() {
    ativo = false;
    selecionado = null;
    document.body.classList.remove('modo-edicao');
    elBarra.hidden = true;
    elBarra.classList.remove('sujo');
    elBotaoEditar.classList.remove('ligado');
    elBotaoEditar.setAttribute('aria-pressed', 'false');
    window.deck.desviarRecarga(null);
    window.deck.renderizarGrade();
  }

  function descartar() {
    if (sujo && !window.confirm('Descartar as mudanças de layout?')) return;
    window.deck.definirPaginas(JSON.parse(JSON.stringify(original)));
    sair();
  }

  async function salvar() {
    const corpo = {
      paginas: window.deck.paginas().map((pagina) => ({
        id: pagina.id,
        colunas: pagina.colunas,
        alturaBotao: pagina.alturaBotao,
        botoes: pagina.botoes.map((b) => ({ id: b.id, largura: b.largura, altura: b.altura })),
      })),
    };

    const botao = elBarra.querySelector('[data-acao="salvar"]');
    botao.disabled = true;
    botao.textContent = 'Salvando…';
    try {
      const resposta = await window.acesso.buscar('/api/layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok || !dados.ok) {
        throw new Error((dados.erros && dados.erros[0]) || 'Não deu para salvar o layout.');
      }
      sujo = false;
      elBarra.classList.remove('sujo');
      sair();
    } catch (erro) {
      window.alert(erro.message);
    } finally {
      botao.disabled = false;
      botao.textContent = 'Salvar';
    }
  }

  /* ================= barra de edição ================= */

  function atualizarBarra() {
    const pagina = paginaAtual();
    if (!pagina) return;

    const colunas = Number(pagina.colunas) || 0;
    elBarra.querySelectorAll('[data-colunas]').forEach((chip) => {
      chip.classList.toggle('ligado', Number(chip.dataset.colunas) === colunas);
    });

    const altura = Number(pagina.alturaBotao) || ALTURA_PADRAO;
    const faixa = elBarra.querySelector('[data-acao="altura"]');
    faixa.value = altura;
    elBarra.querySelector('.altura-valor').textContent = `${altura}px`;

    elBarra.querySelector('.aviso-conflito').hidden = !avisouConflito;

    // Um botão mais largo que a grade fica cortado, e isso não é óbvio até
    // alguém abrir no tablet.
    const largoDemais =
      colunas > 0 && pagina.botoes.some((b) => Number(b.largura) > colunas);
    const aviso = elBarra.querySelector('.aviso-largura');
    aviso.hidden = !largoDemais;

    elBarra.querySelector('.edicao-pagina').textContent = pagina.titulo;
  }

  function definirColunas(valor) {
    const pagina = paginaAtual();
    if (!pagina) return;
    if (valor > 0) pagina.colunas = valor;
    else delete pagina.colunas;
    window.deck.aplicarLayoutDaPagina(pagina);
    marcarSujo();
  }

  function definirAltura(valor) {
    const pagina = paginaAtual();
    if (!pagina) return;
    if (valor === ALTURA_PADRAO) delete pagina.alturaBotao;
    else pagina.alturaBotao = valor;
    window.deck.aplicarLayoutDaPagina(pagina);
    marcarSujo();
  }

  /* ================= seleção e tamanho ================= */

  function selecionar(el) {
    if (selecionado === el) {
      selecionar(null);
      return;
    }
    grade().querySelectorAll('.botao.selecionado').forEach((b) => b.classList.remove('selecionado'));
    grade().querySelectorAll('.alca-tamanho').forEach((a) => a.remove());
    selecionado = el || null;
    if (!selecionado) {
      atualizarChipsTamanho();
      return;
    }
    selecionado.classList.add('selecionado');
    const alca = document.createElement('span');
    alca.className = 'alca-tamanho';
    alca.title = 'Arraste para redimensionar';
    selecionado.appendChild(alca);
    atualizarChipsTamanho();
  }

  function atualizarChipsTamanho() {
    const bloco = elBarra.querySelector('.edicao-tamanho');
    bloco.hidden = !selecionado;
    if (!selecionado) return;
    bloco.querySelector('.tamanho-alvo').textContent =
      selecionado.querySelector('.botao-titulo')?.textContent || selecionado.dataset.id;
    bloco.querySelector('.tamanho-largura').textContent = spanAtual(selecionado, 'x');
    bloco.querySelector('.tamanho-altura').textContent = spanAtual(selecionado, 'y');
  }

  // Slider nasce 1x2 e mostrador 2x2 pelo CSS, sem campo no config — então o
  // tamanho vigente vem do DOM, não do objeto do botão. Sem isso a primeira
  // redimensionada de um slider o jogaria para 1x1.
  function spanAtual(el, eixo) {
    const estilo = getComputedStyle(el);
    const valor = eixo === 'x' ? estilo.gridColumnStart : estilo.gridRowStart;
    const achado = /span\s+(\d+)/.exec(valor || '');
    return achado ? Number(achado[1]) : 1;
  }

  function botaoDoElemento(el) {
    const pagina = paginaAtual();
    return pagina ? pagina.botoes.find((b) => b.id === el.dataset.id) : null;
  }

  function aplicarTamanho(el, largura, altura) {
    const botao = botaoDoElemento(el);
    if (!botao) return;
    el.style.gridColumn = `span ${largura}`;
    el.style.gridRow = `span ${altura}`;
    // 1 é o padrão: gravar "largura: 1" só sujaria o arquivo — mesma
    // convenção da tela de configuração.
    if (largura > 1) botao.largura = largura;
    else delete botao.largura;
    if (altura > 1) botao.altura = altura;
    else delete botao.altura;
    atualizarChipsTamanho();
    marcarSujo();
  }

  function ajustarTamanho(eixo, delta) {
    if (!selecionado) return;
    const { colunas } = medidasDaGrade();
    const larguraMaxima = colunas > 0 ? Math.min(SPAN_MAXIMO, colunas) : SPAN_MAXIMO;
    const largura = spanAtual(selecionado, 'x');
    const altura = spanAtual(selecionado, 'y');
    if (eixo === 'x') aplicarTamanho(selecionado, limitar(largura + delta, 1, larguraMaxima), altura);
    else aplicarTamanho(selecionado, largura, limitar(altura + delta, 1, SPAN_MAXIMO));
    atualizarBarra();
  }

  // As trilhas resolvidas vêm do próprio navegador, então isto funciona igual
  // com o auto-fill do CSS e com o repeat(N,...) que o deck escreve inline —
  // sem recalcular largura de coluna a partir de padding e gap na mão.
  function medidasDaGrade() {
    const estilo = getComputedStyle(grade());
    const trilhas = estilo.gridTemplateColumns.split(' ').filter(Boolean);
    const larguraColuna = parseFloat(trilhas[0]) || 140;
    const espacoX = parseFloat(estilo.columnGap) || 16;
    const espacoY = parseFloat(estilo.rowGap) || 16;
    const alturaLinha = parseFloat(estilo.gridAutoRows) || ALTURA_PADRAO;
    return {
      colunas: trilhas.length || 0,
      passoX: larguraColuna + espacoX,
      passoY: alturaLinha + espacoY,
    };
  }

  /* ================= arrastar ================= */

  function aoPointerDown(evento) {
    if (!ativo || evento.button > 0) return;

    const alca = evento.target.closest('.alca-tamanho');
    const el = evento.target.closest('.botao');
    if (!el || !grade().contains(el)) return;

    // Em modo de edição nenhum toque pode disparar ação. A captura no
    // contêiner roda antes dos listeners do próprio botão, então isto também
    // impede o clique de POST /action/:id e o overlay do seletor de abrir.
    evento.preventDefault();
    evento.stopPropagation();

    const r = el.getBoundingClientRect();
    if (alca) {
      redimensao = { el, pointerId: evento.pointerId, esquerda: r.left, topo: r.top };
    } else {
      arraste = {
        el,
        pointerId: evento.pointerId,
        x0: evento.clientX,
        y0: evento.clientY,
        arrastando: false,
      };
    }
    // Captura no contêiner, e não no botão: o botão é reinserido no DOM várias
    // vezes durante o arraste, e a captura nele não sobreviveria a isso.
    grade().setPointerCapture(evento.pointerId);
  }

  function aoPointerMove(evento) {
    if (redimensao && evento.pointerId === redimensao.pointerId) {
      const { colunas, passoX, passoY } = medidasDaGrade();
      const larguraMaxima = colunas > 0 ? Math.min(SPAN_MAXIMO, colunas) : SPAN_MAXIMO;
      const largura = limitar(
        Math.round((evento.clientX - redimensao.esquerda + passoX / 2) / passoX),
        1,
        larguraMaxima,
      );
      const altura = limitar(
        Math.round((evento.clientY - redimensao.topo + passoY / 2) / passoY),
        1,
        SPAN_MAXIMO,
      );
      aplicarTamanho(redimensao.el, largura, altura);
      return;
    }

    if (!arraste || evento.pointerId !== arraste.pointerId) return;

    if (!arraste.arrastando) {
      if (Math.hypot(evento.clientX - arraste.x0, evento.clientY - arraste.y0) < LIMIAR_ARRASTE) return;
      arraste.arrastando = true;
      arraste.el.classList.add('arrastando');
      selecionar(null);
    }

    arraste.ultimoX = evento.clientX;
    arraste.ultimoY = evento.clientY;

    const jaAvaliou = arraste.avaliadoX !== undefined;
    if (jaAvaliou && Math.hypot(evento.clientX - arraste.avaliadoX, evento.clientY - arraste.avaliadoY) < HISTERESE) {
      return;
    }
    arraste.avaliadoX = evento.clientX;
    arraste.avaliadoY = evento.clientY;

    reposicionar(evento.clientX, evento.clientY);
    cuidarAutoScroll(evento.clientY);
  }

  // Uma CSS grid não tem alvo de soltura nativo: descobre-se pelo ponto.
  function reposicionar(x, y) {
    if (!arraste) return;
    const g = grade();
    const sob = document.elementFromPoint(x, y);
    const alvo = sob && sob.closest ? sob.closest('.botao') : null;

    if (!alvo || alvo === arraste.el || !g.contains(alvo)) {
      // Solto no vazio abaixo do último botão: vai para o fim.
      const ultimo = g.lastElementChild;
      if (ultimo && ultimo !== arraste.el && y > ultimo.getBoundingClientRect().bottom) {
        g.appendChild(arraste.el);
      }
      return;
    }

    const r = alvo.getBoundingClientRect();
    const depois = x - r.left > r.width / 2;
    const referencia = depois ? alvo.nextSibling : alvo;
    // Já está aí: reinserir só causaria reflow e piscada.
    if (referencia === arraste.el) return;
    g.insertBefore(arraste.el, referencia);
  }

  function cuidarAutoScroll(y) {
    const r = grade().getBoundingClientRect();
    let v = 0;
    if (y < r.top + FAIXA_AUTOSCROLL) v = -Math.ceil((r.top + FAIXA_AUTOSCROLL - y) / 6);
    else if (y > r.bottom - FAIXA_AUTOSCROLL) v = Math.ceil((y - (r.bottom - FAIXA_AUTOSCROLL)) / 6);

    velocidadeScroll = v;
    if (!v) {
      pararAutoScroll();
      return;
    }
    if (animacaoScroll) return;

    const passo = () => {
      if (!arraste || !velocidadeScroll) {
        pararAutoScroll();
        return;
      }
      grade().scrollTop += velocidadeScroll;
      // O dedo está parado e o conteúdo é que se move, então o alvo precisa
      // ser reavaliado com as últimas coordenadas conhecidas.
      reposicionar(arraste.ultimoX, arraste.ultimoY);
      animacaoScroll = requestAnimationFrame(passo);
    };
    animacaoScroll = requestAnimationFrame(passo);
  }

  function pararAutoScroll() {
    if (animacaoScroll) cancelAnimationFrame(animacaoScroll);
    animacaoScroll = null;
    velocidadeScroll = 0;
  }

  function aoPointerUp(evento) {
    if (redimensao && evento.pointerId === redimensao.pointerId) {
      redimensao = null;
      atualizarBarra();
      return;
    }
    if (!arraste || evento.pointerId !== arraste.pointerId) return;

    pararAutoScroll();
    const { el, arrastando } = arraste;
    arraste = null;
    el.classList.remove('arrastando');

    if (arrastando) {
      sincronizarOrdemComDom();
      marcarSujo();
    } else {
      // Toque curto = selecionar, para então mirar a alça ou usar os ± da barra.
      selecionar(el);
    }
  }

  // A ordem do DOM é a verdade depois de arrastar; o array segue ela.
  function sincronizarOrdemComDom() {
    const pagina = paginaAtual();
    if (!pagina) return;
    const porId = new Map(pagina.botoes.map((b) => [b.id, b]));
    const nova = Array.from(grade().children)
      .map((el) => porId.get(el.dataset.id))
      .filter(Boolean);
    if (nova.length === pagina.botoes.length) pagina.botoes = nova;
  }

  function cancelarInteracao() {
    pararAutoScroll();
    if (arraste) arraste.el.classList.remove('arrastando');
    arraste = null;
    redimensao = null;
  }

  /* ================= ligação ================= */

  function montarBarra() {
    const chips = COLUNAS_OPCOES.map(
      (n) => `<button type="button" class="chip" data-colunas="${n}">${n === 0 ? 'Auto' : n}</button>`,
    ).join('');

    elBarra.innerHTML = `
      <div class="edicao-linha">
        <strong class="edicao-pagina"></strong>
        <span class="edicao-dica">Arraste para mover · toque para selecionar e redimensionar</span>
        <span class="edicao-acoes">
          <button type="button" class="btn-edicao" data-acao="descartar">Descartar</button>
          <button type="button" class="btn-edicao primario" data-acao="salvar">Salvar</button>
        </span>
      </div>
      <div class="edicao-linha">
        <span class="edicao-rotulo">Colunas</span>
        <span class="edicao-chips">${chips}</span>
        <span class="edicao-rotulo">Altura</span>
        <input type="range" class="edicao-faixa" data-acao="altura" min="60" max="260" step="10" />
        <span class="altura-valor"></span>
      </div>
      <div class="edicao-linha edicao-tamanho" hidden>
        <span class="edicao-rotulo">Tamanho de <b class="tamanho-alvo"></b></span>
        <span class="edicao-chips">
          <button type="button" class="chip" data-tamanho="x" data-delta="-1">−</button>
          <span class="chip-valor"><b class="tamanho-largura">1</b> col</span>
          <button type="button" class="chip" data-tamanho="x" data-delta="1">+</button>
        </span>
        <span class="edicao-chips">
          <button type="button" class="chip" data-tamanho="y" data-delta="-1">−</button>
          <span class="chip-valor"><b class="tamanho-altura">1</b> lin</span>
          <button type="button" class="chip" data-tamanho="y" data-delta="1">+</button>
        </span>
      </div>
      <p class="edicao-aviso aviso-largura" hidden>Há botão mais largo que o número de colunas — ele vai aparecer cortado.</p>
      <p class="edicao-aviso aviso-conflito" hidden>O layout mudou em outro aparelho. Salvar vai sobrescrever o que está lá.</p>
    `;

    elBarra.addEventListener('click', (evento) => {
      const alvo = evento.target.closest('[data-acao], [data-colunas], [data-tamanho]');
      if (!alvo) return;
      if (alvo.dataset.acao === 'salvar') salvar();
      else if (alvo.dataset.acao === 'descartar') descartar();
      else if (alvo.dataset.colunas !== undefined) {
        definirColunas(Number(alvo.dataset.colunas));
        atualizarBarra();
      } else if (alvo.dataset.tamanho) {
        ajustarTamanho(alvo.dataset.tamanho, Number(alvo.dataset.delta));
      }
    });

    elBarra.querySelector('[data-acao="altura"]').addEventListener('input', (evento) => {
      const valor = Number(evento.target.value);
      elBarra.querySelector('.altura-valor').textContent = `${valor}px`;
      definirAltura(valor);
    });
  }

  function iniciar() {
    if (!window.deck || !elBarra || !elBotaoEditar) return;

    montarBarra();
    elBotaoEditar.hidden = false;
    elBotaoEditar.addEventListener('click', () => (ativo ? descartar() : entrar()));

    const g = grade();
    // Fase de captura: roda antes dos listeners que os criadores de botão
    // registram, e é isso que deixa as ações inertes sem tocar neles.
    g.addEventListener('pointerdown', aoPointerDown, true);
    g.addEventListener('pointermove', aoPointerMove, true);
    g.addEventListener('pointerup', aoPointerUp, true);
    g.addEventListener('pointercancel', cancelarInteracao, true);
    g.addEventListener('lostpointercapture', cancelarInteracao, true);
    for (const tipo of ['click', 'change', 'input']) {
      g.addEventListener(
        tipo,
        (evento) => {
          if (ativo) {
            evento.preventDefault();
            evento.stopPropagation();
          }
        },
        true,
      );
    }

    // Trocar de aba dentro do modo de edição mantém as mudanças das outras
    // páginas: elas vivem no mesmo array e vão juntas no salvamento.
    window.deck.aoRenderizar(() => {
      if (!ativo) return;
      selecionado = null;
      atualizarChipsTamanho();
      atualizarBarra();
    });

    window.addEventListener('beforeunload', (evento) => {
      if (!ativo || !sujo) return;
      evento.preventDefault();
      evento.returnValue = '';
    });
  }

  // O app.js só publica window.deck no fim da IIFE, e este script carrega
  // depois dele — mas o boot do deck é assíncrono (espera token e config),
  // então a grade pode ainda estar vazia. Isso não importa: os listeners são
  // no contêiner, que já existe.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
