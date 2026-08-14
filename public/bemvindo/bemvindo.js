// Preenche a tela de boas-vindas com os dados de GET /api/bemvindo.
//
// Essa rota não exige token (é onde o token é revelado) e só responde no
// próprio PC — se alguém abrir isto de outro aparelho, cai no aviso de
// acesso bloqueado.

(function () {
  'use strict';

  var pagina = document.getElementById('pagina');

  function erro(titulo, detalhe) {
    pagina.innerHTML =
      '<div class="erro"><strong>' + titulo + '</strong>' +
      (detalhe ? '<p>' + detalhe + '</p>' : '') + '</div>';
  }

  // O rodapé muda conforme o servidor esteja preso a uma janela de console ou
  // rodando destacado — nos dois casos a pergunta é a mesma ("e para
  // desligar?"), mas a resposta é diferente.
  function montarRodape(dados) {
    var texto = document.getElementById('rodape-texto');
    if (texto) {
      texto.innerHTML = dados.segundoPlano
        ? 'O servidor está rodando em segundo plano — pode fechar a janela preta ' +
          'sem derrubar o deck. Ele fica no ar até você encerrar aqui ou desligar o PC.' +
          (dados.arquivoLog ? '<br />Log: <code>' + dados.arquivoLog + '</code>' : '')
        : 'Enquanto a janela do servidor estiver aberta, o deck funciona. ' +
          'Fechá-la derruba o servidor.';
    }

    var botao = document.getElementById('encerrar');
    if (!botao) return;
    botao.addEventListener('click', function () {
      if (!window.confirm('Encerrar o Stream Deck Web? O deck para de responder no tablet.')) return;
      botao.disabled = true;
      botao.textContent = 'Encerrando…';
      // O token vai junto: sem ele qualquer página aberta no navegador
      // conseguiria derrubar o servidor com um POST.
      fetch('/api/bemvindo/encerrar', {
        method: 'POST',
        headers: { 'X-Token': dados.token },
      })
        .then(function () {
          botao.textContent = 'Servidor encerrado';
        })
        .catch(function () {
          // O processo pode morrer antes de a resposta chegar — o que, aqui,
          // significa que deu certo.
          botao.textContent = 'Servidor encerrado';
        });
    });
  }

  fetch('/api/bemvindo')
    .then(function (r) {
      if (r.status === 403) {
        erro(
          'Esta tela só abre no PC onde o servidor roda',
          'Ela mostra o token de acesso, por isso não responde pela rede.',
        );
        return null;
      }
      if (!r.ok) {
        erro('Não deu para carregar as informações', 'O servidor respondeu ' + r.status + '.');
        return null;
      }
      return r.json();
    })
    .then(function (dados) {
      if (!dados) return;

      pagina.innerHTML = '';
      pagina.appendChild(document.getElementById('modelo').content.cloneNode(true));

      document.getElementById('sub').textContent =
        'Servidor na porta ' + dados.porta + ' · token vindo de ' + dados.origemToken;

      document.getElementById('token').textContent = dados.token;
      document.getElementById('url-bemvindo').textContent = dados.urlLocal + '/bemvindo/';
      document.getElementById('link-deck').href = '/';
      document.getElementById('link-config').href = '/config/';

      if (dados.qr) {
        document.getElementById('qr').innerHTML = dados.qr;
      } else {
        document.querySelector('.cartao-parear').innerHTML =
          '<h2>1. Parear o tablet</h2><p class="dica">Não consegui descobrir o ' +
          'endereço deste PC na rede. Veja o IP com <strong>ipconfig</strong> e ' +
          'acesse <strong>http://SEU-IP:' + dados.porta + '</strong> no tablet, ' +
          'usando o token:</p><p class="token">' + dados.token + '</p>';
      }

      var elUrlLan = document.getElementById('url-lan');
      if (elUrlLan) elUrlLan.textContent = dados.urlLan || '(endereço não descoberto)';

      montarRodape(dados);

      var botao = document.getElementById('copiar');
      if (botao) {
        botao.addEventListener('click', function () {
          navigator.clipboard.writeText(dados.token).then(
            function () {
              botao.textContent = 'Copiado!';
              botao.classList.add('copiado');
              setTimeout(function () {
                botao.textContent = 'Copiar token';
                botao.classList.remove('copiado');
              }, 2000);
            },
            function () {
              botao.textContent = 'Selecione e copie manualmente';
            },
          );
        });
      }
    })
    .catch(function (e) {
      erro('Sem conexão com o servidor', e.message);
    });
})();
