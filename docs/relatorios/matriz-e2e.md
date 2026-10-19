# Matriz dos cenários Playwright da auditoria (19/10/2026)

Consolidação de quatro rodadas: completa nos 9 projetos (3 trabalhadores); duas só do WebKit com 1 trabalhador (a segunda só com os cenários que falharam, 1 repetição); e uma final, em Chromium e Firefox, dos dois cenários corrigidos no roteiro (preço esperado e diálogo nativo do promoter). Para cada cenário e projeto vale o resultado da última rodada em que ele rodou. "ok (2ª)" = passou na segunda tentativa.

### Cenários de interface (9 projetos: navegador e largura)

| Arquivo | Cenário | Chr-1280 | Chr-390 | Chr-360 | WK-1280 | WK-390 | WK-360 | FF-1280 | FF-390 | FF-360 |
|---|---|---|---|---|---|---|---|---|---|---|
| 00-infra | a vitrine abre, lista os eventos da semente e não tem rolagem horizontal | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 01-conta | cadastro: CPF inválido e e-mail repetido são recusados com mensagem no campo | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 01-conta | cadastro: maior de idade, 17 e 16 anos aceitos; menor de 16 recusado | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 01-conta | login com senha errada, login certo, logout e volta protegida | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 01-conta | não existe na interface: excluir a própria conta nem baixar os próprios dados (LGPD) | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 01-conta | recuperação de senha pelo link do e-mail; link usado uma vez só | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 01-conta | troca de senha em Minha conta exige a senha atual e derruba as outras sessões | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 02-vitrine | busca pelo cabeçalho encontra por parte do nome e mostra vazio para termo inexistente | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 02-vitrine | evento arquivado e rascunho: página não existe (404 do servidor e tela de não encontrado) | ok | ok | ok | ok | ok | ok | ok (2ª) | ok | ok |
| 02-vitrine | evento em breve: tipo marcado, sem botão de compra | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 02-vitrine | evento encerrado pelo administrador: marcado como encerrado e fora da vitrine | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 02-vitrine | evento esgotado: aviso claro e sem compra | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 02-vitrine | início: destaque, próximos eventos, sem arquivado, rascunho nem encerrado | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 02-vitrine | página do evento à venda: preço com a taxa de serviço, formas de pagamento, compartilhar | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 02-vitrine | vendas encerradas pelo período: aviso e sem compra | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 03-checkout | 6 ingressos: o botão "+" trava no limite; a API recusa 7 | ok | ok | ok | **falhou** | **falhou** | **falhou** | ok | ok | ok |
| 03-checkout | código de promoter: inexistente e desativado recusados; válido aplica sem desconto | ok | ok | ok | **falhou** | ok | ok (2ª) | ok | ok | ok |
| 03-checkout | compra de 1 ingresso: revisão com taxa de serviço, reserva com cronômetro, Pix aprovado, confirmação | ok | ok | ok | **falhou** | ok | **falhou** | ok | ok | ok |
| 03-checkout | compra exige login: visitante escolhe ingressos, entra e volta ao checkout com a seleção | ok | ok | ok | **falhou** | ok | ok | ok | ok | ok |
| 03-checkout | reserva de 30 minutos expirando: aviso na tela, pedido expirado e estoque de volta | ok | ok | ok | ok | ok | **falhou** | ok | ok | ok |
| 04-pagamento | aviso quando o formulário de cartão do Mercado Pago não carrega: só com o gateway real | pulado | pulado | pulado | pulado | pulado | pulado | pulado | pulado | pulado |
| 04-pagamento | cartão aprovado: compra confirmada com um QR por ingresso | ok | ok | ok | **falhou** | ok | **falhou** | ok | ok | ok |
| 04-pagamento | cartão pendente (sem resposta do banco ainda): a tela diz que está em análise e atualiza sozinha | ok | ok | ok | ok (2ª) | ok | ok | ok | ok | ok |
| 04-pagamento | cartão recusado: pedido não concluído, reserva liberada, orientação para tentar de novo | ok | ok | ok | **falhou** | ok | ok | ok | ok | ok |
| 04-pagamento | Pix expirado no gateway: pedido sem pagamento, aviso na tela, estoque de volta | ok | ok | ok | **falhou** | ok | ok (2ª) | ok | ok | ok |
| 05-menores | comprador de 16 anos: aceita o Termo de Ciência no checkout, paga e baixa o Termo de Autorização | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 05-menores | comprador de 17 anos: aceita o Termo de Ciência no checkout, paga e baixa o Termo de Autorização | ok | ok | ok | ok (2ª) | ok | ok | ok | ok | ok |
| 05-menores | evento 18+ recusa comprador de 17 anos no servidor, com aviso claro na revisão | ok | ok | ok | **falhou** | ok | **falhou** | ok | ok | ok |
| 05-menores | termo de autorização público do evento que permite menores, sem dado pessoal | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 06-transferencia | caminho feliz: conferência do nome mascarado, confirmação, os dois lados e os dois e-mails | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 06-transferencia | conta inexistente e a própria conta são recusadas com mensagem | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 06-transferencia | dentro das 2 horas antes do evento: a transferência não é oferecida e a API recusa | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 07-admin | detalhe do evento principal e abas (tipos, ingressos, compradores) | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 07-admin | páginas do painel, sem rolagem horizontal | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| 07-admin | validador e cliente: acesso negado ao painel; validador entra na portaria | ok | ok | ok | ok | ok | ok | ok | ok | ok |

