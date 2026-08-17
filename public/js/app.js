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

  // Registrados por window.deck.aoRenderizar — é como o editor de layout
  // readorna a grade (alças, atributos) depois de qualquer re-render, sem que
  // renderizarGrade precise saber que ele existe.
  const ganchosDeRender = [];

  // Preenchido pelo editor de layout enquanto ele está ativo: recarregar a
  // config no meio de uma edição apagaria o trabalho em andamento.
  let desvioDeRecarga = null;

  async function enviarAcao(id, corpo) {
    const resposta = await window.acesso.buscar(`/action/${encodeURIComponent(id)}`, {
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

    // Estrela para favoritar o que o mostrador está exibindo agora — é como
    // se favorita o canal em que você já está, sem abrir o seletor.
    if (botao.favoritoFonte && botao.favoritoId) {
      const estrela = document.createElement('button');
      estrela.type = 'button';
      estrela.className = 'info-estrela';
      estrela.title = 'Favoritar isto';
      estrela.addEventListener('click', async () => {
        const id = resolverEstado(estadoGlobal, botao.favoritoId);
        if (!id) return;
        estrela.disabled = true;
        try {
          await alternarFavorito(botao.favoritoFonte, id);
          atualizarEstrelaInfo(botao, el);
        } catch (erro) {
          console.error(erro);
        } finally {
          estrela.disabled = false;
        }
      });
      el.querySelector('.botao-info-cabecalho').appendChild(estrela);
      // Sem os favoritos carregados a estrela nasceria vazia mesmo já
      // favoritado; só acontece uma vez por fonte.
      carregarFavoritos(botao.favoritoFonte).then(() => atualizarEstrelaInfo(botao, el));
    }

    return el;
  }

  // Some quando não há nada exibido: favoritar "nenhum canal" não existe.
  function atualizarEstrelaInfo(botao, el) {
    const estrela = el.querySelector('.info-estrela');
    if (!estrela) return;

    const id = resolverEstado(estadoGlobal, botao.favoritoId);
    estrela.hidden = !id;
    if (!id) return;

    const ligada = (favoritosPorFonte[botao.favoritoFonte] || []).includes(String(id));
    estrela.textContent = ligada ? '★' : '☆';
    estrela.classList.toggle('ligada', ligada);
    estrela.setAttribute('aria-pressed', ligada ? 'true' : 'false');
  }

  function atualizarTextoInfo(botao, el) {
    const principal = botao.estadoTexto ? resolverEstado(estadoGlobal, botao.estadoTexto) : null;
    const secundaria = botao.estadoTextoSecundario ? resolverEstado(estadoGlobal, botao.estadoTextoSecundario) : null;
    const terciaria = botao.estadoTextoTerciario ? resolverEstado(estadoGlobal, botao.estadoTextoTerciario) : null;
    // "Nada tocando" era o padrão de quando o único mostrador era o do
    // Spotify; textoVazio deixa cada botão dizer o que faz sentido nele.
    el.querySelector('.info-linha-principal').textContent =
      principal || botao.textoVazio || 'Nada tocando';
    el.querySelector('.info-linha-secundaria').textContent = secundaria || '';
    const elTerciaria = el.querySelector('.info-linha-terciaria');
    if (elTerciaria) elTerciaria.textContent = terciaria ? `em ${terciaria}` : '';
    atualizarEstrelaInfo(botao, el);
  }

  // Ícone de cada item do seletor, escolhido pelo campo "detalhe" que a
  // listagem devolve (tipo do dispositivo Spotify, nome do processo, etc).
  const ICONES_POR_DETALHE = {
    Computer: '💻', Smartphone: '📱', Speaker: '🔊', TV: '📺',
    Tablet: '📱', GameConsole: '🎮', CastVideo: '📺', CastAudio: '🔊',
  };

  function iconeDoItem(detalhe, iconePadrao) {
    return ICONES_POR_DETALHE[detalhe] || iconePadrao || '•';
  }

  // O "detalhe" tem dois usos nas listagens: em algumas ele é um tipo que
  // vira ícone (dispositivos do Spotify), em outras é informação que só
  // existe ali — o servidor de um canal do Discord, por exemplo, que decide
  // qual "Geral" é qual. Só o segundo caso vale escrever ao lado do nome.
  function detalheVisivel(detalhe) {
    return detalhe && !ICONES_POR_DETALHE[detalhe] ? detalhe : '';
  }

  function criarBotaoLista(botao) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'botao';
    el.dataset.id = botao.id;

    el.innerHTML = `
      <span class="botao-icone">${botao.icone || '📡'}</span>
      <span class="botao-titulo">${botao.titulo}</span>
    `;

    el.addEventListener('click', () => abrirSeletor(botao));

    return el;
  }

  // Favoritos: quais ids de cada fonte a pessoa estrelou. Guardado no
  // servidor (config/favoritos.json), espelhado aqui para a estrela do botão
  // "info" saber como se desenhar sem uma ida ao servidor por render.
  const favoritosPorFonte = {};

  async function carregarFavoritos(fonte) {
    try {
      const resposta = await window.acesso.buscar(`/api/favoritos?fonte=${encodeURIComponent(fonte)}`);
      const dados = await resposta.json();
      if (dados.ok) favoritosPorFonte[fonte] = dados.ids.map(String);
    } catch (erro) {
      console.error(erro);
    }
    return favoritosPorFonte[fonte] || [];
  }

  async function alternarFavorito(fonte, id) {
    const resposta = await window.acesso.buscar('/api/favoritos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fonte, id }),
    });
    const dados = await resposta.json();
    if (!dados.ok) throw new Error(dados.erro || 'Falha ao favoritar');

    const atuais = favoritosPorFonte[fonte] || [];
    favoritosPorFonte[fonte] = dados.favorito
      ? [...atuais.filter((x) => x !== String(id)), String(id)]
      : atuais.filter((x) => x !== String(id));
    return dados.favorito;
  }

  // Um item do seletor. É uma div, e não um button, porque tem DOIS alvos de
  // toque: escolher a opção e estrelá-la — e button dentro de button é HTML
  // inválido, que o navegador desmonta.
  function criarItemSeletor(botao, opcao, aoEscolher) {
    const item = document.createElement('div');
    item.className = 'item-lista';
    if (opcao.ativo) item.classList.add('ativo');

    const escolher = document.createElement('button');
    escolher.type = 'button';
    escolher.className = 'item-lista-escolher';
    escolher.innerHTML = `
      <span class="item-lista-icone">${iconeDoItem(opcao.detalhe, botao.iconeItem)}</span>
      <span class="item-lista-nome"></span>
      <span class="item-lista-detalhe"></span>
    `;
    // textContent, não innerHTML: nome de canal é texto de terceiros.
    escolher.querySelector('.item-lista-nome').textContent = opcao.nome;
    escolher.querySelector('.item-lista-detalhe').textContent = detalheVisivel(opcao.detalhe);
    escolher.addEventListener('click', aoEscolher);

    const estrela = document.createElement('button');
    estrela.type = 'button';
    estrela.className = 'item-lista-estrela';
    estrela.title = 'Favoritar';
    estrela.setAttribute('aria-label', `Favoritar ${opcao.nome}`);
    const pintar = (ligada) => {
      estrela.textContent = ligada ? '★' : '☆';
      estrela.classList.toggle('ligada', Boolean(ligada));
      estrela.setAttribute('aria-pressed', ligada ? 'true' : 'false');
    };
    pintar(opcao.favorito);
    estrela.addEventListener('click', async (evento) => {
      // Sem isto, favoritar também escolheria o canal e fecharia o overlay.
      evento.stopPropagation();
      estrela.disabled = true;
      try {
        pintar(await alternarFavorito(botao.fonte, opcao.id));
      } catch (erro) {
        console.error(erro);
      } finally {
        estrela.disabled = false;
      }
    });

    item.appendChild(escolher);
    item.appendChild(estrela);
    return item;
  }

  // Seletor genérico: busca as opções em botao.fonte (que responde
  // { ok, opcoes: [{ id, nome, detalhe, ativo, favorito }] }) e manda a
  // escolha de volta como parametros.opcaoId na ação do próprio botão.
  async function abrirSeletor(botao) {
    const overlay = document.getElementById('overlay-lista');
    const lista = document.getElementById('lista-opcoes');
    const titulo = document.getElementById('overlay-titulo');

    titulo.textContent = botao.titulo;
    lista.innerHTML = '<p class="lista-mensagem">Buscando…</p>';
    overlay.classList.add('aberto');

    try {
      const resposta = await window.acesso.buscar(botao.fonte);
      const dados = await resposta.json();
      if (!resposta.ok || !dados.ok) throw new Error(dados.erro || 'Falha ao buscar a lista');

      // A listagem já vem com os favoritos no topo; o espelho local serve à
      // estrela dos botões "info".
      favoritosPorFonte[botao.fonte] = dados.opcoes.filter((o) => o.favorito).map((o) => String(o.id));

      lista.innerHTML = '';
      if (!dados.opcoes.length) {
        lista.innerHTML = `<p class="lista-mensagem">${botao.mensagemVazia || 'Nada encontrado.'}</p>`;
        return;
      }

      const escolher = (opcao) => async () => {
        overlay.classList.remove('aberto');
        try {
          await enviarAcao(botao.id, { opcaoId: opcao.id });
        } catch (erro) {
          console.error(erro);
        }
      };

      const favoritas = dados.opcoes.filter((o) => o.favorito);
      const restantes = dados.opcoes.filter((o) => !o.favorito);

      // Só separa em seções quando há favorito: uma lista sem nenhum não
      // deve ganhar cabeçalho de seção nenhum.
      const secao = (rotulo) => {
        const el = document.createElement('p');
        el.className = 'lista-secao';
        el.textContent = rotulo;
        lista.appendChild(el);
      };

      if (favoritas.length) secao('★ Favoritos');
      favoritas.forEach((o) => lista.appendChild(criarItemSeletor(botao, o, escolher(o))));
      if (favoritas.length && restantes.length) secao('Todos');
      restantes.forEach((o) => lista.appendChild(criarItemSeletor(botao, o, escolher(o))));
    } catch (erro) {
      lista.innerHTML = `<p class="lista-mensagem">Erro: ${erro.message}</p>`;
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

  // Tamanho e cor vêm do config e viram estilo inline: são valores livres
  // por botão, então não dá para pré-declarar classes para cada combinação.
  function aplicarLayout(el, botao) {
    const largura = Number(botao.largura) || 1;
    const altura = Number(botao.altura) || 1;

    // O slider já nasce com 2 de altura no CSS; só sobrescreve quem pediu
    // um tamanho explícito.
    if (largura > 1 || botao.largura) el.style.gridColumn = `span ${Math.min(largura, 6)}`;
    if (altura > 1 || botao.altura) el.style.gridRow = `span ${Math.min(altura, 6)}`;

    if (botao.cor) {
      // Uma variável só: o CSS deriva borda e brilho dela, então o botão
      // continua coerente com o resto do tema.
      el.style.setProperty('--cor-botao', botao.cor);
      el.classList.add('tem-cor');
    }
  }

  // Colunas e altura de linha da página. Separado de renderizarGrade porque o
  // editor de layout precisa aplicar isso a cada toque no controle, e chamar
  // o render inteiro ali recriaria todos os botões — inclusive refazendo o
  // fetch de favoritos que criarBotaoInfo dispara.
  function aplicarLayoutDaPagina(pagina) {
    // Colunas em branco mantêm o preenchimento automático, que se adapta à
    // largura da tela.
    const colunas = Number(pagina.colunas) || 0;
    elGrade.style.gridTemplateColumns = colunas
      ? `repeat(${Math.min(colunas, 12)}, minmax(0, 1fr))`
      : '';
    if (pagina.alturaBotao) {
      elGrade.style.gridAutoRows = `${Math.max(60, Math.min(Number(pagina.alturaBotao), 260))}px`;
    } else {
      elGrade.style.gridAutoRows = '';
    }
  }

  function renderizarGrade() {
    elGrade.innerHTML = '';
    const pagina = paginas.find((p) => p.id === paginaAtivaId);
    if (!pagina) return;

    aplicarLayoutDaPagina(pagina);

    pagina.botoes.forEach((botao) => {
      let el;
      if (botao.tipo === 'slider') el = criarBotaoSlider(botao);
      else if (botao.tipo === 'info') el = criarBotaoInfo(botao);
      else if (botao.tipo === 'lista') el = criarBotaoLista(botao);
      else el = criarBotaoNormal(botao);
      aplicarLayout(el, botao);
      elGrade.appendChild(el);
    });

    atualizarEstadosNaGrade();
    ganchosDeRender.forEach((gancho) => gancho(pagina));
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
    } else if (mensagem.tipo === 'config_atualizado') {
      // O layout mudou (alguém salvou na tela de configuração): rebusca e
      // re-renderiza sem reiniciar nada nem recarregar a página.
      //
      // A exceção é o modo de edição: recarregar ali apagaria o que a pessoa
      // está arrastando neste instante. Quem estiver editando decide o que
      // fazer com o aviso.
      if (desvioDeRecarga) desvioDeRecarga();
      else carregarConfig();
    }
  }

  async function carregarConfig() {
    const resposta = await window.acesso.buscar('/api/config');
    if (resposta.status === 401) {
      const erro = new Error('Token de acesso inválido');
      erro.naoAutorizado = true;
      throw erro;
    }
    const dados = await resposta.json();
    paginas = dados.paginas || [];

    // Mantém a aba aberta se ela ainda existir depois da mudança.
    if (!paginas.some((p) => p.id === paginaAtivaId)) {
      paginaAtivaId = paginas[0]?.id || null;
    }

    renderizarAbas();
    renderizarGrade();
  }

  function tratarMudancaConexao(conectado) {
    elStatusConexao.classList.toggle('conectado', conectado);
    elStatusConexao.classList.toggle('desconectado', !conectado);
    elStatusConexao.querySelector('.status-texto').textContent = conectado ? 'ao vivo' : 'reconectando…';
  }

  function configurarOverlayLista() {
    const overlay = document.getElementById('overlay-lista');
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

    configurarOverlayLista();

    // Inscreve nos eventos do WS antes de esperar o fetch: se a conexão (ou
    // a primeira mensagem de estado) chegar durante o await abaixo, ainda
    // captura — window.clienteWs também repete o último estado conhecido
    // para quem se inscrever atrasado, então isso é defesa em profundidade.
    window.clienteWs.aoReceberMensagem(tratarMensagemWs);
    window.clienteWs.aoMudarConexao(tratarMudancaConexao);

    try {
      await carregarConfig();
    } catch (erro) {
      // Token guardado deixou de valer (servidor gerou outro, por exemplo):
      // pede o pareamento de novo em vez de mostrar uma tela vazia.
      if (erro && erro.naoAutorizado) {
        window.acesso.esquecer();
        window.acesso.pedirToken();
        return;
      }
      // Com token válido, o outro jeito de falhar aqui é o servidor estar
      // fora do ar — e aí o casco do app veio do cache do service worker,
      // desenhando um deck de mentira. Melhor dizer isso na cara.
      if (!(await window.acesso.servidorNoAr())) {
        window.acesso.mostrarOffline();
        return;
      }
      throw erro;
    }

    window.clienteWs.conectar();
  }

  // Superfície mínima para o editor de layout (js/editor-layout.js), no mesmo
  // padrão de window.acesso e window.clienteWs: um objeto global pequeno e
  // documentado, em vez de espalhar `if (editando)` pelos criadores de botão.
  //
  //   paginas()                 array vivo das páginas (o editor edita ele mesmo)
  //   paginaAtiva()             a página da aba aberta
  //   definirPaginas(novas)     troca tudo e re-renderiza (usado no descartar)
  //   elGrade                   o elemento da grade
  //   renderizarGrade()         render completo
  //   aplicarLayoutDaPagina(p)  só colunas e altura de linha, sem recriar botões
  //   aoRenderizar(fn)          chamado ao fim de cada render, com a página
  //   desviarRecarga(fn|null)   intercepta o config_atualizado do WebSocket
  //   recarregarConfig()        rebusca do servidor e re-renderiza
  window.deck = {
    paginas: () => paginas,
    paginaAtiva: () => paginas.find((p) => p.id === paginaAtivaId) || null,
    definirPaginas(novas) {
      paginas = novas;
      if (!paginas.some((p) => p.id === paginaAtivaId)) paginaAtivaId = paginas[0]?.id || null;
      renderizarAbas();
      renderizarGrade();
    },
    elGrade,
    renderizarGrade,
    aplicarLayoutDaPagina,
    aoRenderizar(fn) {
      ganchosDeRender.push(fn);
    },
    desviarRecarga(fn) {
      desvioDeRecarga = fn || null;
    },
    recarregarConfig: carregarConfig,
  };

  // Só começa depois que houver token — sem ele, toda chamada volta 401.
  window.acesso.garantir(iniciar);
})();
