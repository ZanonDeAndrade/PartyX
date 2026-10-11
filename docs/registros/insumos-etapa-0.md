# Registro dos insumos da Etapa 0

Fonte: seção 4.1 da documentação de desenvolvimento (versão 1.0). Os itens 1 a 14 são necessários para concluir a Etapa 0 (seção 4.3). Os itens 15 a 19 podem chegar durante o desenvolvimento, mas o atraso deles suspende o prazo (Cl. 4.2) e deve ser comunicado por escrito.

O prazo de 20/10/2026 só corre depois da assinatura e do recebimento de todos os insumos. Cada pendência do cliente precisa de registro escrito com data.

**Como preencher**

- **Solicitado em**: data do envio da lista ao cliente (a documentação pede o envio no dia da assinatura, com resposta em 5 dias úteis).
- **Recebido em**: data do recebimento, com o canal (e-mail ou WhatsApp) e o nome do arquivo ou mensagem.
- **Validado em**: data da resposta do cliente a uma versão enviada para validação (item 3 de `logs-contratuais.md`).
- **Situação**: `Sem registro` | `Solicitado` | `Recebido` | `Recebido parcialmente` | `Provisório em uso` | `Dispensado por escrito`.

Em 10/10/2026 há registro de recebimento do logotipo PNG (item 2), mas sem canal de entrega documentado. `Sem registro` significa que o repositório não prova o recebimento, e não que o cliente deixou de enviar.

## Itens 1 a 14 (necessários para concluir a Etapa 0)

| # | Insumo | Base | Necessário para | Solicitado em | Recebido em | Validado em | Situação | Observação |
|---|---|---|---|---|---|---|---|---|
| 1 | Contrato assinado (Gov.br, ZapSign ou Clicksign) | 3.3, 21.5 | Início | — | — | — | Sem registro | O contrato e os Anexos I e II não estão no repositório. Só existem a documentação (30/09/2026) e o orçamento (30/09/2026, validade até 05/10/2026). Ver `divergencias.md`. |
| 2 | Logotipo em alta resolução (SVG ou PNG transparente) | 13.1.A | Layout | — | 10/10/2026 (canal não documentado) | — | Recebido (PNG) | `assets-originais/IMG_3404.PNG`, 3375×6000, branco sobre preto, em uso no site, e-mails, PDF e ícones. Falta o vetor (SVG), se houver. |
| 3 | Cores, fontes e demais materiais de identidade visual | 13.1.A | Layout | — | — | — | Provisório em uso | O protótipo usa preto, branco e roxo como proposta. Aprovação escrita pendente (CA-33). |
| 4 | Dados cadastrais e contatos da PartyX para rodapé e e-mails | 13.1.A | Site, e-mails | — | — | — | Sem registro | Rodapé e e-mails do protótipo mostram `a fornecer`. |
| 5 | Escolha do gateway de pagamento entre as opções indicadas pela CONTRATADA | Anexo I, 11 | Integração | — | — | — | Sem registro | Decisão D-01. A documentação sugere apresentar de 2 a 4 opções (seção 9.1). |
| 6 | Conta do gateway aberta em nome da CONTRATANTE, aprovada para Pix e cartão | 13.1.C, 14.4 | Integração | — | — | — | Sem registro | Risco alto de atraso (seção 17.1). Pedir abertura no dia da assinatura. |
| 7 | Credenciais do gateway: sandbox e produção (chaves de API, segredo de webhook) | 13.1.C | Integração | — | — | — | Sem registro | Nunca registrar o valor neste arquivo nem no Git. Registrar só a data e o canal seguro. |
| 8 | Domínio próprio comprado em nome da CONTRATANTE e acesso ao painel DNS | 13.1.G, 14.1 | Publicação | — | — | — | Sem registro | Decisão D-08. |
| 9 | Termos de Uso | 13.1.D | Cadastro | — | — | — | Sem registro | O protótipo mostra `conteúdo a fornecer`. Sem o texto, bloquear cadastro real. |
| 10 | Política de Privacidade | 13.1.D | Cadastro, LGPD | — | — | — | Sem registro | Idem. A PartyX é a controladora e define os textos. |
| 11 | Política de cancelamento, troca e reembolso | 13.1.D | Compra | — | — | — | Sem registro | Idem. |
| 12 | Regras de meia-entrada e benefícios legais a exibir | 13.1.D | Vitrine | — | — | — | Sem registro | Decisão D-06. O sistema não verifica documentos. |
| 13 | Dados de pelo menos 1 evento real ou de exemplo: nome, data, horário, local, descrição, atrações, classificação etária, banner | 13.1.B, 13.1.F | Vitrine, testes | — | — | — | Provisório em uso | O protótipo usa eventos fictícios (Noite Neon e outros), marcados como demonstração. |
| 14 | Tipos de ingresso por evento: nome, valor, quantidade, período de vendas | 13.1.B | Compra | — | — | — | Provisório em uso | Valores e quantidades do protótipo são fictícios. |

Critério de conclusão da Etapa 0: itens 1 a 14 recebidos. Em 10/10/2026: **1 de 14 com recebimento registrado** (item 2); 3 em uso provisório (3, 13 e 14). A Etapa 0 permanece aberta. O canal do recebimento do PNG e a aprovação visual ainda precisam de comprovação.

## Itens 15 a 19 (podem chegar durante o desenvolvimento)

| # | Insumo | Base | Necessário para | Solicitado em | Recebido em | Validado em | Situação | Observação |
|---|---|---|---|---|---|---|---|---|
| 15 | Limite de ingressos por compra | Anexo I, 3 | Compra | — | — | — | Sem registro | Decisão D-05. O protótipo usa 6 por compra como premissa. |
| 16 | Lista inicial de promoters: nome e código de cupom desejado | Anexo I, 6 | Promoters | — | — | — | Sem registro | O protótipo usa promoters fictícios. |
| 17 | Lista de usuários da equipe: nome, e-mail, perfil (administrador ou validador) | Anexo I, 8 | Permissões | — | — | — | Sem registro | O protótipo usa uma equipe fictícia. Não criar usuários reais sem a lista. |
| 18 | E-mail remetente desejado (ex.: ingressos@dominio) | Anexo I, 3 | E-mails | — | — | — | Sem registro | Decisão D-09. Depende do domínio (item 8) para SPF, DKIM e DMARC. |
| 19 | Situações de uso para testes (compra múltipla, esgotamento, cancelamento) | 13.1.F | Homologação | — | — | — | Sem registro | O roteiro de testes essenciais da seção 11.2 cobre o mínimo. |

## Efeito no prazo

| Medida | Valor |
|---|---|
| Data da assinatura | — (sem registro) |
| Data do último insumo dos itens 1 a 14 (início efetivo) | — |
| Marco contratual de entrega para homologação | 20/10/2026, só se a assinatura e todos os insumos chegarem antes |
| Cenário da documentação (seção 3) | Com assinatura e insumos até 03/10/2026: entrega em 20/10, testes até 30/10, publicação em 31/10. Proposta interna, não obrigação. |
