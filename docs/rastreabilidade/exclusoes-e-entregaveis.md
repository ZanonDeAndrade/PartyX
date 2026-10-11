# Exclusões de escopo e entregáveis

## 1. Itens excluídos (Anexo I, item 12; documentação, seção 16.1)

Tudo o que não está no Anexo I é evolução pela Cláusula 8ª: pedido formal, análise técnica e estimativa em até 5 dias úteis. Nenhum item abaixo entra nos fluxos principais.

**Verificação**: `Ausência confirmada` exige revisão do código, das telas e do banco. Em 01/10/2026 só o protótipo existe. Uma busca por termos em `src/` encontrou apenas avisos de que a função **não** existe (por exemplo, "não dá desconto e não calcula comissão") e o botão de compartilhamento iniciado pelo usuário. O backend ainda não foi iniciado.

| # | Item excluído | Observação para o desenvolvimento | Verificação no protótipo (01/10/2026) | Verificação no backend |
|---|---|---|---|---|
| 1 | Cupom de desconto | O cupom do promoter só rastreia a venda. O total nunca muda. | Ausência confirmada. Existe só o aviso "não oferece desconto". | Pendente (Prompts 09, 17) |
| 2 | Cálculo ou pagamento de comissão a promoters | O painel mostra quantidade e valor por promoter. O cálculo da comissão é do cliente. | Ausência confirmada. Existe só o aviso "sem cálculo de comissão". | Pendente (Prompt 17) |
| 3 | Virada automática de lotes | O cliente cria "1º lote", "2º lote" como tipos com períodos diferentes, ativando manualmente. | Ausência confirmada. Lotes são nomes de tipos. | Pendente (Prompt 07) |
| 4 | Cortesias e lista de convidados | Não criar ingresso de valor zero. | Ausência confirmada. | Pendente (Prompts 07, 09) |
| 5 | Transferência de titularidade | O nome no ingresso é o do comprador. | Ausência confirmada. | Pendente (Prompt 13) |
| 6 | Assentos numerados ou mapa | — | Ausência confirmada. | Pendente (Prompt 07) |
| 7 | Venda presencial, bilheteria, máquina de cartão, POS | — | Ausência confirmada. | Pendente |
| 8 | Aplicativo Android ou iOS | Tudo roda no navegador. | Confirmado: aplicação web. | Pendente (Prompt 02) |
| 9 | Notas fiscais e integrações fiscais | — | Ausência confirmada. | Pendente |
| 10 | SMS ou WhatsApp automático | Só e-mail. O compartilhamento por WhatsApp é iniciado pelo usuário. | Confirmado. Existe só o botão de compartilhar e o texto "sem SMS, WhatsApp automático ou marketing". | Pendente (Prompt 14) |
| 11 | Mais de um gateway | Um gateway apenas. | Confirmado: identidade neutra, um fluxo. | Pendente (Prompts 10, 11) |
| 12 | Cashless, consumação, produtos | — | Ausência confirmada. | Pendente |
| 13 | Atendimento aos compradores | A PartyX atende. O suporte técnico é só para a equipe. | Confirmado: contatos de atendimento são "a fornecer pela PartyX". | Pendente (Prompts 19, 30) |
| 14 | Domínio, logotipo, identidade visual completa, textos jurídicos | O cliente fornece. | Confirmado: logotipo original recebido e aplicado (10/10/2026); textos legais marcados "a fornecer". | Pendente (D-08, D-10, D-11) |
| 15 | Migração de outras plataformas | — | Ausência confirmada. | Pendente |

Outros itens que o plano de 30 prompts proíbe expressamente e que também devem ficar de fora: portal próprio de promoter, marketplace multi-organizador, validação offline com sincronização, portal de cobrança da mensalidade, chat ou plataforma de suporte, e gestão de infraestrutura dentro da interface de eventos.

## 2. Fluxo de pedido de mudança (seção 16.2)

1. O cliente envia o pedido por escrito.
2. A CONTRATADA confirma o recebimento e pede detalhes, se necessário.
3. Em até 5 dias úteis após informações suficientes: análise de viabilidade, impacto e estimativa de prazo (Cl. 8.2).
4. Se houver custo de terceiros (licença, API, infraestrutura), só contratar com autorização expressa (Cl. 8.3).
5. Valores e condições são formalizados por escrito; se alterarem o contrato, por termo aditivo (Cl. 21.3).
6. Se o pedido ocorrer durante o desenvolvimento, comunicar a prorrogação do prazo (Cl. 4.2 e 4.3).

