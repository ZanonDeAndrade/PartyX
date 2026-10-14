# Ingresso, QR Code e PDF

Implementado em 01/10/2026 (Prompt 13): RF-38 a RF-43 e CA-20 a CA-22. Código em `server/src/tickets/` (`issuer.ts`, `service.ts`, `pdf.ts`), `server/src/domain/ticketCode.ts`, `server/src/api/tickets.ts` e `src/site/ticketPages.tsx`. **Sem migração**: a tabela `tickets` já tinha tudo.

> A emissão foi provada com o **gateway fictício**: o pagamento aprovado vem do adaptador de teste, não de um gateway real (Prompt 11, bloqueado). O que é do ingresso em si (código, QR, PDF, isolamento) não depende do gateway.

## Emissão (RF-38, CA-20)

`issueForOrder` roda **dentro da transação da confirmação do pagamento**, com o pedido e os tipos trancados: ou o pedido vira "pago" **e** os ingressos existem, ou nada disso acontece (testado: se a emissão falha depois de inserir, tudo volta, o pedido continua pendente e a reentrega do gateway fecha). Um ingresso por **unidade**; o titular é o nome do comprador, em todas.

- **Idempotente:** `(item, unidade)` é único e o `INSERT` ignora o que já existe. Notificação repetida, simultânea, rotina de recuperação ou segunda chamada na mesma transação: sempre os mesmos 3 ingressos, com os mesmos códigos. Uma colisão de código (improvável) gera código novo e tenta de novo (até 5 vezes).
- **Recuperação:** `backfillTickets` emite o que falta em pedidos **pagos** sem ingresso (por exemplo, pagos antes de o emissor existir). Roda na rotina do Scheduler e por `npm run tickets:backfill`. Nunca emite para estornado, contestado ou "pago sem estoque".
- **Sem CPF** no ingresso, no QR ou no PDF (D-07). **Sem transferência** de titularidade: não existe rota que altere o titular.

## Códigos e QR (RF-39, CA-22) — `domain/ticketCode.ts`

| Item | Como é |
|---|---|
| `code` (segredo) | 144 bits aleatórios (18 bytes, base64url, 24 caracteres). Nunca aparece em lista nem em PDF |
| `shortCode` | `PX-XXXX-XXXX`, 40 bits, sem I, O, 0 e 1. Para o comprador ditar e a portaria buscar. **Não é credencial** |
| Conteúdo do QR | `PX1.<versão da chave>.<evento>.<código>.<assinatura>`, 86 caracteres |
| Assinatura | HMAC-SHA256 truncado a 128 bits sobre prefixo, versão, **evento** e código |

- **Qualquer caractere alterado, em qualquer posição, invalida** (testado em todas as posições com 7 substituições cada; e variações do último caractere da assinatura, que no base64 tem bits sobrando, porque a comparação é do **texto** da assinatura, em tempo constante).
- Um QR de um evento **não vale em outro**: o evento está na assinatura. O código curto e o código secreto sozinhos não valem como QR.
- Mesmo com a chave certa, um código que não existe no banco é "desconhecido": ninguém inventa ingresso.
- `lookupByQr` (usado na portaria, Prompt 15) confere assinatura, depois busca pelo código e compara o evento do ingresso com o evento assinado.

### Chaves e rotação

`QR_HMAC_KEYS="1:<chave>,2:<chave>"` (base64url, 32+ bytes cada) e `QR_HMAC_CURRENT`. Obrigatórias fora do ambiente local (a configuração não sobe sem elas); no local a chave é derivada do segredo local de sessão, para os ingressos de desenvolvimento sobreviverem a reinícios. Cada ingresso guarda a versão com que foi assinado (`qr_key_version`).

**Rotacionar:** acrescente a versão nova, troque `QR_HMAC_CURRENT`, publique. Os ingressos já emitidos continuam valendo (testado). **Nunca remova uma versão enquanto houver ingresso emitido com ela**: eles passariam a dar "versão desconhecida" (também testado, para documentar o efeito). Gerar chave: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.

## API (todas exigem login e perfil `cliente`; de outro comprador, 404; respostas `private, no-store`)

