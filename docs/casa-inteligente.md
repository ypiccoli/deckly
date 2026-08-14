# Casa inteligente: o que dá para integrar

Estado atual: **nenhuma integração de casa inteligente está funcionando.**
Existe um esqueleto de Philips Hue (`server/integrations/hue/`) com as
chamadas HTTP ainda por escrever. Este documento existe para a próxima
tentativa começar do lugar certo, em vez de escolher a marca errada.

## A conclusão que importa

Quase todo dispositivo inteligente barato vendido no Brasil — **Positivo**,
Intelbras, Multilaser, Elgin, Geonav, Philco, RGB genéricas de marketplace —
é **Tuya por baixo**. As marcas licenciam a plataforma da Tuya e trocam o
logo do aplicativo; é por isso que quase todos pedem para você instalar um
app parecido, ou aceitam o **Smart Life** direto.

Isso muda a estratégia: em vez de uma integração por marca, **uma integração
Tuya cobre a maior parte do mercado brasileiro de uma vez**. A Philips Hue é
a exceção que justifica código próprio (protocolo próprio, bridge local, API
documentada e estável).

## Caminhos possíveis, do mais direto ao mais completo

### 1. Tuya Cloud (recomendado para começar)

Você cria uma conta no **Tuya IoT Platform**, vincula o app onde seus
dispositivos já estão (Smart Life ou o da marca) e recebe um par de chaves.
O servidor então chama a nuvem da Tuya.

- **Prós:** funciona com qualquer dispositivo Tuya sem descobrir chave local;
  API documentada; não depende de o dispositivo estar na mesma rede.
- **Contras:** depende da internet e da nuvem chinesa; latência de alguns
  décimos de segundo; a conta de desenvolvedor tem um período de teste que
  precisa ser renovado (gratuito, mas exige lembrar).

### 2. Tuya local (tinytuya / LocalTuya)

Fala direto com o dispositivo na LAN, sem nuvem.

- **Prós:** rápido (milissegundos), funciona sem internet, sem conta de
  desenvolvedor.
- **Contras:** exige extrair a **local key** de cada dispositivo, o que hoje
  passa justamente por... a nuvem da Tuya. E a chave muda se o dispositivo
  for reconfigurado.

### 3. Home Assistant como ponte (a melhor a longo prazo)

Se você já roda ou pretende rodar Home Assistant, ele resolve o problema
inteiro: tem integração para Tuya, Hue, Sonoff, Shelly, Xiaomi, Zigbee,
Z-Wave e centenas de outras, e expõe **uma API REST única** para tudo.

O stream deck falaria só com o Home Assistant: uma integração aqui, e todo
dispositivo que o HA suportar passa a funcionar — inclusive marcas futuras,
sem código novo. Você mencionou pegar dispositivos de outras marcas depois;
este é o caminho que não precisa ser refeito a cada marca nova.

- **Prós:** uma integração cobre tudo; local e rápido; já tem o catálogo de
  dispositivos pronto e mantido por outra gente.
- **Contras:** exige ter um Home Assistant rodando (um Raspberry Pi, um
  contêiner, uma VM).

## Alexa: por que não

Não existe API local da Alexa para um programa de terceiros mandar comandos.
As opções reais são:

- **Bibliotecas não oficiais** (`alexa-remote2` e parentes), que se autenticam
  com **cookies da sua conta Amazon**. Funcionam, mas quebram sempre que a
  Amazon mexe no login, e exigem guardar credenciais da sua conta.
- **Alexa Skills**, que rodam na nuvem da Amazon e exigiriam expor um
  endpoint HTTPS público — o oposto do que este projeto é.

E há um detalhe que dispensa o esforço: **a Alexa é um intermediário**. Ela
manda para a nuvem da Tuya, que manda para o dispositivo. Falar direto com a
Tuya (ou com o Home Assistant) é mais rápido, mais confiável e mais simples.

A Alexa continua útil para o que ela faz bem — comando de voz, rotinas — em
paralelo ao deck, sem uma coisa depender da outra.

## Catálogo: o que cada marca pede

| Marca / linha | Protocolo real | Como integrar |
|---|---|---|
| Positivo Casa Inteligente | Tuya | Tuya Cloud ou local |
| Intelbras Izy | Tuya | Tuya Cloud ou local |
| Multilaser Liv | Tuya | Tuya Cloud ou local |
| Elgin, Geonav, Philco, RGB de marketplace | Tuya (quase sempre) | Tuya Cloud ou local |
| Philips Hue | Hue próprio | Bridge local, CLIP API v2 (é o esqueleto que já existe aqui) |
| Sonoff (eWeLink) | eWeLink | API própria, ou trocar o firmware por Tasmota |
| Shelly | HTTP local | O mais fácil de todos: um `GET` numa URL do próprio aparelho |
| Xiaomi / Mi Home | Miio | Biblioteca `miio`, exige token do aparelho |
| Tapo / Kasa (TP-Link) | Próprio | Biblioteca dedicada |
| Qualquer um dos acima | — | Home Assistant cobre todos |

Se a dúvida for "meu dispositivo é Tuya?": se ele funciona no app **Smart
Life**, é.

## Recomendação para este projeto

1. **Curto prazo:** integração **Tuya Cloud**. Cobre os Positivo que você já
   tem e a maioria do que você comprar depois, sem exigir servidor extra.
2. **Longo prazo:** integração **Home Assistant**, que vira a resposta única
   para qualquer marca — e aí a Tuya vira só mais uma coisa que o HA resolve.
3. **Hue:** manter o esqueleto. Não vale implementar sem ter uma bridge para
   testar, e hoje isso está declarado como "em construção" na tela de
   Integrações, honestamente.

Qualquer uma delas entra como uma integração normal: uma pasta em
`server/integrations/`, com `acoes`, `catalogo` e `configuracao` — sem tocar
no resto do app. Veja "Adicionando uma nova integração" no `CLAUDE.md`.
