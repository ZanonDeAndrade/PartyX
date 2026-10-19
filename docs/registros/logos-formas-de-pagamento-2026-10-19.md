# Logos nas formas de pagamento (19/10/2026)

Pedido do responsável (Arthur), 19/10/2026: o bloco "Formas de pagamento" da página do evento passa a mostrar as logos em dois cartões
brancos arredondados, um por linha (bandeiras e "Cartão de crédito ou débito"; Pix), e os botões de forma de pagamento do checkout usam as
mesmas logos. Sem "em até Nx" enquanto o parcelamento for à vista (D-02).

## Consulta ao Mercado Pago (só leitura)

`GET /v1/payment_methods` com a credencial de produção da conta da PartyX, em 19/10/2026 14:09 UTC (token nunca impresso). Formas ativas:

| Tipo | Id | Nome |
|---|---|---|
| Crédito | visa, master, elo, amex, mp_card | Visa, Mastercard, Elo, American Express, MP Card |
| Débito | debelo | Elo Débito |
| Pré-pago | visa, master, elo | Visa, Mastercard e Elo Prepaid |
| Transferência | pix | Pix |
| Boleto | bolbradesco | Boleto |
| Saldo | account_money | Saldo no Mercado Pago |

Hipercard não aparece na conta. No débito, só a Elo Débito aparece na lista (o Brick do cartão decide na hora o que aceita).

## Decisões do responsável

- **Bandeiras:** Visa, Mastercard, Elo e American Express (MP Card fora).
- **Margens:** os SVG da API vêm com margem própria diferente em cada um (Mastercard e American Express ficavam bem menores na mesma
  altura). Só a margem vazia foi cortada: o `viewBox` passou a ser a área desenhada e `width`/`height` fixos saíram da tag; desenho e
  cores intactos.
- **Pix:** a imagem da API é um PNG de 40 × 18 px (borrado a 24 px, e só baixa com cabeçalho de navegador). Por decisão do responsável,
  vale o arquivo oficial do Banco Central (`https://www.bcb.gov.br/content/estabilidadefinanceira/piximg/logo_pix.png`, 540 × 190 px),
  usando **só o símbolo**, recortado sem redimensionar nem recolorir, pelas regras do Manual de Uso da Marca Pix 1.6 (14/05/2025):
  - a marca completa (símbolo + logotipo) tem redução máxima de 145 px de comprimento no digital, o que não cabe numa linha de 24 px;
  - o símbolo sozinho é permitido em plataformas de comércio eletrônico, em verde Pix ou preto, com redução máxima de 24 px: por isso
    o símbolo fica em 24 px também no celular (as bandeiras ficam em 20 px no celular);
  - é proibido escrever a palavra "Pix" ao lado do símbolo em outra tipografia: o texto ao lado é "Pagamento instantâneo" (página do
    evento e botão do checkout), e o nome "Pix" fica no `alt` do símbolo, que também abre o nome do botão para leitor de tela.

## Como ficou

| Parte | O que faz |
|---|---|
| Arquivos | `src/assets/pagamento/` (`visa.svg`, `mastercard.svg`, `elo.svg`, `amex.svg`, `pix-simbolo.png`). O build os emite em `/assets` com hash no nome (`vite.config.ts`, `assetsInlineLimit` exclui a pasta: nunca viram `data:`); o servidor já manda `public, max-age=31536000, immutable` em `/assets` |
| Configuração | `src/site/paymentBrands.ts`: lista das bandeiras (nome, arquivo, proporção), data da consulta (`PAYMENT_LOGOS_CHECKED_AT`), símbolo Pix e o texto do bloco montado da lista (`acceptedText`). Nada é consultado no Mercado Pago em tempo de página |
| Página do evento | `src/site/pages.tsx` e `src/site/paymentLogos.tsx`: dois cartões brancos (fundo branco fixo, também no tema escuro, para as cores oficiais), logos à esquerda com 8 px entre elas, texto à direita (quebra em linhas na própria coluna quando falta espaço). Texto alternativo do bloco: "Aceitamos Visa, Mastercard, Elo, American Express e Pix." (só para leitor de tela); cada logo com o nome no `alt` |
| Checkout | `src/site/checkoutPages.tsx`: as mesmas logos, na mesma altura, no alto de cada botão, sobre um fundo branco próprio |
| Alturas | Bandeiras: 24 px no computador, 20 px no celular (até 599 px). Símbolo Pix: 24 px sempre |
| CSP | Sem mudança: as imagens são do próprio domínio (`img-src 'self'`) |

## Testes e capturas

- `src/site/paymentBrands.test.ts`: bandeiras, data da consulta, texto do bloco e texto do Pix sem a palavra "Pix".
- `e2e/formas-pagamento.spec.ts` (`npm run e2e:formas-pagamento`, 6 cenários a 360, 390 e 1280 px, tema claro, evento com cor de
  destaque): dois cartões brancos, textos, alt de cada logo, texto do bloco, alturas, 8 px entre as logos, texto à direita das logos,
  arquivos do próprio domínio em `/assets` com hash e cache longo, sem rolagem lateral; checkout com as mesmas logos nos dois botões.
- Capturas: `docs/evidencias/formas-pagamento-2026-10-19/` (dados fictícios; PNG fora do Git pela regra do `.gitignore`, ficam na pasta local).
- Os seletores e2e do botão de cartão passaram a procurar "Cartão de crédito ou débito" em qualquer posição do nome (as bandeiras vêm
  antes no botão): `e2e/support/payments.ts`, `e2e/roteiro-11-2.spec.ts`, `auditoria/e2e/04-pagamento.ui.spec.ts`.

## Fontes

- Mercado Pago, `GET /v1/payment_methods` (conta de produção da PartyX, 19/10/2026 14:09 UTC).
- Banco Central do Brasil, [Manual de Uso da Marca Pix 1.6](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/I_manual_uso_marca_pix.pdf)
  (redução máxima, símbolo Pix, cores) e o arquivo da marca em `bcb.gov.br/content/estabilidadefinanceira/piximg/logo_pix.png`.

## Publicação

Publicado em 19/10/2026 15:02 UTC na revisão `partyx-00052-saf` (`release-2026-10-19d`), com OK do responsável ("coloque em produção e faça
commit"). Registro: `publicacao-producao-2026-10-19.md`.
