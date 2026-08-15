# Passo a passo das configurações que exigem você

Três coisas não dá para o programa fazer sozinho: instalar o Home Assistant,
criar o app do Discord e mandar o Deckly subir junto com o Windows. Cada uma
está aqui do começo ao fim.

Tempo total: cerca de 40 minutos, e cada uma é independente das outras.

---

## 1. Home Assistant no Raspberry Pi (~25 min)

Serve para controlar luzes, tomadas e cenas pelo deck — Positivo, Tuya, Hue,
o que for. Veja [casa-inteligente.md](casa-inteligente.md) para entender por
que ele e não uma integração por marca.

**Antes de começar:** o Pi precisa de Docker (se já roda Pi-hole ou Uptime
Kuma em container, já tem) e de ~1 GB de RAM livre.

### 1.1 Subir o container

Conecte no Pi por SSH e crie a pasta:

```bash
mkdir -p ~/homeassistant && cd ~/homeassistant
nano docker-compose.yml
```

Cole isto:

```yaml
services:
  homeassistant:
    container_name: homeassistant
    image: ghcr.io/home-assistant/home-assistant:stable
    volumes:
      - ./config:/config
      - /etc/localtime:/etc/localtime:ro
    restart: unless-stopped
    privileged: true
    # network_mode: host é praticamente obrigatório. A descoberta automática
    # de dispositivos usa mDNS e broadcast, que não atravessam a rede
    # isolada de um container — sem isto o HA simplesmente não acha nada.
    network_mode: host
```

Salve (`Ctrl+O`, Enter, `Ctrl+X`) e suba:

```bash
docker compose up -d
docker compose logs -f      # Ctrl+C quando aparecer que subiu
```

A primeira subida demora **alguns minutos** — ele baixa a imagem e monta o
banco. É normal parecer travado.

### 1.2 Criar a conta

No navegador do PC, abra `http://IP-DO-SEU-PI:8123`.

1. Crie o usuário administrador (fica só no Pi, não é conta na nuvem).
2. Informe nome da casa, cidade e fuso.
3. Na tela de dispositivos encontrados, pode pular — vamos adicionar a Tuya
   no passo seguinte.

### 1.3 Conectar seus dispositivos Tuya (Positivo, Intelbras, Multilaser…)

A integração **Tuya** do Home Assistant pede um **User Code**, que fica em
**Eu → Configurações → Conta e segurança → Código de usuário** — mas **só no
app Smart Life ou Tuya Smart**.

> ### ⚠️ Se você usa o app da marca (Positivo, Izy, Liv…), leia isto
>
> Esses apps são *white-labels* da Tuya: mesmo aplicativo, outra marca. O
> problema é que cada um costuma ter **seu próprio conjunto de contas**, e a
> tela do Código de usuário frequentemente nem existe neles.
>
> **Não é motivo para desistir** — o hardware é Tuya e funciona. Só é preciso
> descobrir por qual porta entrar.

Siga na ordem, do mais rápido para o mais trabalhoso. Pare no primeiro que
funcionar.

**Tentativa 1 — a conta pode ser a mesma (2 min).**
Instale o **Smart Life** e tente entrar com o **mesmo e-mail e senha** do app
da marca, país **Brasil**. Alguns OEMs compartilham o conjunto de contas com
a Tuya. Se entrar e os dispositivos estiverem lá, pegue o Código de usuário
e siga para o 1.4.

**Tentativa 2 — o código pode estar no próprio app (2 min).**
No app da marca, procure **Eu / Perfil → Configurações → Conta e segurança**.
Se houver **Código de usuário**, use esse — a integração aceita.

**Tentativa 3 — re-parear no Smart Life (~10 min, a que sempre funciona).**
O dispositivo **não pertence** ao app da marca; ele é Tuya e pode ser pareado
por qualquer app da família:

1. Instale o **Smart Life** e crie uma conta (país Brasil).
2. Resete o dispositivo: segure o botão até a luz **piscar rápido** (numa
   lâmpada, ligue e desligue no interruptor 3× seguidas).
3. No Smart Life, **+ → Adicionar dispositivo**, e siga o pareamento.
4. Repita para cada dispositivo.

O custo é passar a usar o Smart Life no lugar do app da marca. O ganho é uma
conta que o Home Assistant entende de verdade.

> **Sobre compartilhar em vez de re-parear:** dá para compartilhar o
> dispositivo da conta antiga para a nova, mas a integração Tuya lista o que
> a conta **possui**, e dispositivo compartilhado costuma não aparecer.
> Só tente se quiser economizar o re-pareamento, sem contar com isso.

**O que não vale a pena:** existe uma integração comunitária específica para
a Positivo (`rgsilva/homeassistant-positivo`), mas ela está **arquivada desde
2022**, sem manutenção, e cobre só tomada de 10A e controle infravermelho.

### 1.3.1 Adicionar a integração

Com o Código de usuário em mãos:

