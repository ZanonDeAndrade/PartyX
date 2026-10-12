# Checkout e contrato do gateway

Implementado em 01/10/2026 (Prompt 10): RF-28, RF-29, RF-32, RF-33 (telas) e RF-34, RF-37 (parte). Desde 11/10/2026 o gateway real é o **Mercado Pago** (D-01), pela API de Orders: adaptador, credenciais, CSP e provas no ambiente de teste em **`pagamento-mercadopago.md`**. O adaptador fictício continua só para o ambiente local e os testes.

> Esta etapa não aprova pagamento. A confirmação por webhook e a reconsulta vieram no Prompt 12 (`webhook-e-conciliacao.md`); a emissão dos ingressos é do Prompt 13.

## Pendências do cliente sobre o gateway

| Item | Situação | Registro |
|---|---|---|
| Qual gateway (único) | **Mercado Pago** (11/10/2026) | D-01 |
| Conta aprovada para Pix e cartão, em nome da PartyX, com credenciais e webhook | Credenciais de teste e de produção recebidas; produção no Secret Manager; webhook configurado no painel | D-01, insumo 5 |
| Parcelamento no cartão | Pendente; hoje só à vista (422 `parcelamento_indisponivel` acima de 1; Brick sem opção de parcelas) | D-02 |
| Taxas e prazo de recebimento | Pendente, entre cliente e gateway | D-04 |
| Compatibilidade entre a expiração do Pix e a reserva | **Resolvida: reserva de 30 minutos** (mínimo do Pix no Mercado Pago). O Pix vence com a reserva, dentro dos limites do provedor (`pixExpiry`); com reserva menor que o mínimo, o Pix não é oferecido | D-03 |

## Contrato (`server/src/payments/gateway.ts`)

Nenhum tipo de SDK aparece fora do adaptador. O domínio fala em `domain/payment.ts`.

- `createPix`, `createCard`, `getPayment`, `verifyNotification`, `capabilities` (provedor, modo do cartão, limites de expiração do Pix, parcelas máximas) e `accountId`.
- **Estados normalizados:** `pendente`, `aprovado`, `recusado`, `expirado`, `cancelado`, `estornado`, `contestado`. `intentFor` traduz cada um em uma ação (`aguardar`, `confirmar`, `recusar`, `expirar`, `estornar`, `contestar`). Só `aprovado` leva a confirmar.
- **Valor** sempre em centavos inteiros (`isValidAmount`: inteiro positivo até R$ 1.000.000). Moeda BRL.
- **Idempotência:** toda criação leva `order:<id>:<método>`. Repetir (clique duplo, queda de rede) devolve a mesma cobrança.
- **Conferência antes de aprovar** (`checkSnapshotAgainstOrder`, para o Prompt 12): referência do pedido, valor, moeda, conta da PartyX e forma de pagamento. Sem conta esperada configurada, **falha** em vez de aprovar às cegas.
- **Erros:** `GatewayError` (rede, tempo esgotado: pode repetir) e `GatewayRejectedError` (recusa definitiva).
- **Destinatário:** a conta do gateway é a da PartyX. A CONTRATADA não recebe repasse.

## Cartão sem dado sensível no servidor

Ou o cartão é pago na **página hospedada** do gateway (`cardMode: 'hosted'`), ou o navegador gera um **token** com o SDK oficial e só o token chega (`'token'`). Número, validade e CVV nunca chegam ao servidor:

- A API recusa (422 `dado_de_cartao_nao_aceito`) qualquer corpo com campos como `number`, `cvv`, `expiry`, `holder...` ou com **número de cartão colado em qualquer campo** (13 a 19 dígitos que passam no algoritmo de Luhn). A recusa vem antes de qualquer outra coisa e **não repete o valor** na resposta.
- Nada disso chega ao gateway nem ao log (teste captura stdout e stderr).
- Parcelamento: só à vista até o cliente e o gateway aprovarem.

## Fluxo de criação (`server/src/orders/payment.ts`)

`POST /api/orders/:id/payment` com `{ "method": "pix" | "cartao" }`:

1. Valida o pedido (do comprador, pendente, reserva ativa com pelo menos 30 s).
2. Marca a forma escolhida (curta transação).
3. **Chama o gateway fora de qualquer transação.** Valor, referência e prazo vêm do pedido no banco.
4. Confere que a cobrança devolvida bate com o pedido (referência e valor); senão desfaz e responde 503.
5. Guarda o id da cobrança.

