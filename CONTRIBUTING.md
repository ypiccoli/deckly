# Contribuindo com o Deckly

Obrigado pelo interesse. Este é um projeto pessoal mantido nas horas vagas,
então a régua é simples: **issue e pull request são bem-vindos, e ninguém
precisa pedir permissão para abrir**.

## Antes de tudo: a convenção que surpreende

**Código, comentários, identificadores, mensagens de commit e documentação
são em português.** Variável, função, chave de JSON, nome de arquivo — tudo.

```js
// Assim:
function trocarCena(parametros) { … }
this.estado = { cenaAtual: nome, gravando: false };

// Não assim:
function changeScene(params) { … }
this.state = { currentScene: name, recording: false };
```

Não é preferência estética: o Deckly é escrito para quem fala português, a
tela de configuração mostra rótulos que saem direto do código, e a
documentação toda segue o mesmo vocabulário. Um PR em inglês vai receber um
pedido de tradução, e isso é chato para os dois lados — melhor já começar
assim.

Exceção: nomes que vêm de fora (`EventEmitter`, `spawn`, `SetForegroundWindow`,
chaves de API do OBS/Spotify) ficam como são.

## Rodando o projeto

Precisa de **Node.js 20+**. No Windows, o jeito testado é rodar do WSL2 — as
integrações de mídia e atalhos chamam o `powershell.exe` pelo interop.

```bash
git clone https://github.com/ypiccoli/deckly.git
cd deckly
npm install
cp .env.example .env    # já vem comentado explicando cada variável
npm run dev             # nodemon, recarrega sozinho
```

O servidor sobe em `http://localhost:3000`. Abra `/bemvindo/` para ver o
token e o QR de pareamento.

Rodando do código-fonte, os arquivos ficam na raiz do repositório (não há
pasta `dados/`, que só existe no `.exe`). O seu deck pessoal vai para
`config/pages.config.json`, que é **gitignored** — o versionado é o
`pages.config.example.json`, que é o template inicial de quem baixa o
programa, e não um espelho do seu.

## O mapa do código

O [README](README.md) é a documentação técnica completa. Os atalhos mais
úteis:

| Quero… | Leia |
|--------|------|
| Entender o fluxo de dados de ponta a ponta | [README → Arquitetura](README.md#arquitetura) |
| Adicionar uma integração nova | [CLAUDE.md → Adicionando uma nova integração](CLAUDE.md#adicionando-uma-nova-integração) |
| Saber o que já dá para pôr num botão | [docs/acoes.md](docs/acoes.md) |
| Ver as rotas e suas travas de acesso | [docs/urls.md](docs/urls.md) |
| Publicar uma versão nova | [docs/checklist-release.md](docs/checklist-release.md) |
| Entender as travas de segurança | [SECURITY.md](SECURITY.md) |

Há também um `CLAUDE.md` na raiz: é o guia longo do projeto, com o histórico
de *por que* cada decisão delicada é do jeito que é (o travamento do interop
WSL→Windows, o COM do controle de volume, a conexão do OBS que pendura para
sempre, o service worker que precisa ser rede-primeiro). Se você for mexer
em algo e o código parecer estranho, provavelmente a explicação está lá.
Vale a leitura antes de "simplificar" alguma coisa.

## Duas regras que quebram silenciosamente

São as que mais dão retrabalho, porque nada acusa erro:

1. **Mexeu em ação de integração? Rode `npm run docs`.** O `docs/acoes.md` e
   dois blocos do guia do usuário são **gerados** a partir do getter
   `catalogo` de cada integração. Editar esses arquivos à mão não adianta —
   eles são reescritos.

2. **Ação nova precisa de entrada no `catalogo`.** Sem ela a ação funciona,
   mas fica invisível: não aparece no editor de botões nem na documentação.
   Se você adicionou uma ação e ela "não aparece na tela de configuração",
   é isso que está faltando — não é bug de UI.

## Testando

**Não existe suíte automatizada.** A validação é manual, e o CI cobre só o
básico (sintaxe, o template de configuração e `npm audit`).

O mínimo antes de abrir um PR:

```bash
# 1. Sintaxe de tudo
for f in $(git ls-files '*.js'); do node --check "$f" || echo "FALHOU: $f"; done

# 2. O template inicial continua válido (o mesmo validador da rota)
node -e "
const store=require('./server/config-store');
const integ={}; for (const n of ['media','obs','spotify','atalhos','discord','homeassistant'])
  integ[n]=require('./server/integrations/'+n);
const erros=store.validar(require('./config/pages.config.example.json'), integ);
console.log(erros.length ? erros : 'template válido'); process.exit(erros.length?1:0);"
```

E depois **suba o servidor e clique**. A
[docs/urls.md](docs/urls.md#testando-pelo-terminal) tem os comandos `curl`
para bater nos endpoints direto.

Se a mudança afeta a tela do deck, teste **no celular ou tablet** também. O
alvo do projeto é o toque, não o mouse — coisas como o arraste do editor de
layout se comportam de forma diferente no dedo.

Antes de gerar uma versão nova do `.exe`, o roteiro completo (travas de
acesso, config quebrado, executável em pasta limpa e o teste no tablet) está
em [docs/checklist-release.md](docs/checklist-release.md).

## Pull requests

- **Um assunto por PR.** Mais fácil de revisar, mais fácil de reverter.
- **Mensagem de commit no estilo do histórico**: uma frase em português
  descrevendo o efeito, sem prefixo convencional. Olhe o `git log` — é tipo
  *"Conserta os itens do seletor esmagados quando a lista não cabe na tela"*.
- **Descreva como testou.** Como não há testes automatizados, isso é o que
  dá confiança na revisão.
- Se mexeu no `.env.example` ou em rota, atualize a documentação junto
  (`docs/urls.md` é escrito à mão).

## Ideias e bugs

Abra uma [issue](https://github.com/ypiccoli/deckly/issues). Para bug, o que
mais ajuda:

- Windows 10 ou 11, e se está rodando o `.exe` ou o código-fonte.
- O que você esperava e o que aconteceu.
- O log: rodando o `.exe` em segundo plano ele fica em `dados/deckly.log`;
  do código-fonte, sai no console.

**Falha de segurança não vai em issue pública** — veja o
[SECURITY.md](SECURITY.md).

## Licença

Ao contribuir, você concorda que a sua contribuição será distribuída sob a
[GPL-3.0](LICENSE), como o resto do projeto.