## 3. Entregáveis do projeto (seção 18.2 e orçamento, item 05)

| # | Entregável | Prompt | Evidência esperada | Situação |
|---|---|---|---|---|
| 1 | Plataforma publicada em homologação e depois em produção | 04, 27, 29 | URL, versão, comunicação formal | Não iniciado |
| 2 | Integração com 1 gateway (Pix e cartão) | 10, 11, 12 | Testes em sandbox, CA-P1 a CA-P5 | Não iniciado |
| 3 | Perfis e permissões configurados com os usuários iniciais | 06, 28 | Teste da matriz de acesso, lista de usuários | Não iniciado |
| 4 | Roteiro de testes para o cliente | 26 | Documento versionado | Não iniciado |
| 5 | Orientação remota básica (cerca de 1 hora: painel, evento, promoters, relatórios, validação) | 27 | Registro da realização | Não iniciado |
| 6 | Guia de portaria e contingência (seção 15.2) | 18, 26 | Documento entregue | Não iniciado |
| 7 | Comunicação formal de entrega (início dos 10 dias) | 27 | Mensagem enviada, em `logs-contratuais.md` (L5) | Não iniciado |
| 8 | Aceite registrado | 27 | Data e forma (L7) | Não iniciado |
| 9 | Comunicação da data de publicação em produção (início dos 12 meses e da garantia) | 29 | Mensagem enviada (L5, L7) | Não iniciado |
| 10 | Monitoramento, backup e suporte em operação | 25, 30 | Alertas, restauração testada, runbooks | Não iniciado |
| 11 | Site responsivo com a identidade visual da PartyX | 08, 19 | CA-32, CA-33 | Protótipo existe; implementação real não iniciada |
| 12 | Emissão automática de ingressos com QR e PDF | 13 | CA-20 a CA-22 | Protótipo existe; implementação real não iniciada |
| 13 | Módulo de validação para os funcionários na entrada | 15 | CA-23 a CA-27 | Protótipo existe; implementação real não iniciada |
| 14 | Painel administrativo | 07, 16, 17, 18 | CA-07 a CA-11, CA-28 a CA-31 | Protótipo existe; implementação real não iniciada |
| 15 | Testes funcionais de compra, emissão e validação | 21 a 24 | Relatórios de teste | Não iniciado |

## 4. Roteiro de testes essenciais (seção 11.2) e quando executar

Os 20 itens do roteiro são executados em homologação no Prompt 24 e reexecutados no Prompt 26 (fechamento interno) e no Prompt 27 (homologação formal).

| # | Teste | CA ou requisito principal | Prompt dos testes especializados |
|---|---|---|---|
| 1 | Cadastro com CPF válido, inválido e repetido | CA-01, CA-02 | 05 |
| 2 | Login, logout e recuperação de senha | CA-04 | 05 |
| 3 | Evento com três tipos de ingresso e períodos diferentes | CA-07, CA-08 | 07 |
| 4 | Compra de 1 ingresso via Pix aprovado em sandbox | CA-P1 | 11, 24 |
| 5 | Compra de 3 ingressos via cartão aprovado em sandbox | CA-P1, CA-20 | 11, 13 |
| 6 | Cartão recusado: pedido não pago, estoque liberado | CA-P2 | 22 |
| 7 | Pix não pago até expirar: estoque liberado | CA-17 | 21 |
| 8 | Cupom de promoter válido e inválido | CA-19, RF-31 | 09, 17 |
| 9 | Compra acima do limite por compra | CA-15 | 09 |
| 10 | Última unidade disputada por dois compradores | CA-16 | 21 |
| 11 | Webhook recebido duas vezes | CA-P3 | 22 |
| 12 | E-mail de confirmação com link para os ingressos | RF-36 | 14 |
| 13 | Download do PDF e exibição no celular | CA-21 | 13 |
| 14 | Validação: válido, já utilizado, cancelado, outro evento, adulterado | CA-22 a CA-25 | 23 |
| 15 | Busca manual por nome e por código | RF-52 | 15, 23 |
| 16 | Contador de entradas e acompanhamento em tempo real | CA-27, RF-61 | 16 |
| 17 | Cancelamento pelo administrador e leitura posterior (vermelho) | CA-24 | 16, 23 |
| 18 | Relatórios: vendas, tipo, promoter, taxa mensal | CA-28 a CA-30 | 17 |
| 19 | Exportação de planilhas | CA-31 | 18 |
| 20 | Validador tentando acessar o painel administrativo | CA-05 | 06 |