Falha de rede ou recusa desfazem a escolha: o comprador pode repetir ou trocar. A resposta nunca traz o id do gateway nem a conta. `GET /api/orders/:id/payment` consulta o gateway e devolve o Pix de novo ao recarregar a página; **consultar nunca aprova nada**.

Erros: 409 `pedido_nao_pendente`, `reserva_expirada`, `metodo_ja_escolhido` (D-36); 422 `parcelamento_indisponivel`, `dado_de_cartao_nao_aceito`, `pagamento_nao_criado`; 503 `pagamento_indisponivel` (sem gateway), `gateway_indisponivel`.

## O navegador nunca emite ingresso

Não existe rota de comprador para confirmar pagamento, emitir ingresso ou receber retorno de gateway. O teste varre todas as rotas registradas fora do painel. Campos como `status: 'pago'` no corpo são ignorados. Voltar do cartão hospedado leva à página do pedido, que só **mostra** o estado.

## Adaptador fictício (`payments/mockGateway.ts`)

- Sem rede, sem dinheiro. Guarda cobranças em memória; tem `simulate` (mudar estado, falhar a próxima chamada, adulterar valor ou conta, assinar webhook) usado só em teste.
- **Não há segredo escrito no código:** a chave de assinatura dos webhooks fictícios é aleatória a cada instância.
- **Bloqueio em duas camadas:** `loadConfig` recusa `PAYMENT_GATEWAY=mock` fora de `APP_ENV=local` (o servidor não sobe) e `createGateway` também recusa. Sem a variável: local usa o fictício, homologação e produção ficam **sem gateway** (503 `pagamento_indisponivel`).
- Consequência: em homologação não há pagamento até o sandbox do gateway escolhido (D-37).
- Para ver o fluxo até "pago" no ambiente local, existe `POST /api/dev/mock-gateway/:pedido/:estado` (só com `APP_ENV=local` e `PAYMENT_GATEWAY=mock`), que entrega ao servidor uma notificação assinada pelo mesmo caminho do webhook (Prompt 12). A tela do pedido mostra o simulador só nesse ambiente.

## Telas (`src/site/`)

Seleção de tipo e quantidade na página do evento (limite vindo do servidor, que o impõe), **entrar** e **criar conta** com retorno ao carrinho (RF-29; o caminho de retorno só aceita endereço interno), revisão do pedido com cupom do promoter, pedido com escolha Pix ou cartão, QR Code (gerado no navegador a partir do copia e cola quando o gateway não manda a imagem), botão de copiar, **contador pelo servidor** e estado atualizado a cada 4 s. O carrinho fica só na aba (`sessionStorage`) e não guarda preço. Páginas de Termos e Privacidade existem como aviso de texto pendente (conteúdo do cliente, Prompt 19). O token CSRF fica só em memória.

## O que foi verificado

- 48 testes novos (332 de servidor passam contra PostgreSQL real). Mutações: sem a recusa de dado de cartão, 1 teste falha; sem a conferência da cobrança, 2; sem desfazer a escolha, 4.
- **Navegador real** (Chromium a 360 e 1280 px; WebKit a 360 px), servidor local com o fictício: selecionar, limite de 6 respeitado, ir ao login com retorno, criar conta (aceite obrigatório), revisão com total do servidor, cupom inválido sem derrubar o resumo, criar o pedido, escolher Pix, ver QR e copia e cola, recarregar mantendo o Pix, contador andando (10:00 → 09:57), cancelar. Sem rolagem horizontal.

## O que **não** foi verificado

- Qualquer gateway real, sandbox, página hospedada e SDK de token (Prompt 11, depende da escolha do cliente).
- O botão "Cartão" no ambiente local leva a um endereço fictício que não abre.
- Estado "pago" na tela e webhook (Prompt 12). A tela do pedido trata `pago`, `nao_concluido`, `expirado` e `pago_sem_estoque`, mas só `pendente` e `expirado` foram exercitados no navegador.
- Aparelhos reais e acessibilidade com leitor de tela.
- Recuperação de senha pela tela (falta o e-mail, Prompt 14).

## Decisões abertas

D-01 a D-04 (cliente), D-36 (trocar a forma de pagamento) e D-37 (fictício só no local).
