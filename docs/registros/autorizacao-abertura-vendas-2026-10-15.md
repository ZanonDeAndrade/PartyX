# Autorização para abrir as vendas em produção (15/10/2026)

Registro pedido pelo responsável (Arthur), nesta data, ao pedir a abertura das vendas.

| Campo | Registro |
|---|---|
| Quem autorizou | Bernardo Peixoto Fortes Bittencourt (PartyX, titular), segundo o responsável |
| Quando | 15/10/2026 |
| O quê | Abertura das vendas em produção (`SALES_OPEN=true`), sem divulgação ainda |
| Ciência registrada | O Bernardo autorizou **ciente de que o CNPJ da PartyX está inapto na Receita Federal** |
| Compra de teste | Por decisão do Bernardo, a compra real de teste (1 ingresso por Pix, feita pelo responsável com a conta de cliente dele) **não terá estorno** |
| Prova | O responsável guarda o print da autorização **fora do repositório**; nada dele vai para o Git |

## Estado da abertura

Nas conferências de 16/10/2026, 00:10 UTC (21:10 de 15/10 em São Paulo), a abertura **ficou parada**: o segredo `smtp-url` não tem nenhuma versão. Sem SMTP, nenhum e-mail sai, nem a confirmação da compra. A regra do pedido é "sem isso, não abrimos". O resultado completo das conferências está no relatório da sessão e entra no registro da publicação, quando houver.

O checklist de abertura (`checklist-abertura-de-vendas.md`) continua valendo, item por item.

**Atualização de 17/10/2026:** o `smtp-url` ganhou a versão 1 (chave só de envio, restrita a `partyx.com.br`), e o e-mail de teste pela candidata `partyx-00039-faz` chegou na caixa de entrada com SPF, DKIM e DMARC em PASS (checklist 2.4 a 2.6). O SMTP passa a valer para o público na virada de uma revisão que monte o segredo. Os 15 e-mails de cadastro que falharam desde 14/10 ficam como estão, sem reenvio (decisão do responsável).
