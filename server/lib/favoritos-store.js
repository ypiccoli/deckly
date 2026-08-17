// Favoritos dos seletores: quais opções de uma lista sobem para o topo.
//
// É genérico de propósito — a chave é a URL da fonte (ex.: "/discord/canais"),
// então qualquer botão do tipo "lista" pode ganhar favoritos sem código novo
// aqui. Guarda só ids: nome e ícone continuam vindo da listagem ao vivo, e
// um favorito que não existe mais simplesmente não aparece.
//
// Mora em config/favoritos.json (na pasta de dados, ao lado do .exe quando
// empacotado), fora do pages.config.json: favorito é preferência de uso, não
// layout, e não deveria sujar o arquivo que a tela de configuração reescreve.

const fs = require('fs');
const path = require('path');
const caminhos = require('./caminhos');

const CAMINHO = path.join(caminhos.config, 'favoritos.json');

let cache = null;

function ler() {
  if (cache) return cache;
  try {
    const dados = JSON.parse(fs.readFileSync(CAMINHO, 'utf8'));
    // Aceita só o formato esperado: { fonte: [id, id, ...] }.
    cache = {};
    for (const [fonte, ids] of Object.entries(dados || {})) {
      if (Array.isArray(ids)) cache[fonte] = ids.map(String);
    }
  } catch {
    // Arquivo ausente na primeira execução, ou corrompido: começa vazio em
    // vez de derrubar o servidor por causa de uma preferência.
    cache = {};
  }
  return cache;
}

// rename é atômico no mesmo sistema de arquivos, então uma queda no meio da
// escrita não deixa um arquivo pela metade — mesmo padrão do config-store.
function gravar() {
  const temporario = `${CAMINHO}.tmp`;
  fs.mkdirSync(path.dirname(CAMINHO), { recursive: true });
  fs.writeFileSync(temporario, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  fs.renameSync(temporario, CAMINHO);
}

function listar(fonte) {
  return [...(ler()[fonte] || [])];
}

function ehFavorito(fonte, id) {
  return listar(fonte).includes(String(id));
}

// Devolve o novo estado, para a UI não precisar recarregar a lista inteira.
function definir(fonte, id, favorito) {
  if (!fonte) throw new Error('Parâmetro "fonte" é obrigatório.');
  if (id == null || id === '') throw new Error('Parâmetro "id" é obrigatório.');

  const dados = ler();
  const atual = dados[fonte] || [];
  const chave = String(id);
  const jaEsta = atual.includes(chave);
  const alvo = favorito == null ? !jaEsta : Boolean(favorito);

  if (alvo === jaEsta) return alvo;

  // Novo favorito entra no fim: a ordem em que a pessoa favoritou é a ordem
  // em que ela espera reencontrar.
  dados[fonte] = alvo ? [...atual, chave] : atual.filter((x) => x !== chave);
  if (!dados[fonte].length) delete dados[fonte];

  gravar();
  return alvo;
}

// Marca `favorito` em cada opção e sobe as favoritas para o topo, na ordem
// em que foram favoritadas. O resto mantém a ordem original da listagem.
function aplicar(fonte, opcoes) {
  const ordem = listar(fonte);
  if (!ordem.length) return opcoes.map((o) => ({ ...o, favorito: false }));

  const marcadas = opcoes.map((o) => ({ ...o, favorito: ordem.includes(String(o.id)) }));
  const favoritas = ordem
    .map((id) => marcadas.find((o) => String(o.id) === id))
    .filter(Boolean);
  const restantes = marcadas.filter((o) => !o.favorito);

  return [...favoritas, ...restantes];
}

module.exports = { listar, ehFavorito, definir, aplicar, CAMINHO };