| Rota | O que faz |
|---|---|
| `GET /api/tickets` | Meus ingressos (RF-42). **Sem o código secreto e sem o QR** |
| `GET /api/tickets/:id` | Detalhe com o conteúdo do QR. Ingresso cancelado: `qrPayload: null` |
| `GET /api/tickets/:id/pdf` | PDF de um ingresso |
| `GET /api/orders/:id/tickets` e `/tickets/pdf` | Ingressos do pedido e PDF com todos (uma página por ingresso) |
| `GET /api/orders` | Histórico de compras |

## PDF (RF-41, CA-21) — `tickets/pdf.ts`

Evento, data, horário, local e endereço, classificação, tipo, nome do comprador, **código de identificação** e o **QR desenhado em vetor** (nítido na tela e na impressão, com a zona de silêncio de 4 módulos). Ingresso cancelado: marca CANCELADO e **sem QR**. Verificado rasterizando o PDF e decodificando a imagem como um leitor faria: o QR lido é exatamente o do ingresso, e o servidor o reconhece como válido. Também legível a 60 dpi.

**Limite (D-43):** as fontes padrão do PDF cobrem Latin-1 (os acentos do português saem certos). Desde 14/10/2026 o emoji sai do texto impresso (antes virava "?"); outros alfabetos continuam virando "?". Suportar tudo exige embutir uma fonte Unicode.

**Texto longo (14/10/2026):** nome do evento, local e endereço, tipo e comprador no limite (120, 120 + 200, 60 e 120 caracteres, mesmo sem espaço) quebram em linhas e nunca são cortados. A fonte diminui quando o texto passa de 2 ou 3 linhas, e o QR só encolhe se ainda faltar lugar, com mínimo de 200 pt. Texto comum sai igual ao de antes. O mesmo vale para o PDF da autorização de menor e para a lista de contingência.

## Telas (`src/site/ticketPages.tsx`)

- **Meus ingressos** (`/meus-ingressos`), por evento e pedido, com o estado de cada um e PDF do pedido; **Minhas compras** (`/minhas-compras`).
- **Ingresso** (`/ingressos/:id`): QR, código curto, dados, "Abrir em tela cheia" e "Baixar PDF". Cancelado: aviso e sem QR; utilizado: data e hora.
- **Tela cheia** (`/ingressos/:id/tela-cheia`, RF-43): fundo branco, QR do maior tamanho que cabe, código em letras grandes, tela mantida acesa (Wake Lock, quando o navegador deixa). **A página não controla o brilho** (o navegador não permite): ela orienta o comprador a aumentar. A tela de pedido pago leva direto a Meus ingressos.

## O que foi verificado

- 45 testes novos (427 passam, contra PostgreSQL real): unitários de domínio (códigos, QR, rotação, chaves, todas as posições), configuração das chaves e integração (emissão de 3 unidades, dois tipos, reprocessamento, atomicidade, recuperação, isolamento, perfil, histórico, cancelado, PDF lido por decodificador, rotação, sem transferência). **Mutações:** sem o filtro do dono, 1 teste falha; com o evento fora da assinatura, 7; sem a idempotência da emissão, 2.
- **Navegador real** (Chromium a 360 px, servidor local, banco descartável): compra de 3 ingressos, simulador "aprovado", 3 ingressos listados, **QRs lidos da própria tela por um decodificador: 3 diferentes e iguais aos do servidor**; tela cheia com QR de 328 px, também lido; PDF baixado com o nome certo e conteúdo conferido; outro comprador recebe "Ingresso não encontrado" e 404 no PDF. Sem rolagem horizontal.

## O que **não** foi verificado

- Leitura em **aparelhos reais**, brilho e luz ambiente (RF-43) e leitores reais da portaria (Prompt 15 e 23). A decodificação foi por software.
- Safari/iPhone: Wake Lock e download do PDF não foram exercitados no WebKit.
- Os testes de PDF dependem do `pdftoppm` e `pdftotext` (poppler); sem eles, esses testes são pulados. Verifique se a CI os tem.
- Envio dos ingressos por e-mail (Prompt 14). **Apple Wallet e Google Wallet** não fazem parte do escopo.
- Desempenho do PDF com pedido grande (o limite por compra é 6, então são poucas páginas).

## Decisões abertas

D-07 (CPF: aplicado "sem CPF"), D-42 (formato do QR e chaves), D-43 (fonte do PDF), D-44 (cancelado no histórico).
