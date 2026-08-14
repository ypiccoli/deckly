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
//   .token          valor atual (ou null)
//   .buscar(u, o)   fetch já com o header do token
//   .paraWs(url)    acrescenta o token na query (WebSocket não aceita header)
//   .pedirToken()   abre a tela de pareamento

(function () {
  'use strict';

  var CHAVE = 'streamdeck.token';

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
      return localStorage.getItem(CHAVE);
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
    ].join('');
    document.head.appendChild(estilo);
  }

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
    acesso.pedirToken(aoTerToken);
  };

  window.acesso = acesso;
})();
