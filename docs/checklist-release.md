# Checklist de release

O que conferir antes de publicar uma versão nova do `deckly.exe`. Existe
porque este projeto **não tem suíte de testes automatizados**: o CI cobre
sintaxe, template e documentação, e o resto é olho humano. A parte que
importa de verdade é a última — o teste no tablet e no `.exe`, que é o único
caminho que exercita o PowerShell em modo nativo, o segundo plano e o toque.

## 1. Antes de gerar o executável

```bash
npm audit --omit=dev --audit-level=high   # o CI roda isto também
npm run docs                              # não pode gerar diff em docs/
git status --short                        # árvore limpa
```

- [ ] `npm run docs` não mudou nada (se mudou, commite o resultado)
- [ ] Nenhum segredo novo no que vai para o Git:
      `git ls-files | xargs grep -nEi '192\.168\.|C:\\Users\\[A-Za-z]'`
      só deve trazer exemplos genéricos (`SEU_USUARIO`, `192.168.0.x`)
- [ ] Prints de `docs/img/` continuam vindo de uma instância descartável, não
      do deck pessoal (veja a seção "Documentação gerada" do `CLAUDE.md`)
- [ ] `npm run docs:pdf` se o guia mudou

## 2. Validar sem subir o servidor

```bash
node -e "
const store=require('./server/config-store');
const integ={}; for (const n of ['media','obs','spotify','atalhos','discord','homeassistant'])
  integ[n]=require('./server/integrations/'+n);
const erros=store.validar(require('./config/pages.config.example.json'), integ);
console.log(erros.length ? erros : 'template válido'); process.exit(0);"
```

- [ ] Template inicial válido

## 3. Travas de acesso (servidor de código-fonte, porta separada)

```bash
PORT=3555 ABRIR_NAVEGADOR=nunca node server/index.js &
export TOKEN=$(node -e "console.log(require('./config/token.json').token)")

# 401 nas dez primeiras, 429 daí em diante.
# ATENÇÃO: tem que vir de OUTRO aparelho (troque 127.0.0.1 pelo IP da LAN e
# rode do tablet ou de outra máquina). O próprio PC é isento do bloqueio de
# propósito — de 127.0.0.1 isto devolve 401 doze vezes, e está certo.
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code} " -H "X-Token: ERRA-DODE-VEZM-XXXX" \
    http://<IP-DA-LAN>:3555/api/config
done; echo

# nome DNS é recusado (403), IP passa
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: qualquer.exemplo.com:3555" \
  http://127.0.0.1:3555/api/bemvindo
```

- [ ] Bloqueio entra no 11º erro **vindo de outro aparelho**, com `Retry-After`
- [ ] Do próprio PC nada bloqueia: a tela de configuração e o botão
      "Encerrar servidor" continuam respondendo
- [ ] Requisição **sem** token nenhum continua devolvendo 401 e **não** conta
      para o bloqueio
- [ ] `Host:` com nome DNS devolve 403

## 4. Config quebrado não derruba

```bash
cp config/pages.config.json /tmp/config-bom.json
cp /tmp/config-bom.json config/pages.config.backup.json
echo '{ isto não é json' > config/pages.config.json
node -e "const s=require('./server/config-store'); console.log(s.caminhoEmUso)"
cp /tmp/config-bom.json config/pages.config.json
```

- [ ] Sobe pelo backup, avisando no log
- [ ] O arquivo quebrado **continua lá** (não foi sobrescrito)

## 5. O executável, numa pasta limpa

```bash
npm run build           # gera build/deckly.exe
```

Copie **só o `.exe`** para uma pasta vazia no Windows (nunca por cima da
instalação em uso — o `dados/pages.config.json` de lá é o deck de verdade).

- [ ] Primeira execução cria `dados/`, gera token e abre a tela de
      boas-vindas sozinha
- [ ] O QR e o endereço mostrados usam o IP da LAN
- [ ] Fechar a janela preta **não** derruba o servidor (segundo plano)
- [ ] Dois cliques de novo abrem a tela da instância existente, sem subir
      uma segunda cópia
- [ ] `deckly.log` existe e não contém credencial em texto puro
- [ ] Botão "Encerrar servidor" desliga

## 6. No tablet de verdade

- [ ] Pareia escaneando o QR
- [ ] Instala na tela inicial (PWA) e abre em tela cheia
- [ ] Mídia, volume e o seletor de saída de áudio funcionam
- [ ] Seletor de janelas lista e foca
- [ ] Modo de edição: arrastar, redimensionar e salvar — e a mudança
      aparece no PC sem recarregar
- [ ] Bloquear e desbloquear a tela: o WebSocket reconecta sozinho
- [ ] Integrações configuradas (OBS, Spotify, Discord, Home Assistant)
      respondem e os botões acendem

## 7. Publicar

- [ ] Commit e push com o CI verde nas duas versões de Node
- [ ] Tag e release nova, com o `.exe` recém-gerado anexado
- [ ] Apagar a pasta de teste do item 5 (ela tem token e, se você configurou
      alguma integração, credenciais)