### Cenários de regra de servidor, portaria, admin, e-mails, PDFs e LGPD (uma vez, Chromium 1280)

| Arquivo | Cenário | Resultado | Observações |
|---|---|---|---|
| 06b-transferencia | idade de quem recebe: evento 18+ recusa conta de 17; evento 16+ exige o Termo de Ciência antes do QR | ok |  |
| 06b-transferencia | ingresso já utilizado, cancelado e de pedido estornado não transferem | ok |  |
| 06b-transferencia | retransferência, QR antigo invalidado na portaria e desfazer pelo administrador com e-mail aos dois | ok |  |
| 10-webhook | assinatura inválida: 401, nada muda | ok |  |
| 10-webhook | fora de ordem: estorno seguido de aprovação tardia não revive o pedido | ok |  |
| 10-webhook | notificação duplicada não duplica ingressos nem linhas de evento | ok |  |
| 10-webhook | pagamento que chega depois da reserva vencer, com estoque: confirma e emite | ok |  |
| 10-webhook | pagamento tardio sem estoque: pago_sem_estoque, nada emitido, aviso aos administradores e exceção no painel | ok |  |
| 10-webhook | rotina diária e tarefas do Cloud Tasks não são chamáveis no ambiente local (503, sem OIDC) | ok |  |
| 11-cancelamento-estorno | administrador cancela todos os ingressos válidos do pedido pela tela do pedido | ok |  |
| 11-cancelamento-estorno | administrador cancela um ingresso pela tela: pedido continua pago, ingresso cancelado, sem estorno | ok |  |
| 11-cancelamento-estorno | contestação (chargeback) pelo gateway: pedido contestado, ingressos cancelados, portaria vermelha | ok |  |
| 11-cancelamento-estorno | estorno total pelo gateway: pedido estornado, ingressos cancelados, comprador vê o estado; utilizado fica utilizado | ok |  |
| 11-cancelamento-estorno | evento cancelado com estorno de todos os pedidos: não existe como operação única | ok |  |
| 12-portaria | busca manual: por nome, por código e por CPF, com CPF mascarado; confirmar entrada | ok |  |
| 12-portaria | câmera negada pelo aparelho: mensagem clara e caminho para a busca manual | ok |  |
| 12-portaria | dois validadores no mesmo ingresso ao mesmo tempo: uma entrada só | ok |  |
| 12-portaria | leitura pela câmera simulada: válido, reutilizado, cancelado, transferido (QR antigo), de outro evento, adulterado | ok |  |
| 12-portaria | lista de contingência impressa: PDF e CSV do evento, com CPF mascarado | ok |  |
| 13-admin | compradores: busca, detalhe com CPF mascarado e revelação auditada | ok |  |
| 13-admin | configurações da taxa de serviço: prévia na tela e limites no servidor (sem alterar a taxa da rodada) | ok |  |
| 13-admin | equipe: criar validador com senha temporária, primeiro acesso obriga a troca, desativar derruba o acesso | ok | observacao: depois do login com senha temporária a URL foi /primeiro-acesso; observacao: depois de salvar a senha nova a URL foi /entrar; /api/auth/me 401 |
| 13-admin | evento: criar pela tela, capa, tipos com janelas, publicar, cor, encerrar vendas, arquivar, desarquivar | ok |  |
| 13-admin | evento: excluir rascunho sem uso pela tela, com confirmação pelo nome; evento com venda não pode ser excluído | ok | removal: {"deletable":false,"usage":{"orders":30,"tickets":36,"checkins":13,"minorAcceptances":0},"ticketTypes":4,"hasBanner":false,"archived":false} |
| 13-admin | promoters: criar, código repetido recusado, editar e desativar | ok | observacao: Esc fecha o diálogo do promoter: false |
| 13-admin | relatórios e planilhas: vendas, promoters, taxa mensal com CSV (BOM, ponto e vírgula, sem CPF) | ok |  |
| 14-emails-pdfs | PDF do ingresso, do pedido e Termo de Autorização: A4, texto certo, sem CPF, QR legível | ok |  |
| 14-emails-pdfs | todos os modelos de e-mail: conteúdo, links, rodapé e renderização a 360 px | ok |  |
| 15-lgpd | localizar titular, exportar os dados com protocolo e anonimizar; a conta deixa de entrar | ok |  |
| 16-concorrencia | dois compradores disputam a última unidade ao mesmo tempo: só um reserva | ok |  |
| 16-concorrencia | lote esgota no meio do pedido: o servidor recalcula o preço e a tela pede nova conferência | ok | mensagem: Atenção. O valor do pedido mudou. Confira o novo total antes de continuar. |

Total: 346 execuções: 318 passaram, 5 passaram na segunda tentativa, 14 falharam, 9 puladas. Cenários distintos: 66 (35 de interface, 31 únicos).
