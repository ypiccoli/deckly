// Tela de configuração: monta páginas e botões do deck sem editar arquivo.
//
// Trabalha sobre uma cópia em memória do config (GET /api/config) e só grava
// quando você clica em Salvar (PUT /api/config). Os formulários não têm nada
// hardcoded sobre as integrações — tudo vem de GET /api/catalogo, então uma
// integração nova aparece aqui sozinha assim que expuser seu `catalogo`.

(function () {
  'use strict';

  // Emojis com glifo garantido no Android/Windows. Nada de pictogramas sem
  // apresentação emoji (U+1F5A7, U+1F5B5 e afins) — eles aparecem quebrados.
  var EMOJIS = [
    '🎵','🎧','🎶','🔊','🔉','🔇','🎚️','🎙️','⏯️','⏮️','⏭️','⏹️','⏺️','▶️','⏸️',
    '🎥','📷','📸','📺','🎬','🎤','💡','🔌','🔋','🏠','🛋️','🌡️','🌙','☀️',
    '💻','⌨️','🖱️','🪟','🖥️','📱','📡','🌐','🔗','📁','📋','🔍','⚙️','🔧','🔨',
    '🎮','🕹️','🎯','🏆','⚡','🔥','⭐','✨','🚀','🎲','🧩',
    '🔒','🔓','🛡️','🔑','⚠️','✅','❌','⏱️','📅','📈','📊','📝','🗒️','📚','🎓',
    '🤖','👤','👥','💬','📧','☕','🍕','🎉','❤️','🧪','🧭','🔔','🔕',
  ];

  var estado = {
    config: null,
    catalogo: null,
    tipos: [],
    estilosEstado: [],
    paginaIdx: null,
    botaoIdx: null,
    sujo: false,
    aoEscolherEmoji: null,
  };

  var el = {
    subtitulo: document.getElementById('topo-sub'),
    avisoSujo: document.getElementById('aviso-sujo'),
    btnSalvar: document.getElementById('btn-salvar'),
    erros: document.getElementById('erros'),
    listaPaginas: document.getElementById('lista-paginas'),
    listaBotoes: document.getElementById('lista-botoes'),
    tituloBotoes: document.getElementById('titulo-botoes'),
    tituloForm: document.getElementById('titulo-form'),
    form: document.getElementById('form'),
    btnAddPagina: document.getElementById('btn-add-pagina'),
    btnAddBotao: document.getElementById('btn-add-botao'),
    overlayEmoji: document.getElementById('overlay-emoji'),
    emojiGrade: document.getElementById('emoji-grade'),
    emojiLivre: document.getElementById('emoji-livre'),
    overlayIntegracoes: document.getElementById('overlay-integracoes'),
    integracoesLista: document.getElementById('integracoes-lista'),
    btnIntegracoes: document.getElementById('btn-integracoes'),
    toast: document.getElementById('toast'),
  };

  /* ---------------- utilidades ---------------- */

  function esc(s) {
    return (s == null ? '' : String(s)).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function toast(msg, erro) {
    el.toast.textContent = msg;
    el.toast.className = 'toast on' + (erro ? ' erro' : '');
    setTimeout(function () { el.toast.className = 'toast' + (erro ? ' erro' : ''); }, 2600);
  }

  function marcarSujo() {
    estado.sujo = true;
    el.avisoSujo.hidden = false;
    el.btnSalvar.disabled = false;
  }

  function paginaAtual() {
    return estado.paginaIdx == null ? null : estado.config.paginas[estado.paginaIdx];
  }

  function botaoAtual() {
    var p = paginaAtual();
    if (!p || estado.botaoIdx == null) return null;
    return p.botoes[estado.botaoIdx];
  }

  // Gera um id único a partir do título, no formato "pagina.slug".
  function gerarId(prefixo, titulo) {
    var base = (titulo || 'botao')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // tira acentos
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'item';
    var usados = new Set();
    estado.config.paginas.forEach(function (p) {
      p.botoes.forEach(function (b) { usados.add(b.id); });
    });
    var id = prefixo + '.' + base;
    var n = 2;
    while (usados.has(id)) id = prefixo + '.' + base + '_' + n++;
    return id;
  }

  function mover(lista, de, para) {
    if (para < 0 || para >= lista.length) return false;
    var item = lista.splice(de, 1)[0];
    lista.splice(para, 0, item);
    return true;
  }

  /* ---------------- listas ---------------- */

  function renderListaPaginas() {
    el.listaPaginas.innerHTML = '';
    estado.config.paginas.forEach(function (pagina, i) {
      var li = document.createElement('li');
      li.className = 'item' + (i === estado.paginaIdx ? ' ativo' : '');
      li.innerHTML =
        '<span class="item-icone">' + esc(pagina.icone || '📄') + '</span>' +
        '<span class="item-texto"><span class="item-nome">' + esc(pagina.titulo) + '</span>' +
        '<span class="item-sub">' + pagina.botoes.length + ' botões</span></span>' +
        '<span class="item-ordem">' +
        '<button type="button" class="mini" data-mover="-1"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
        '<button type="button" class="mini" data-mover="1"' + (i === estado.config.paginas.length - 1 ? ' disabled' : '') + '>▼</button>' +
        '</span>';

      li.addEventListener('click', function (ev) {
        if (ev.target.closest('[data-mover]')) return;
        estado.paginaIdx = i;
        estado.botaoIdx = null;
        renderTudo();
      });
      li.querySelectorAll('[data-mover]').forEach(function (b) {
        b.addEventListener('click', function () {
          var destino = i + Number(b.getAttribute('data-mover'));
          if (!mover(estado.config.paginas, i, destino)) return;
          if (estado.paginaIdx === i) estado.paginaIdx = destino;
          marcarSujo();
          renderTudo();
        });
      });
      el.listaPaginas.appendChild(li);
    });
  }

  function renderListaBotoes() {
    var pagina = paginaAtual();
    el.listaBotoes.innerHTML = '';
    el.btnAddBotao.disabled = !pagina;
    el.tituloBotoes.textContent = pagina ? 'Botões de ' + pagina.titulo : 'Botões';

    if (!pagina) {
      el.listaBotoes.innerHTML = '<p class="vazio">Escolha uma página.</p>';
      return;
    }
    if (pagina.botoes.length === 0) {
      el.listaBotoes.innerHTML = '<p class="vazio">Nenhum botão ainda.</p>';
      return;
    }

    pagina.botoes.forEach(function (botao, i) {
      var descricao = botao.acoes
        ? 'macro · ' + botao.acoes.length + ' ações'
        : (botao.tipo && botao.tipo !== 'botao' ? botao.tipo + ' · ' : '') + (botao.acao || '—');

      // Sem setinhas de ordem aqui: a posição do botão na grade se ajusta
      // arrastando, no modo de edição do próprio deck (✏️ no cabeçalho). Duas
      // formas de fazer a mesma coisa, uma delas às cegas, era só confusão —
      // e a lista abaixo nem mostra o tamanho ou a posição real.
      var li = document.createElement('li');
      li.className = 'item' + (i === estado.botaoIdx ? ' ativo' : '');
      li.innerHTML =
        '<span class="item-icone">' + esc(botao.icone || '⬛') + '</span>' +
        '<span class="item-texto"><span class="item-nome">' + esc(botao.titulo) + '</span>' +
        '<span class="item-sub">' + esc(descricao) + '</span></span>';

      li.addEventListener('click', function () {
        estado.botaoIdx = i;
        renderTudo();
      });
      el.listaBotoes.appendChild(li);
    });
  }

  /* ---------------- construtores de campo ---------------- */

  function campoTexto(rotulo, valor, aoMudar, opcoes) {
    opcoes = opcoes || {};
    var wrap = document.createElement('div');
    wrap.className = 'campo-grupo';
    var id = 'c' + Math.random().toString(36).slice(2, 9);
    wrap.innerHTML = '<label for="' + id + '">' + esc(rotulo) + '</label>';
    var input = document.createElement('input');
    input.type = opcoes.numero ? 'number' : 'text';
    input.className = 'campo';
    input.id = id;
    input.value = valor == null ? '' : valor;
    if (opcoes.placeholder) input.placeholder = opcoes.placeholder;
    input.addEventListener('input', function () {
      aoMudar(opcoes.numero ? (input.value === '' ? undefined : Number(input.value)) : input.value);
      marcarSujo();
    });
    wrap.appendChild(input);
    if (opcoes.ajuda) {
      var ajuda = document.createElement('span');
      ajuda.className = 'campo-ajuda';
      ajuda.textContent = opcoes.ajuda;
      wrap.appendChild(ajuda);
    }
    return wrap;
  }

  // Cor é opcional: sem cor o botão segue o tema, e é assim que a maioria
  // deve ficar. Por isso o seletor vem acompanhado de um "limpar" — sem ele
  // não haveria como voltar atrás depois de escolher uma cor.
  function campoCor(rotulo, valor, aoMudar) {
    var wrap = document.createElement('div');
    wrap.className = 'campo-grupo';

    var label = document.createElement('label');
    label.textContent = rotulo;
    wrap.appendChild(label);

    var caixa = document.createElement('div');
    caixa.className = 'campo-cor';

    var input = document.createElement('input');
    input.type = 'color';
    input.value = valor || '#6c5ce7';
    input.addEventListener('input', function () {
      aoMudar(input.value);
      marcarSujo();
    });
    caixa.appendChild(input);

    var limpar = document.createElement('button');
    limpar.type = 'button';
    limpar.className = 'btn btn-fantasma btn-pequeno';
    limpar.textContent = valor ? 'Limpar' : 'Sem cor';
    limpar.disabled = !valor;
    limpar.addEventListener('click', function () {
      aoMudar('');
      limpar.disabled = true;
      limpar.textContent = 'Sem cor';
      marcarSujo();
    });
    caixa.appendChild(limpar);

    wrap.appendChild(caixa);
    return wrap;
  }

  function campoSelect(rotulo, valor, opcoes, aoMudar, extras) {
    extras = extras || {};
    var wrap = document.createElement('div');
    wrap.className = 'campo-grupo';
    var id = 'c' + Math.random().toString(36).slice(2, 9);
    wrap.innerHTML = '<label for="' + id + '">' + esc(rotulo) + '</label>';
    var sel = document.createElement('select');
    sel.className = 'campo';
    sel.id = id;

    if (extras.vazio !== false) {
      var vazia = document.createElement('option');
      vazia.value = '';
      vazia.textContent = extras.textoVazio || '— escolha —';
      sel.appendChild(vazia);
    }
    opcoes.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.valor;
      opt.textContent = o.rotulo;
      if (o.desabilitado) opt.disabled = true;
      sel.appendChild(opt);
    });
    sel.value = valor == null ? '' : valor;
    sel.addEventListener('change', function () {
      aoMudar(sel.value === '' ? undefined : sel.value);
      marcarSujo();
    });
    wrap.appendChild(sel);
    if (extras.ajuda) {
      var ajuda = document.createElement('span');
      ajuda.className = 'campo-ajuda';
      ajuda.textContent = extras.ajuda;
      wrap.appendChild(ajuda);
    }
    return wrap;
  }

  function campoIcone(rotulo, valor, aoMudar) {
    var wrap = document.createElement('div');
    wrap.className = 'campo-grupo';
    wrap.innerHTML = '<label>' + esc(rotulo) + '</label>';
    var linha = document.createElement('div');
    linha.className = 'seletor-icone';

    var amostra = document.createElement('button');
    amostra.type = 'button';
    amostra.className = 'amostra';
    amostra.textContent = valor || '⬛';

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'campo';
    input.value = valor || '';
    input.maxLength = 8;

    function definir(v) {
      input.value = v;
      amostra.textContent = v || '⬛';
      aoMudar(v);
      marcarSujo();
    }
    amostra.addEventListener('click', function () { abrirSeletorEmoji(definir); });
    input.addEventListener('input', function () { definir(input.value); });

    linha.appendChild(amostra);
    linha.appendChild(input);
    wrap.appendChild(linha);
    return wrap;
  }

  /* ---------------- formulário do botão ---------------- */

  // Um "passo" é { integracao, acao, parametros }. Botão simples usa os
  // campos direto no próprio botão; macro usa a lista `acoes`. Os dois são
  // editados pelo mesmo código.
  function blocoPasso(passo, titulo, aoRemover) {
    var bloco = document.createElement('div');
    bloco.className = 'passo';

    var topo = document.createElement('div');
    topo.className = 'passo-topo';
    topo.innerHTML = '<span class="passo-num">' + esc(titulo) + '</span>';
    if (aoRemover) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-pequeno btn-perigo';
      btn.textContent = 'Remover passo';
      btn.addEventListener('click', aoRemover);
      topo.appendChild(btn);
    }
    bloco.appendChild(topo);

    var opcoesIntegracao = Object.keys(estado.catalogo).map(function (nome) {
      var c = estado.catalogo[nome];
      return { valor: nome, rotulo: c.rotulo + (c.disponivel ? '' : ' (indisponível)') };
    });

    bloco.appendChild(
      campoSelect('Integração', passo.integracao, opcoesIntegracao, function (v) {
        passo.integracao = v;
        // Ação e parâmetros pertenciam à integração anterior.
        delete passo.acao;
        delete passo.parametros;
        renderFormulario();
      })
    );

    var cat = passo.integracao ? estado.catalogo[passo.integracao] : null;

    if (cat && !cat.disponivel) {
      var aviso = document.createElement('div');
      aviso.className = 'aviso-indisponivel';
      aviso.textContent = cat.motivoIndisponivel || 'Integração indisponível no momento.';
      bloco.appendChild(aviso);
    }

    if (cat) {
      var opcoesAcao = Object.keys(cat.acoes).map(function (nome) {
        return { valor: nome, rotulo: cat.acoes[nome].rotulo };
      });
      bloco.appendChild(
        campoSelect('Ação', passo.acao, opcoesAcao, function (v) {
          passo.acao = v;
          delete passo.parametros;
          renderFormulario();
        })
      );

      // Parâmetros vêm do catálogo — nada aqui é hardcoded por integração.
      var specAcao = passo.acao ? cat.acoes[passo.acao] : null;
      if (specAcao && specAcao.parametros.length > 0) {
        var fs = document.createElement('fieldset');
        fs.className = 'bloco';
        fs.innerHTML = '<legend>Parâmetros</legend>';
        specAcao.parametros.forEach(function (spec) {
          passo.parametros = passo.parametros || {};
          fs.appendChild(
            campoTexto(
              spec.rotulo + (spec.obrigatorio ? ' *' : ''),
              passo.parametros[spec.nome],
              function (v) {
                if (v === '' || v === undefined) delete passo.parametros[spec.nome];
                else passo.parametros[spec.nome] = spec.tipo === 'numero' ? Number(v) : v;
              },
              { ajuda: spec.ajuda, numero: spec.tipo === 'numero' }
            )
          );
        });
        bloco.appendChild(fs);
      }
    }

    return bloco;
  }

  function renderFormulario() {
    var botao = botaoAtual();
    el.form.innerHTML = '';

    if (!botao) {
      el.tituloForm.textContent = 'Detalhes';
      el.form.innerHTML = '<p class="vazio">Escolha um botão à esquerda, ou crie um novo.</p>';
      return;
    }

    el.tituloForm.textContent = botao.titulo || 'Botão';
    var tipo = botao.tipo || 'botao';

    // --- básico ---
    var linha = document.createElement('div');
    linha.className = 'linha';
    linha.appendChild(campoTexto('Título', botao.titulo, function (v) { botao.titulo = v; renderListaBotoes(); }));
    linha.appendChild(campoIcone('Ícone', botao.icone, function (v) { botao.icone = v; renderListaBotoes(); }));
    el.form.appendChild(linha);

    // --- cor ---
    //
    // Tamanho e posição saíram daqui: escolher "largura 3" num select sem ver
    // a grade era chutar. Isso agora se faz arrastando, no modo de edição do
    // próprio deck, onde o resultado aparece na hora e na tela de verdade.
    // A cor fica, porque não tem equivalente lá.
    var linhaCor = document.createElement('div');
    linhaCor.className = 'linha';
    linhaCor.appendChild(campoCor('Cor', botao.cor, function (v) {
      if (v) botao.cor = v; else delete botao.cor;
    }));
    el.form.appendChild(linhaCor);

    el.form.appendChild(
      campoSelect(
        'Tipo',
        tipo,
        estado.tipos.map(function (t) { return { valor: t.id, rotulo: t.rotulo }; }),
        function (v) {
          botao.tipo = v === 'botao' ? undefined : v;
          if (botao.tipo === undefined) delete botao.tipo;
          renderFormulario();
          renderListaBotoes();
        },
        { vazio: false, ajuda: (estado.tipos.find(function (t) { return t.id === tipo; }) || {}).descricao }
      )
    );

    // --- slider: faixa ---
    if (tipo === 'slider') {
      var faixa = document.createElement('div');
      faixa.className = 'linha';
      faixa.appendChild(campoTexto('Mínimo', botao.min == null ? 0 : botao.min, function (v) { botao.min = v; }, { numero: true }));
      faixa.appendChild(campoTexto('Máximo', botao.max == null ? 100 : botao.max, function (v) { botao.max = v; }, { numero: true }));
      el.form.appendChild(faixa);
      if (botao.min == null) botao.min = 0;
      if (botao.max == null) botao.max = 100;
    }

    // --- lista: de onde vêm as opções ---
    if (tipo === 'lista') {
      var fontes = [];
      Object.keys(estado.catalogo).forEach(function (nome) {
        (estado.catalogo[nome].listas || []).forEach(function (l) {
          fontes.push({ valor: l.fonte, rotulo: l.rotulo });
        });
      });
      el.form.appendChild(
        campoSelect('Lista de opções', botao.fonte, fontes, function (v) { botao.fonte = v; }, {
          ajuda: 'De onde o seletor busca as opções quando você toca no botão.',
        })
      );
      el.form.appendChild(
        campoTexto('Texto quando a lista vem vazia', botao.mensagemVazia, function (v) {
          if (v) botao.mensagemVazia = v; else delete botao.mensagemVazia;
        })
      );
    }

    // --- info: linhas de texto ---
    if (tipo === 'info') {
      var estadosDisponiveis = [];
      Object.keys(estado.catalogo).forEach(function (nome) {
        (estado.catalogo[nome].estados || []).forEach(function (e) {
          estadosDisponiveis.push({ valor: e.chave, rotulo: e.rotulo });
        });
      });
      var fsInfo = document.createElement('fieldset');
      fsInfo.className = 'bloco';
      fsInfo.innerHTML = '<legend>O que mostrar</legend>';
      [
        ['estadoTexto', 'Linha principal'],
        ['estadoTextoSecundario', 'Linha secundária'],
        ['estadoTextoTerciario', 'Linha terciária'],
      ].forEach(function (par) {
        fsInfo.appendChild(
          campoSelect(par[1], botao[par[0]], estadosDisponiveis, function (v) {
            if (v) botao[par[0]] = v; else delete botao[par[0]];
          })
        );
      });

      fsInfo.appendChild(
        campoTexto('Texto quando não há nada a mostrar', botao.textoVazio, function (v) {
          if (v) botao.textoVazio = v; else delete botao.textoVazio;
        }, { ajuda: 'Em branco, mostra "Nada tocando".' })
      );

      // Estrela de favoritar o que o mostrador exibe agora. Precisa saber de
      // qual lista o item é e onde está o id dele no estado ao vivo.
      var fontesInfo = [];
      Object.keys(estado.catalogo).forEach(function (nome) {
        (estado.catalogo[nome].listas || []).forEach(function (l) {
          fontesInfo.push({ valor: l.fonte, rotulo: l.rotulo });
        });
      });
      fsInfo.appendChild(
        campoSelect('Estrela para favoritar (de qual lista)', botao.favoritoFonte, fontesInfo, function (v) {
          if (v) botao.favoritoFonte = v; else delete botao.favoritoFonte;
        }, { textoVazio: '— sem estrela —' })
      );
      fsInfo.appendChild(
        campoSelect('Onde está o id do item exibido', botao.favoritoId, estadosDisponiveis, function (v) {
          if (v) botao.favoritoId = v; else delete botao.favoritoId;
        }, { textoVazio: '— sem estrela —' })
      );

      el.form.appendChild(fsInfo);
    }

    // --- o que o botão faz (exceto "info", que não dispara nada) ---
    if (tipo !== 'info') {
      var fsAcao = document.createElement('fieldset');
      fsAcao.className = 'bloco';
      var ehMacro = Array.isArray(botao.acoes);
      fsAcao.innerHTML = '<legend>O que acontece ao tocar</legend>';

      var alternar = document.createElement('button');
      alternar.type = 'button';
      alternar.className = 'btn btn-pequeno';
      alternar.textContent = ehMacro ? 'Voltar para ação única' : 'Transformar em macro (várias ações)';
      alternar.addEventListener('click', function () {
        if (ehMacro) {
          var primeiro = botao.acoes[0] || {};
          botao.integracao = primeiro.integracao;
          botao.acao = primeiro.acao;
          botao.parametros = primeiro.parametros;
          delete botao.acoes;
        } else {
          botao.acoes = [{ integracao: botao.integracao, acao: botao.acao, parametros: botao.parametros }];
          delete botao.integracao;
          delete botao.acao;
          delete botao.parametros;
        }
        marcarSujo();
        renderFormulario();
        renderListaBotoes();
      });
      fsAcao.appendChild(alternar);

      if (ehMacro) {
        botao.acoes.forEach(function (passo, i) {
          fsAcao.appendChild(
            blocoPasso(passo, 'Passo ' + (i + 1), function () {
              botao.acoes.splice(i, 1);
              marcarSujo();
              renderFormulario();
              renderListaBotoes();
            })
          );
        });
        var addPasso = document.createElement('button');
        addPasso.type = 'button';
        addPasso.className = 'btn btn-pequeno';
        addPasso.textContent = '+ Passo';
        addPasso.addEventListener('click', function () {
          botao.acoes.push({});
          marcarSujo();
          renderFormulario();
          renderListaBotoes();
        });
        fsAcao.appendChild(addPasso);
      } else {
        fsAcao.appendChild(blocoPasso(botao, 'Ação', null));
      }

      el.form.appendChild(fsAcao);
    }

    // --- avançado ---
    var avancado = document.createElement('details');
    avancado.className = 'avancado';
    avancado.innerHTML = '<summary>Avançado — estado ao vivo e identificador</summary>';
    var corpo = document.createElement('div');

    var todosEstados = [];
    Object.keys(estado.catalogo).forEach(function (nome) {
      (estado.catalogo[nome].estados || []).forEach(function (e) {
        todosEstados.push({ valor: e.chave, rotulo: e.rotulo });
      });
    });

    corpo.appendChild(
      campoSelect('Acender o botão conforme', botao.estadoChave, todosEstados, function (v) {
        if (v) botao.estadoChave = v; else delete botao.estadoChave;
      }, { ajuda: 'Deixe vazio para o botão nunca ficar destacado.' })
    );
    corpo.appendChild(
      campoSelect('Estilo quando aceso', botao.estiloEstado,
        estado.estilosEstado.map(function (e) { return { valor: e.id, rotulo: e.rotulo }; }),
        function (v) { if (v) botao.estiloEstado = v; else delete botao.estiloEstado; })
    );
    corpo.appendChild(
      campoTexto('Comparar estado com o parâmetro', botao.estadoComparar, function (v) {
        if (v) botao.estadoComparar = v; else delete botao.estadoComparar;
      }, { ajuda: 'Ex.: "cena" faz o botão acender só quando a cena ativa for a dele.' })
    );
    var linhaAtivo = document.createElement('div');
    linhaAtivo.className = 'linha';
    linhaAtivo.appendChild(campoTexto('Ícone quando aceso', botao.iconeAtivo, function (v) {
      if (v) botao.iconeAtivo = v; else delete botao.iconeAtivo;
    }));
    linhaAtivo.appendChild(campoTexto('Título quando aceso', botao.tituloAtivo, function (v) {
      if (v) botao.tituloAtivo = v; else delete botao.tituloAtivo;
    }));
    corpo.appendChild(linhaAtivo);
    corpo.appendChild(
      campoTexto('Identificador (id)', botao.id, function (v) { botao.id = v; }, {
        ajuda: 'Único no app inteiro. Mudar aqui muda a URL da ação — só altere se souber o que está fazendo.',
      })
    );
    corpo.appendChild(
      campoTexto('Nota (só para você lembrar depois)', botao._nota, function (v) {
        if (v) botao._nota = v; else delete botao._nota;
      })
    );
    avancado.appendChild(corpo);
    el.form.appendChild(avancado);

    // --- remover ---
    var acoes = document.createElement('div');
    acoes.className = 'acoes-form';
    var remover = document.createElement('button');
    remover.type = 'button';
    remover.className = 'btn btn-perigo';
    remover.textContent = 'Remover botão';
    remover.addEventListener('click', function () {
      if (!confirm('Remover o botão "' + (botao.titulo || botao.id) + '"?')) return;
      paginaAtual().botoes.splice(estado.botaoIdx, 1);
      estado.botaoIdx = null;
      marcarSujo();
      renderTudo();
    });
    acoes.appendChild(remover);
    el.form.appendChild(acoes);
  }

  /* ---------------- formulário da página ---------------- */

  function renderFormularioPagina() {
    var pagina = paginaAtual();
    if (!pagina || estado.botaoIdx != null) return;

    el.tituloForm.textContent = 'Página: ' + pagina.titulo;
    el.form.innerHTML = '';

    var linha = document.createElement('div');
    linha.className = 'linha';
    linha.appendChild(campoTexto('Título da página', pagina.titulo, function (v) {
      pagina.titulo = v;
      renderListaPaginas();
      el.tituloForm.textContent = 'Página: ' + v;
    }));
    linha.appendChild(campoIcone('Ícone', pagina.icone, function (v) { pagina.icone = v; renderListaPaginas(); }));
    el.form.appendChild(linha);

    // --- layout da página ---
    // Colunas e altura dos botões saíram daqui pelo mesmo motivo do tamanho:
    // são decisões visuais, e escolhê-las sem ver a grade é chutar. Ficam no
    // modo de edição do deck, onde mudam a tela enquanto você arrasta o
    // controle.
    var dicaLayout = document.createElement('p');
    dicaLayout.className = 'dica-layout';
    dicaLayout.innerHTML =
      'Para mover, redimensionar botões e ajustar as colunas desta página, ' +
      'abra o deck e toque no <b>✏️</b> do cabeçalho.';
    el.form.appendChild(dicaLayout);

    var avancado = document.createElement('details');
    avancado.className = 'avancado';
    avancado.innerHTML = '<summary>Avançado</summary>';
    var corpo = document.createElement('div');
    corpo.appendChild(campoTexto('Identificador (id)', pagina.id, function (v) { pagina.id = v; }));
    corpo.appendChild(campoTexto('Nota', pagina._nota, function (v) {
      if (v) pagina._nota = v; else delete pagina._nota;
    }));
    avancado.appendChild(corpo);
    el.form.appendChild(avancado);

    var dica = document.createElement('p');
    dica.className = 'vazio';
    dica.textContent = 'Escolha um botão na coluna do meio para editá-lo, ou crie um novo.';
    el.form.appendChild(dica);

    var acoes = document.createElement('div');
    acoes.className = 'acoes-form';
    var remover = document.createElement('button');
    remover.type = 'button';
    remover.className = 'btn btn-perigo';
    remover.textContent = 'Remover página';
    remover.addEventListener('click', function () {
      if (!confirm('Remover a página "' + pagina.titulo + '" e seus ' + pagina.botoes.length + ' botões?')) return;
      estado.config.paginas.splice(estado.paginaIdx, 1);
      estado.paginaIdx = estado.config.paginas.length ? 0 : null;
      estado.botaoIdx = null;
      marcarSujo();
      renderTudo();
    });
    acoes.appendChild(remover);
    el.form.appendChild(acoes);
  }

  function renderTudo() {
    renderListaPaginas();
    renderListaBotoes();
    if (estado.botaoIdx != null) renderFormulario();
    else renderFormularioPagina();
  }

  /* ---------------- seletor de emoji ---------------- */

  function abrirSeletorEmoji(aoEscolher) {
    estado.aoEscolherEmoji = aoEscolher;
    el.emojiLivre.value = '';
    el.overlayEmoji.classList.add('aberto');
  }

  function montarGradeEmoji() {
    EMOJIS.forEach(function (e) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      b.addEventListener('click', function () {
        if (estado.aoEscolherEmoji) estado.aoEscolherEmoji(e);
        el.overlayEmoji.classList.remove('aberto');
      });
      el.emojiGrade.appendChild(b);
    });
  }

  /* ---------------- salvar ---------------- */

  async function salvar() {
    el.erros.hidden = true;
    el.btnSalvar.disabled = true;

    try {
      var resposta = await window.acesso.buscar('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(estado.config),
      });
      var dados = await resposta.json();

      if (!resposta.ok || !dados.ok) {
        var lista = (dados.erros || ['Erro desconhecido ao salvar.'])
          .map(function (e) { return '<li>' + esc(e) + '</li>'; })
          .join('');
        el.erros.innerHTML = '<h3>Não deu para salvar — corrija e tente de novo:</h3><ul>' + lista + '</ul>';
        el.erros.hidden = false;
        el.erros.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.btnSalvar.disabled = false;
        toast('Configuração não salva', true);
        return;
      }

      estado.sujo = false;
      el.avisoSujo.hidden = true;
      toast('Salvo — o deck já se atualizou');
    } catch (erro) {
      el.erros.innerHTML = '<h3>Falha de conexão</h3><ul><li>' + esc(erro.message) + '</li></ul>';
      el.erros.hidden = false;
      el.btnSalvar.disabled = false;
      toast('Falha ao salvar', true);
    }
  }

  /* ---------------- boot ---------------- */

  el.btnAddPagina.addEventListener('click', function () {
    var n = estado.config.paginas.length + 1;
    var id = 'pagina_' + n;
    while (estado.config.paginas.some(function (p) { return p.id === id; })) id = 'pagina_' + ++n;
    estado.config.paginas.push({ id: id, titulo: 'Nova página', icone: '📄', botoes: [] });
    estado.paginaIdx = estado.config.paginas.length - 1;
    estado.botaoIdx = null;
    marcarSujo();
    renderTudo();
  });

  el.btnAddBotao.addEventListener('click', function () {
    var pagina = paginaAtual();
    if (!pagina) return;
    pagina.botoes.push({
      id: gerarId(pagina.id, 'novo botao'),
      titulo: 'Novo botão',
      icone: '⭐',
    });
    estado.botaoIdx = pagina.botoes.length - 1;
    marcarSujo();
    renderTudo();
  });

  el.btnSalvar.addEventListener('click', salvar);
  document.getElementById('emoji-fechar').addEventListener('click', function () {
    el.overlayEmoji.classList.remove('aberto');
  });
  el.overlayEmoji.addEventListener('click', function (ev) {
    if (ev.target === el.overlayEmoji) el.overlayEmoji.classList.remove('aberto');
  });
  // 'change' (Enter ou sair do campo), não 'input': aplicar a cada tecla
  // fecharia o seletor no primeiro caractere de quem estivesse digitando.
  el.emojiLivre.addEventListener('change', function () {
    var v = el.emojiLivre.value.trim();
    if (!v) return;
    if (estado.aoEscolherEmoji) estado.aoEscolherEmoji(v);
    el.overlayEmoji.classList.remove('aberto');
  });

  window.addEventListener('beforeunload', function (ev) {
    if (!estado.sujo) return;
    ev.preventDefault();
    ev.returnValue = '';
  });

  /* ---------------- integrações (credenciais) ---------------- */

  // Esta tela é montada a partir de GET /api/integracoes, que por sua vez sai
  // do getter `configuracao` de cada integração. Nada aqui sabe o que é
  // "Spotify" ou "OBS" — integração nova aparece sozinha.

  function selo(integracao) {
    if (integracao.naoImplementado) return '<span class="selo selo-obra">em construção</span>';
    if (integracao.disponivel) return '<span class="selo selo-ok">funcionando</span>';
    return '<span class="selo selo-off">não conectado</span>';
  }

  function montarCampoIntegracao(campo) {
    var wrap = document.createElement('div');
    wrap.className = 'campo-grupo';

    var id = 'int-' + campo.env;
    var label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = campo.rotulo;
    wrap.appendChild(label);

    // Campos de escolha: booleano é uma lista de dois valores, e uma lista
    // com opções declaradas pela integração usa o mesmo <select>.
    if (campo.tipo === 'booleano' || campo.tipo === 'lista') {
      var opcoes = campo.tipo === 'booleano'
        ? [{ valor: 'true', rotulo: 'Sim' }, { valor: 'false', rotulo: 'Não' }]
        : campo.opcoes || [];

      var sel = document.createElement('select');
      sel.className = 'campo';
      sel.id = id;
      opcoes.forEach(function (opcao) {
        var o = document.createElement('option');
        o.value = opcao.valor;
        o.textContent = opcao.rotulo;
        sel.appendChild(o);
      });
      sel.value = campo.valor || campo.padrao || (opcoes[0] && opcoes[0].valor) || '';
      wrap.appendChild(sel);

      if (campo.ajuda) {
        var ajudaSel = document.createElement('p');
        ajudaSel.className = 'campo-ajuda';
        ajudaSel.textContent = campo.ajuda;
        wrap.appendChild(ajudaSel);
      }

      wrap.dataset.env = campo.env;
      return wrap;
    }

    var input = document.createElement('input');
    input.className = 'campo';
    input.id = id;
    input.type = campo.secreto ? 'password' : campo.tipo === 'numero' ? 'number' : 'text';
    input.autocomplete = 'off';
    input.value = campo.valor || '';
    input.placeholder = campo.padrao ? 'padrão: ' + campo.padrao : '';
    wrap.appendChild(input);

    // Segredo já guardado: o valor nunca vem do servidor, então o campo fica
    // vazio. Sem este aviso, pareceria que a credencial se perdeu — e um
    // campo vazio ao salvar significa "não mexi", não "apague".
    if (campo.secreto && campo.preenchido) {
      input.placeholder = '•••••••• (guardado — preencha só para trocar)';
      var guardado = document.createElement('div');
      guardado.className = 'campo-guardado';
      guardado.innerHTML = '<span>✓ guardado</span>';
      var limpar = document.createElement('button');
      limpar.type = 'button';
      limpar.textContent = 'apagar';
      limpar.addEventListener('click', function () {
        if (!window.confirm('Apagar ' + campo.rotulo + '?')) return;
        input.value = '';
        input.dataset.limpar = '1';
        guardado.innerHTML = '<span style="color:#ff4d5e">será apagado ao salvar</span>';
      });
      guardado.appendChild(limpar);
      wrap.appendChild(guardado);
    }

    if (campo.ajuda) {
      var ajuda = document.createElement('p');
      ajuda.className = 'campo-ajuda';
      ajuda.textContent = campo.ajuda;
      wrap.appendChild(ajuda);
    }

    wrap.dataset.env = campo.env;
    wrap.dataset.secreto = campo.secreto ? '1' : '';
    return wrap;
  }

  function montarIntegracao(integracao) {
    var cartao = document.createElement('div');
    cartao.className = 'integracao';

    var topo = document.createElement('div');
    topo.className = 'integracao-topo';
    topo.innerHTML = '<h3>' + esc(integracao.rotulo) + '</h3>' + selo(integracao);
    cartao.appendChild(topo);

    if (integracao.resumo) {
      var resumo = document.createElement('p');
      resumo.className = 'integracao-resumo';
      resumo.textContent = integracao.resumo;
      cartao.appendChild(resumo);
    }

    if (integracao.naoImplementado) {
      var obra = document.createElement('p');
      obra.className = 'integracao-aviso';
      obra.textContent = integracao.naoImplementado;
      cartao.appendChild(obra);
      return cartao;
    }

    if (integracao.aviso) {
      var aviso = document.createElement('p');
      aviso.className = 'integracao-aviso';
      aviso.textContent = integracao.aviso;
      cartao.appendChild(aviso);
    }

    if (integracao.comoObter.length) {
      var passos = document.createElement('ol');
      passos.className = 'integracao-passos';
      integracao.comoObter.forEach(function (p) {
        var li = document.createElement('li');
        // Trecho entre dois espaços e fim de linha vira <code> quando parece
        // um endereço — é o Redirect URI, que precisa ser copiado exato.
        li.innerHTML = esc(p).replace(/(https?:\/\/\S+)/g, '<code>$1</code>');
        passos.appendChild(li);
      });
      cartao.appendChild(passos);
    }

    var campos = document.createElement('div');
    campos.className = 'integracao-campos';
    integracao.campos.forEach(function (campo) {
      campos.appendChild(montarCampoIntegracao(campo));
    });
    cartao.appendChild(campos);

    var acoes = document.createElement('div');
    acoes.className = 'integracao-acoes';

    var salvar = document.createElement('button');
    salvar.type = 'button';
    salvar.className = 'btn btn-primario btn-pequeno';
    salvar.textContent = 'Salvar';
    acoes.appendChild(salvar);

    var status = document.createElement('span');
    status.className = 'integracao-status';
    if (integracao.motivoIndisponivel) status.textContent = integracao.motivoIndisponivel;
    acoes.appendChild(status);

    salvar.addEventListener('click', function () {
      salvar.disabled = true;
      status.textContent = 'Salvando…';

      var valores = {};
      campos.querySelectorAll('[data-env]').forEach(function (grupo) {
        var entrada = grupo.querySelector('input, select');
        var env = grupo.dataset.env;
        if (grupo.dataset.secreto) {
          // Vazio e sem pedido de limpeza = não mexeu; não manda a chave.
          if (entrada.dataset.limpar === '1') valores[env] = null;
          else if (entrada.value.trim()) valores[env] = entrada.value.trim();
          return;
        }
        valores[env] = entrada.value.trim();
      });

      window.acesso
        .buscar('/api/integracoes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nome: integracao.nome, valores: valores }),
        })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, corpo: j }; }); })
        .then(function (res) {
          salvar.disabled = false;
          if (!res.ok || !res.corpo.ok) {
            status.textContent = res.corpo.erro || 'Falhou ao salvar.';
            toast('Não deu para salvar', true);
            return;
          }
          toast(res.corpo.aviso || 'Salvo e aplicado');
          // Recarrega o painel inteiro: o selo de status e o botão de
          // autorização do Spotify mudam junto com o que acabou de ser salvo.
          abrirIntegracoes();
        })
        .catch(function (e) {
          salvar.disabled = false;
          status.textContent = e.message;
        });
    });

    // Passo de OAuth (Spotify e Discord): um link normal, porque o fluxo é
    // uma ida ao serviço e uma volta — nada aqui é específico de um deles.
    if (integracao.autorizacao) {
      var faltando = integracao.autorizacao.precisaAntes.some(function (env) {
        return !integracao.campos.some(function (c) { return c.env === env && c.preenchido; });
      });

      var autorizar = document.createElement('a');
      autorizar.className = 'btn btn-pequeno ' + (faltando ? 'btn-fantasma' : 'btn-primario');
      autorizar.href = integracao.autorizacao.url;
      autorizar.target = '_blank';
      autorizar.rel = 'noopener';
      autorizar.textContent = integracao.autorizacao.pronto
        ? 'Reconectar a ' + integracao.rotulo
        : integracao.autorizacao.rotulo;
      if (faltando) {
        autorizar.removeAttribute('href');
        autorizar.title = 'Salve as credenciais acima primeiro.';
        autorizar.style.opacity = '0.5';
        autorizar.style.pointerEvents = 'none';
      }
      acoes.appendChild(autorizar);

      // Ter credencial gravada não é o mesmo que ter autorização válida: um
      // access token vencido continua sendo uma string no .env. Quando a
      // integração sabe que expirou, ela manda a ressalva em `observacao` — e
      // é ela que aparece, no lugar de um ✓ que estaria mentindo.
      if (integracao.autorizacao.observacao || integracao.autorizacao.pronto) {
        var ok = document.createElement('span');
        ok.className = 'integracao-status';
        ok.textContent = integracao.autorizacao.observacao || '✓ conta já autorizada';
        acoes.appendChild(ok);
      }
    }

    cartao.appendChild(acoes);
    return cartao;
  }

  function abrirIntegracoes() {
    el.overlayIntegracoes.classList.add('aberto');
    el.integracoesLista.innerHTML = '<p class="vazio">carregando…</p>';

    window.acesso
      .buscar('/api/integracoes')
      .then(function (r) { return r.json(); })
      .then(function (dados) {
        if (!dados.ok) throw new Error(dados.erro || 'resposta inesperada');
        el.integracoesLista.innerHTML = '';
        dados.integracoes.forEach(function (i) {
          el.integracoesLista.appendChild(montarIntegracao(i));
        });
      })
      .catch(function (e) {
        el.integracoesLista.innerHTML = '<p class="vazio">Não deu para carregar: ' + esc(e.message) + '</p>';
      });
  }

  el.btnIntegracoes.addEventListener('click', abrirIntegracoes);
  // Link direto: /config/#integracoes cai já com o painel aberto. É por onde
  // a tela de boas-vindas manda quem acabou de instalar.
  if (location.hash === '#integracoes') abrirIntegracoes();
  document.getElementById('integracoes-fechar').addEventListener('click', function () {
    el.overlayIntegracoes.classList.remove('aberto');
  });
  el.overlayIntegracoes.addEventListener('click', function (ev) {
    if (ev.target === el.overlayIntegracoes) el.overlayIntegracoes.classList.remove('aberto');
  });

  async function iniciar() {
    montarGradeEmoji();
    try {
      var [rCfg, rCat] = await Promise.all([
        window.acesso.buscar('/api/config'),
        window.acesso.buscar('/api/catalogo'),
      ]);

      if (rCfg.status === 401 || rCat.status === 401) {
        window.acesso.esquecer();
        window.acesso.pedirToken();
        return;
      }
      // O catálogo (e gravar o layout) só respondem no próprio PC, salvo se
      // CONFIG_REMOTO estiver ligado. Vindo daqui, quem abriu a tela está em
      // outro aparelho.
      if (rCat.status === 403) {
        var motivo = await rCat.json().catch(function () { return {}; });
        el.subtitulo.textContent = 'acesso bloqueado';
        el.erros.innerHTML =
          '<h3>Esta tela só abre no PC onde o servidor roda</h3><ul><li>' +
          esc(motivo.erro || 'Acesso remoto desativado.') + '</li></ul>';
        el.erros.hidden = false;
        return;
      }

      var cfg = await rCfg.json();
      var cat = await rCat.json();
      estado.config = cfg;
      estado.catalogo = cat.integracoes;
      estado.tipos = cat.tipos;
      estado.estilosEstado = cat.estilosEstado;
      estado.paginaIdx = cfg.paginas.length ? 0 : null;

      var totalBotoes = cfg.paginas.reduce(function (s, p) { return s + p.botoes.length; }, 0);
      var ativas = Object.keys(cat.integracoes).filter(function (n) { return cat.integracoes[n].disponivel; }).length;
      el.subtitulo.textContent =
        cfg.paginas.length + ' páginas · ' + totalBotoes + ' botões · ' +
        ativas + ' de ' + Object.keys(cat.integracoes).length + ' integrações disponíveis';

      renderTudo();
    } catch (erro) {
      // "Não deu para carregar: Failed to fetch" não ajuda ninguém. Se o
      // servidor caiu entre abrir a página e buscar os dados, diga isso.
      // (Esta tela não está no cache do service worker, ao contrário do
      // deck — aqui a janela para dar errado é menor, mas existe.)
      if (!(await window.acesso.servidorNoAr())) {
        window.acesso.mostrarOffline();
        return;
      }
      el.subtitulo.textContent = 'falha ao carregar';
      el.erros.innerHTML = '<h3>Não deu para carregar a configuração</h3><ul><li>' + esc(erro.message) + '</li></ul>';
      el.erros.hidden = false;
    }
  }

  // Só começa depois que houver token — sem ele, toda chamada volta 401.
  window.acesso.garantir(iniciar);
})();