1. **Configurações → Dispositivos e serviços → Adicionar integração**.
2. Busque por **Tuya**.
3. Cole o **Código de usuário** (é sensível a maiúsculas) e confirme.
4. Aparece um **QR code**: escaneie com o app (Smart Life/Tuya Smart) e toque
   em **Confirmar login**.

Anote o nome de cada dispositivo — em **Ferramentas de desenvolvedor →
Estados** você vê o `entity_id` real (ex.: `light.luz_sala`).

### 1.4 Gerar o token para o Deckly

1. No Home Assistant, clique no **seu nome** (canto inferior esquerdo).
2. Aba **Segurança**, role até o fim.
3. Em **Tokens de acesso de longa duração**, clique em **Criar token**.
4. Nome: `Deckly`.
5. **Copie o token agora** — ele só aparece uma vez.

### 1.5 Ligar no Deckly

1. No PC, abra `http://127.0.0.1:3000/config/#integracoes`.
2. No cartão **Home Assistant**, preencha:
   - Endereço: `http://IP-DO-SEU-PI:8123`
   - Token: o que você acabou de copiar
3. **Salvar**. O selo deve virar **funcionando** em segundos.

### 1.6 Criar os botões

Na tela de configuração, adicione um botão na página Casa:

- Integração **Home Assistant**, ação **Ligar / desligar (alternar)**
- Entidade: `light.luz_sala` (o `entity_id` que você anotou)
- Em **Acender o botão conforme**, escolha `A Luz da Sala está ligada`

Pronto: apagar a luz pelo interruptor da parede apaga o botão no tablet.

> **Cuidado com o disco.** O banco de histórico cresce com o tempo. Se o
> espaço apertar, adicione ao `config/configuration.yaml`:
> ```yaml
> recorder:
>   purge_keep_days: 7
> ```

---

## 2. Discord no modo RPC (~10 min)

Faz os botões acenderem conforme o seu estado real de mudo e surdo, e lista
os canais de voz de verdade. Sem isso, o modo padrão age às cegas.

**Por que dá trabalho:** o Discord só libera esse canal para o dono de um app
registrado. É gratuito e leva minutos, mas não dá para pular.

### 2.1 Criar o app

1. Abra <https://discord.com/developers/applications> e faça login.
2. **New Application** → nome `Deckly` → aceite os termos → **Create**.
3. No menu lateral, vá em **OAuth2**.
4. Em **Redirects**, clique em **Add Redirect** e coloque:
   ```
   http://127.0.0.1
   ```
   **Salve** (botão que aparece no rodapé). O RPC não redireciona nada, mas o
   Discord recusa o app sem esse campo preenchido.
5. Ainda em OAuth2, copie o **Client ID**.
6. Em **Client Secret**, clique em **Reset Secret** e copie o valor.

### 2.2 Ligar no Deckly

1. Abra `http://127.0.0.1:3000/config/#integracoes`.
2. No cartão **Discord**, mude **Modo** para **RPC** e clique em **Salvar**.
   Os campos mudam.
3. Cole o **Client ID** e o **Client Secret**, e **Salvar** de novo.
4. **Com o aplicativo do Discord aberto** (o programa, não o site), clique em
   **Conectar ao Discord**.
5. Uma janela de autorização aparece **dentro do Discord**. Clique em
   **Autorizar**.

Pronto. Os botões de mudo e surdo passam a acender, e o seletor de canais
mostra seus servidores.

### 2.3 Se der errado

| Sintoma | Causa |
|---|---|
| "Não achei o Discord rodando" | O app do Discord está fechado, ou você está usando só a versão web (que não expõe o canal local) |
| Nada acontece ao clicar em Conectar | A janela de autorização pode ter aberto atrás de outra janela — procure no Discord |
| "Falha ao trocar o código por token" | Client Secret errado, ou o Redirect `http://127.0.0.1` não foi salvo |

O modo **teclado** continua disponível: se preferir voltar, é só mudar o
Modo e salvar.

---

## 3. Iniciar junto com o Windows (~2 min)

Assim o deck está pronto assim que o PC liga, sem janela nenhuma aparecendo.

1. Vá até a pasta do `deckly.exe`.
2. Clique nele com o **botão direito** → **Mostrar mais opções** (no Windows
   11) → **Criar atalho**.
3. Aperte **Windows + R**, digite `shell:startup` e Enter. Abre a pasta de
   inicialização.
4. **Arraste o atalho** para dentro dessa pasta.

Para testar sem reiniciar, dê dois cliques no atalho: ele deve subir em
segundo plano e sumir da tela.

**Para desfazer:** apague o atalho de `shell:startup`.

> O programa **não abre o navegador** nessas inicializações — só na primeira
> execução de todas. Se quiser que abra sempre, ponha `ABRIR_NAVEGADOR=sempre`
> no `dados/.env`.

---

## Depois de tudo

Confira em `http://127.0.0.1:3000/config/#integracoes`: os cartões de
**Home Assistant** e **Discord** devem estar com o selo verde de
**funcionando**.
