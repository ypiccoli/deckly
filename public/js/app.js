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
      </div>
      <span class="slider-valor">${valorInicial}</span>
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

  function criarBotaoInfo(botao) {
    const el = document.createElement('div');
    el.className = 'botao botao-info';
    el.dataset.id = botao.id;
    if (botao.estiloEstado) el.classList.add(`estilo-${botao.estiloEstado}`);

    el.innerHTML = `
      <div class="botao-info-cabecalho">
        <span class="botao-icone">${botao.icone || 'ℹ️'}</span>
        <span class="botao-titulo">${botao.titulo}</span>
      </div>
      <div class="info-linha-principal">—</div>
      <div class="info-linha-secundaria"></div>
      <div class="info-linha-terciaria"></div>
    `;

    return el;
  }

  function atualizarTextoInfo(botao, el) {
    const principal = botao.estadoTexto ? resolverEstado(estadoGlobal, botao.estadoTexto) : null;
    const secundaria = botao.estadoTextoSecundario ? resolverEstado(estadoGlobal, botao.estadoTextoSecundario) : null;
    const terciaria = botao.estadoTextoTerciario ? resolverEstado(estadoGlobal, botao.estadoTextoTerciario) : null;
    el.querySelector('.info-linha-principal').textContent = principal || 'Nada tocando';
    el.querySelector('.info-linha-secundaria').textContent = secundaria || '';
    const elTerciaria = el.querySelector('.info-linha-terciaria');
    if (elTerciaria) elTerciaria.textContent = terciaria ? `em ${terciaria}` : '';
  }

  function iconePorTipoDispositivo(tipo) {
    const mapa = { Computer: '💻', Smartphone: '📱', Speaker: '🔊', TV: '📺', Tablet: '📱', GameConsole: '🎮', CastVideo: '📺', CastAudio: '🔊' };
    return mapa[tipo] || '📡';
  }

  function criarBotaoDispositivo(botao) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'botao';
    el.dataset.id = botao.id;

    el.innerHTML = `
      <span class="botao-icone">${botao.icone || '📡'}</span>
      <span class="botao-titulo">${botao.titulo}</span>
    `;

    el.addEventListener('click', () => abrirSeletorDispositivos(botao));

    return el;
  }

  async function abrirSeletorDispositivos(botao) {
    const overlay = document.getElementById('overlay-dispositivos');
    const lista = document.getElementById('lista-dispositivos');
    lista.innerHTML = '<p class="lista-dispositivos-mensagem">Buscando dispositivos…</p>';
    overlay.classList.add('aberto');

    try {
      const resposta = await fetch('/spotify/dispositivos');
      const dados = await resposta.json();
      if (!resposta.ok || !dados.ok) throw new Error(dados.erro || 'Falha ao buscar dispositivos');

      lista.innerHTML = '';
      if (!dados.dispositivos.length) {
        lista.innerHTML = '<p class="lista-dispositivos-mensagem">Nenhum dispositivo Spotify ativo encontrado. Abra o Spotify em algum aparelho e tente de novo.</p>';
        return;
      }

      dados.dispositivos.forEach((dispositivo) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'item-dispositivo';
        if (dispositivo.is_active) item.classList.add('ativo');
        item.innerHTML = `
          <span class="item-dispositivo-icone">${iconePorTipoDispositivo(dispositivo.type)}</span>
          <span class="item-dispositivo-nome">${dispositivo.name}</span>
        `;
        item.addEventListener('click', async () => {
          overlay.classList.remove('aberto');
          try {
            await enviarAcao(botao.id, { dispositivoId: dispositivo.id });
          } catch (erro) {
            console.error(erro);
          }
        });
        lista.appendChild(item);
      });
    } catch (erro) {
      lista.innerHTML = `<p class="lista-dispositivos-mensagem">Erro: ${erro.message}</p>`;
    }
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
      let el;
      if (botao.tipo === 'slider') el = criarBotaoSlider(botao);
      else if (botao.tipo === 'info') el = criarBotaoInfo(botao);
      else if (botao.tipo === 'dispositivo') el = criarBotaoDispositivo(botao);
      else el = criarBotaoNormal(botao);
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

      if (botao.tipo === 'info') {
        atualizarTextoInfo(botao, el);
      }

      const ativo = botaoEstaAtivo(botao);
      if (botao.iconeAtivo) {
        const elIcone = el.querySelector('.botao-icone');
        if (elIcone) elIcone.textContent = ativo ? botao.iconeAtivo : botao.icone || '⬛';
      }
      if (botao.tituloAtivo) {
        const elTitulo = el.querySelector('.botao-titulo');
        if (elTitulo) elTitulo.textContent = ativo ? botao.tituloAtivo : botao.titulo;
      }
      el.classList.toggle('ativo', ativo);
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

  function configurarOverlayDispositivos() {
    const overlay = document.getElementById('overlay-dispositivos');
    document.getElementById('overlay-fechar').addEventListener('click', () => {
      overlay.classList.remove('aberto');
    });
    overlay.addEventListener('click', (evento) => {
      if (evento.target === overlay) overlay.classList.remove('aberto');
    });
  }

  async function iniciar() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((erro) => console.warn('SW: falha ao registrar', erro));
    }

    configurarOverlayDispositivos();

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
