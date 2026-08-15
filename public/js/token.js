// Token de acesso no lado do navegador — usado pelo deck e pela tela de
// configuração.
//
// De onde vem, nesta ordem:
//   1. ?token=... na URL (o link/QR de pareamento que o servidor mostra ao
//      subir). Depois de guardado, some da barra de endereço para não ficar
//      exposto em histórico e capturas de tela.
//   2. localStorage, das próximas vezes.
//   3. A pessoa digita, na tela de pareamento que aparece quando falta.
//
// Expõe window.acesso com:
//   .token             valor atual (ou null)
//   .buscar(u, o)      fetch já com o header do token
//   .paraWs(url)       acrescenta o token na query (WebSocket não aceita header)
//   .pedirToken()      abre a tela de pareamento
//   .servidorNoAr()    promessa true/false — o servidor respondeu?
//   .mostrarOffline()  abre a tela de "servidor fora do ar", com religa sozinho

(function () {
  'use strict';

  var CHAVE = 'deckly.token';
  // O projeto se chamava "Stream Deck Web" e guardava o token com outro
  // nome. Sem migrar, todo aparelho já pareado voltaria à tela de token
  // depois da atualização — e o QR está no PC, não na mão de quem está com
  // o tablet.
  var CHAVE_ANTIGA = 'streamdeck.token';

  function lerDaUrl() {
    var params = new URLSearchParams(location.search);
    var t = params.get('token');
    if (!t) return null;
    try {
      localStorage.setItem(CHAVE, t);
    } catch (e) {
      // Navegador em modo privado pode recusar; segue só em memória.
    }
    // Tira o token da URL preservando o resto.
    params.delete('token');
    var limpa = location.pathname + (params.toString() ? '?' + params : '') + location.hash;
    history.replaceState(null, '', limpa);
    return t;
  }

  function lerGuardado() {
    try {
      var atual = localStorage.getItem(CHAVE);
      if (atual) return atual;

      var antigo = localStorage.getItem(CHAVE_ANTIGA);
      if (antigo) {
        localStorage.setItem(CHAVE, antigo);
        localStorage.removeItem(CHAVE_ANTIGA);
        return antigo;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  var acesso = {
    token: lerDaUrl() || lerGuardado(),
  };

  acesso.guardar = function (t) {
    acesso.token = t;
    try {
      localStorage.setItem(CHAVE, t);
    } catch (e) { /* modo privado */ }
  };

  acesso.esquecer = function () {
    acesso.token = null;
    try {
      localStorage.removeItem(CHAVE);
    } catch (e) { /* modo privado */ }
  };

  acesso.paraWs = function (url) {
    return url + (url.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(acesso.token || '');
  };

  acesso.buscar = function (url, opcoes) {
    opcoes = opcoes || {};
    var headers = Object.assign({}, opcoes.headers || {});
    if (acesso.token) headers['X-Token'] = acesso.token;
    return fetch(url, Object.assign({}, opcoes, { headers: headers }));
  };

  /* ---------------- tela de pareamento ---------------- */

  // Estilo injetado aqui, junto do markup, pelo mesmo motivo: as duas
  // páginas usam esta tela e nenhuma delas deveria carregar CSS da outra.
  function injetarEstilo() {
    if (document.getElementById('estilo-pareamento')) return;
    var estilo = document.createElement('style');
    estilo.id = 'estilo-pareamento';
    estilo.textContent = [
      '.pareamento{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;',
      'justify-content:center;padding:24px;background:#0f1115;',
      "font-family:'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;color:#eef0f4}",
      '.pareamento-cartao{background:#1b1e27;border:1px solid #2a2e3a;border-radius:18px;',
      'padding:28px;width:min(420px,100%);display:flex;flex-direction:column;gap:14px;',
      'box-shadow:0 8px 30px rgba(0,0,0,.45)}',
      '.pareamento-cartao h2{margin:0;font-size:1.15rem}',
      '.pareamento-cartao p{margin:0;font-size:.88rem;color:#8a8f9c;line-height:1.5}',
      '.pareamento-cartao input{font:inherit;font-size:1.15rem;letter-spacing:.12em;',
      'text-align:center;text-transform:uppercase;padding:13px;border-radius:12px;',
      'border:1px solid #2a2e3a;background:#0f1115;color:#eef0f4}',
      '.pareamento-cartao input:focus{outline:none;border-color:#00d1b2}',
      '.pareamento-cartao button{font:inherit;font-size:.95rem;font-weight:700;padding:13px;',
      'border-radius:999px;border:none;cursor:pointer;color:#fff;',
      'background:linear-gradient(135deg,#6c5ce7,#00d1b2)}',
      '.pareamento-cartao button:disabled{opacity:.5;cursor:default}',
      '.pareamento-erro{color:#ff4d5e!important;font-size:.85rem!important}',
      // Tela de servidor offline: mesmo cartão, com um cabeçalho de aviso.
      '.pareamento-titulo{display:flex;align-items:center;gap:10px}',
      '.pareamento-titulo .icone{font-size:1.5rem;line-height:1}',
      '.pareamento-lista{margin:0;padding-left:18px;font-size:.86rem;color:#8a8f9c;line-height:1.6}',
      '.pareamento-lista code{font-family:ui-monospace,Consolas,monospace;color:#eef0f4}',
      '.pareamento-tentando{font-size:.8rem!important;color:#6b7180!important;text-align:center}',
    ].join('');
    document.head.appendChild(estilo);
  }

  /* ---------------- servidor fora do ar ---------------- */

  // Qualquer resposta HTTP serve como prova de vida — inclusive um 401, que
  // significa "estou aqui, mas seu token não vale". O que distingue o
  // servidor desligado é a promessa REJEITAR (falha de rede).
  //
  // Precisa ser uma URL sob /api: o service worker cacheia o casco do app
  // (veja public/sw.js) e responderia do cache para /, /index.html e afins —
  // era exatamente por isso que o deck parecia vivo com o servidor desligado.
  acesso.servidorNoAr = function () {
    return fetch('/api/config', { cache: 'no-store' }).then(
      function () { return true; },
      function () { return false; },
    );
  };

  var INTERVALO_RETENTATIVA_MS = 4000;

  // Enquanto esta tela está aberta, fica testando sozinha: quando o servidor
  // subir, o deck volta sem ninguém tocar no tablet. É o caso comum — o
  // tablet fica na base e o PC é quem liga e desliga.
  acesso.mostrarOffline = function (aoVoltar) {
    if (document.querySelector('.pareamento')) return;
    injetarEstilo();

    var fundo = document.createElement('div');
    fundo.className = 'pareamento';
    fundo.innerHTML =
      '<div class="pareamento-cartao">' +
      '<div class="pareamento-titulo"><span class="icone">🔌</span>' +
      '<h2>Servidor não encontrado</h2></div>' +
      '<p>Esta tela abriu do cache do aparelho, mas o Deckly não está ' +
      'respondendo. Os botões não funcionariam.</p>' +
      '<ul class="pareamento-lista">' +
      '<li>O programa está rodando no PC? Abra o <code>deckly.exe</code>.</li>' +
      '<li>O PC está ligado e na mesma rede Wi-Fi que este aparelho?</li>' +
      '</ul>' +
      '<button type="button" id="offline-tentar">Tentar de novo</button>' +
      '<p class="pareamento-tentando" id="offline-status">Tentando sozinho a cada 4 segundos…</p>' +
      '</div>';
    document.body.appendChild(fundo);

    var botao = fundo.querySelector('#offline-tentar');
    var status = fundo.querySelector('#offline-status');
    var timer = null;

    function voltar() {
      clearInterval(timer);
      fundo.remove();
      // Recarregar é mais confiável do que retomar um boot pela metade: o
      // servidor pode ter subido com outro token ou outro layout.
      if (aoVoltar) aoVoltar();
      else location.reload();
    }

    function tentar(manual) {
      if (manual) {
        botao.disabled = true;
        status.textContent = 'Procurando o servidor…';
      }
      acesso.servidorNoAr().then(function (vivo) {
        if (vivo) {
          status.textContent = 'Servidor encontrado! Recarregando…';
          voltar();
          return;
        }
        if (manual) {
          botao.disabled = false;
          status.textContent = 'Ainda sem resposta. Tentando sozinho a cada 4 segundos…';
        }
      });
    }

    botao.addEventListener('click', function () { tentar(true); });
    timer = setInterval(function () { tentar(false); }, INTERVALO_RETENTATIVA_MS);
  };

  // Criada por JS em vez de ficar no HTML porque as duas páginas (deck e
  // configuração) precisam dela e nenhuma deveria duplicar esse markup.
  function montarTela(aoConfirmar) {
    injetarEstilo();
    var fundo = document.createElement('div');
    fundo.className = 'pareamento';
    fundo.innerHTML =
      '<div class="pareamento-cartao">' +
      '<h2>Parear este aparelho</h2>' +
      '<p>Digite o token que aparece no terminal onde o servidor está rodando. ' +
      'Você só precisa fazer isso uma vez neste aparelho.</p>' +
      '<input type="text" id="pareamento-token" placeholder="XXXX-XXXX-XXXX-XXXX" ' +
      'autocomplete="off" autocapitalize="characters" spellcheck="false" />' +
      '<p class="pareamento-erro" id="pareamento-erro" hidden></p>' +
      '<button type="button" id="pareamento-ok">Conectar</button>' +
      '</div>';
    document.body.appendChild(fundo);

    var input = fundo.querySelector('#pareamento-token');
    var erro = fundo.querySelector('#pareamento-erro');
    var botao = fundo.querySelector('#pareamento-ok');

    function tentar() {
      var valor = input.value.trim();
      if (!valor) return;
      botao.disabled = true;
      erro.hidden = true;

      fetch('/api/config', { headers: { 'X-Token': valor } })
        .then(function (r) {
          if (r.ok) {
            acesso.guardar(valor);
            fundo.remove();
            aoConfirmar();
            return;
          }
          erro.textContent = r.status === 401
            ? 'Token não confere. Confira no terminal do servidor.'
            : 'Não deu para validar (erro ' + r.status + ').';
          erro.hidden = false;
          botao.disabled = false;
        })
        .catch(function () {
          erro.textContent = 'Sem conexão com o servidor.';
          erro.hidden = false;
          botao.disabled = false;
        });
    }

    botao.addEventListener('click', tentar);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') tentar();
    });
    input.focus();
  }

  acesso.pedirToken = function (aoConfirmar) {
    if (document.querySelector('.pareamento')) return;
    montarTela(aoConfirmar || function () { location.reload(); });
  };

  // Garante que há token antes de a página tentar qualquer chamada. Se
  // faltar, mostra o pareamento e só chama `aoTerToken` depois.
  acesso.garantir = function (aoTerToken) {
    if (acesso.token) {
      aoTerToken();
      return;
    }
    // Sem token guardado, pedir o token só faz sentido se houver servidor
    // para validá-lo. Com o servidor desligado, o casco do app ainda abre
    // pelo cache do service worker — e sem esta checagem a pessoa digitaria
    // um token correto para receber "sem conexão" de volta.
    acesso.servidorNoAr().then(function (vivo) {
      if (vivo) acesso.pedirToken(aoTerToken);
      else acesso.mostrarOffline();
    });
  };

  window.acesso = acesso;
})();
