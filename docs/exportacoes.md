# Exportações (CSV)

Implementado em 03/10/2026 (Prompt 18): RF-63 e CA-31. Código em `server/src/exports/` (`csv.ts`, `service.ts`), `server/src/api/exports.ts` e os botões "Exportar CSV" nas telas. **Sem migração.**

## Rotas (`/api/admin/exports`, só administrador)

| Rota                                          | Conteúdo                                   |
| --------------------------------------------- | ------------------------------------------ |
| `GET /orders.csv?eventId&status&from&to&q`    | Pedidos, com os filtros da tela de pedidos |
| `GET /events/:id/tickets.csv?status&typeId&q` | Ingressos do evento                        |
| `GET /events/:id/buyers.csv?q`                | Compradores do evento                      |
| `GET /sales.csv?eventId&typeId&from&to`       | Relatório de vendas                        |
| `GET /promoters.csv?eventId&from&to&metric`   | Ranking de promoters                       |
| `GET /fee.csv?month=AAAA-MM`                  | Taxa mensal, ingresso a ingresso           |
| `GET /events/:id/contingency.csv` e `.pdf`    | Lista de portaria (ver `contingencia.md`)  |

Os dados vêm **das mesmas consultas das telas**, com os mesmos filtros; o rodapé traz totais, filtros aplicados e hora de geração, e um teste confere esses totais contra a tela.

## Formato (D-57)

- **Codificação:** UTF-8 **com BOM**. Sem o BOM o Excel abre com acentos quebrados.
- **Separador:** ponto e vírgula (`;`), fim de linha CRLF, aspas duplicadas quando há `;`, aspas ou quebra de linha.
- **Números:** vírgula decimal (`160,00`), sem símbolo de moeda; datas no fuso do evento (`dd/mm/aaaa hh:mm`).
- **Injeção de fórmulas:** texto que começa (depois de espaços) com `=`, `+`, `-`, `@`, `|`, tabulação ou caractere de controle recebe um apóstrofo na frente, em todo campo de texto. Nome, e-mail ou evento digitados por terceiros não executam nada ao abrir.
- A primeira célula nunca é "ID" (o Excel trataria o arquivo como SYLK).
- No LibreOffice/Excel em inglês, escolha o separador ";" ao importar.

## Segurança (D-58)

Só administrador (visitante 401, cliente e validador 403). O arquivo é **gerado na hora**: nada é guardado e não existe URL permanente. Resposta `Cache-Control: private, no-store`, `Content-Disposition: attachment`, `nosniff`. Limite de 20 exportações por minuto por pessoa e de 50.000 linhas (acima, a API recusa e pede filtros). **Auditoria** (`exportacao.*`): quem, o quê, quando, formato, número de linhas e filtros; o texto da busca não é gravado (pode ser CPF ou e-mail). CPF sai sempre mascarado.

## Não verificado

Abertura em Excel e LibreOffice reais por uma pessoa (os testes leem o CSV com um leitor próprio) e o limite com eventos reais de grande porte.
