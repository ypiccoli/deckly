// App principal: busca a configuração de páginas/botões no servidor, renderiza
// abas + grade, envia ações via POST /action/:id e reflete o estado ao vivo
// recebido pelo WebSocket (cena ativa, mic mudo, gravando, volume, etc).

(function () {
  let paginas = [];
  let paginaAtivaId = null;
  let estadoGlobal = {};

  const elAbas = document.getElementById('abas');
  const elGrade = document.getElementById('grade');
  const elStatusConexao = document.getElementById('status-conexao');

  function resolverEstado(objeto, caminho) {
    if (!caminho) return undefined;
    return caminho.split('.').reduce((atual, parte) => (atual == null ? undefined : atual[parte]), objeto);
  }

  function botaoEstaAtivo(botao) {
    if (!botao.estadoChave) return false;
    const valor = resolverEstado(estadoGlobal, botao.estadoChave);
    if (botao.estadoComparar) {
      const alvo = botao.parametros ? botao.parametros[botao.estadoComparar] : undefined;
      return valor !== undefined && valor === alvo;
    }
    return Boolean(valor);
  }

  async function enviarAcao(id, corpo) {
    const resposta = await fetch(`/action/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo || {}),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok || dados.ok === false) {
      throw new Error(dados.erro || `Falha ao executar "${id}"`);
    }
    return dados;
  }

  function darFeedback(el, classe) {
    el.classList.add(classe);
    setTimeout(() => el.classList.remove(classe), 420);
  }

  function criarBotaoNormal(botao) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'botao';
    el.dataset.id = botao.id;
    if (botao.estiloEstado) el.classList.add(`estilo-${botao.estiloEstado}`);

    el.innerHTML = `
      <span class="botao-icone">${botao.icone || '⬛'}</span>
      <span class="botao-titulo">${botao.titulo}</span>
    `;

    el.addEventListener('pointerdown', () => el.classList.add('pressionado'));
    el.addEventListener('pointerup', () => el.classList.remove('pressionado'));
    el.addEventListener('pointercancel', () => el.classList.remove('pressionado'));
    el.addEventListener('pointerleave', () => el.classList.remove('pressionado'));

    el.addEventListener('click', async () => {
      try {
        await enviarAcao(botao.id);
        darFeedback(el, 'sucesso');
      } catch (erro) {
        console.error(erro);
        darFeedback(el, 'erro');
      }
    });

    return el;
  }

  function criarBotaoSlider(botao) {
    const el = document.createElement('div');
    el.className = 'botao botao-slider';
    el.dataset.id = botao.id;

    const min = botao.min ?? 0;
    const max = botao.max ?? 100;
    const valorInicial = resolverEstado(estadoGlobal, botao.estadoChave) ?? min;

    el.innerHTML = `
      <div class="botao-slider-cabecalho">
        <span class="botao-icone">${botao.icone || '🎚️'}</span>
        <span class="botao-titulo">${botao.titulo}</span>
        <span class="slider-valor">${valorInicial}</span>
      </div>
      <input type="range" class="controle-slider" min="${min}" max="${max}" value="${valorInicial}" />
    `;

    const input = el.querySelector('.controle-slider');
    const valorEl = el.querySelector('.slider-valor');

    input.addEventListener('input', () => {
      valorEl.textContent = input.value;
    });

    input.addEventListener('change', async () => {
      try {
        await enviarAcao(botao.id, { valor: Number(input.value) });
        darFeedback(el, 'sucesso');
      } catch (erro) {
        console.error(erro);
        darFeedback(el, 'erro');
      }
    });

    return el;
  }

  function renderizarAbas() {
    elAbas.innerHTML = '';
    paginas.forEach((pagina) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'aba';
      el.dataset.id = pagina.id;
      if (pagina.id === paginaAtivaId) el.classList.add('ativa');
      el.innerHTML = `<span class="aba-icone">${pagina.icone || ''}</span><span>${pagina.titulo}</span>`;
      el.addEventListener('click', () => {
        paginaAtivaId = pagina.id;
        renderizarAbas();
        renderizarGrade();
      });
      elAbas.appendChild(el);
    });
  }

  function renderizarGrade() {
    elGrade.innerHTML = '';
    const pagina = paginas.find((p) => p.id === paginaAtivaId);
    if (!pagina) return;

    pagina.botoes.forEach((botao) => {
      const el = botao.tipo === 'slider' ? criarBotaoSlider(botao) : criarBotaoNormal(botao);
      elGrade.appendChild(el);
    });

    atualizarEstadosNaGrade();
  }

  function atualizarEstadosNaGrade() {
    const pagina = paginas.find((p) => p.id === paginaAtivaId);
    if (!pagina) return;

    pagina.botoes.forEach((botao) => {
      const el = elGrade.querySelector(`[data-id="${CSS.escape(botao.id)}"]`);
      if (!el) return;

      if (botao.tipo === 'slider') {
        const valor = resolverEstado(estadoGlobal, botao.estadoChave);
        if (valor !== undefined) {
          const input = el.querySelector('.controle-slider');
          const valorEl = el.querySelector('.slider-valor');
          if (document.activeElement !== input) {
            input.value = valor;
            valorEl.textContent = valor;
          }
        }
        return;
      }

      el.classList.toggle('ativo', botaoEstaAtivo(botao));
    });
  }

  function tratarMensagemWs(mensagem) {
    if (mensagem.tipo === 'estado_completo') {
      estadoGlobal = mensagem.dados || {};
      atualizarEstadosNaGrade();
    } else if (mensagem.tipo === 'estado') {
      estadoGlobal = { ...estadoGlobal, [mensagem.integracao]: mensagem.dados };
      atualizarEstadosNaGrade();
    }
  }

  function tratarMudancaConexao(conectado) {
    elStatusConexao.classList.toggle('conectado', conectado);
    elStatusConexao.classList.toggle('desconectado', !conectado);
    elStatusConexao.querySelector('.status-texto').textContent = conectado ? 'ao vivo' : 'reconectando…';
  }

  async function iniciar() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((erro) => console.warn('SW: falha ao registrar', erro));
    }

    // Inscreve nos eventos do WS antes de esperar o fetch: se a conexão (ou
    // a primeira mensagem de estado) chegar durante o await abaixo, ainda
    // captura — window.clienteWs também repete o último estado conhecido
    // para quem se inscrever atrasado, então isso é defesa em profundidade.
    window.clienteWs.aoReceberMensagem(tratarMensagemWs);
    window.clienteWs.aoMudarConexao(tratarMudancaConexao);

    const resposta = await fetch('/api/config');
    const dados = await resposta.json();
    paginas = dados.paginas || [];
    paginaAtivaId = paginas[0]?.id || null;

    renderizarAbas();
    renderizarGrade();
  }

  iniciar();
})();
