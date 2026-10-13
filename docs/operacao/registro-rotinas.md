# Registro de rotinas executadas

Uma linha por execução. **Nunca** coloque senha, token, chave, CPF completo ou conteúdo de ingresso aqui.

| Data | Rotina | Quem | Resultado | Ação tomada ou pendência |
|---|---|---|---|---|
| 05/10/2026 | Verificação do backup (homologação, modo leitura) | Preparação do Prompt 30 | **FALHA**: última cópia é o dump manual de 01/10 (60 KB, 100 h). Backup diário não existe | Prompt 25 pendente |
| 13/10/2026 | Deploy em homologação (etapa 10) | Responsável, com assistente | Revisão `partyx-hml-00012-tqz` (commit `e9e31e9`), Mercado Pago de TESTE, variáveis de `infra/homologacao/env.hml.yaml`, 0 a 3 instâncias, migrações 0005 a 0008 aplicadas. A primeira tentativa (`00010-pvf`) não subiu por falta de `EMAIL_FROM` | Deploy pelo `deploy.sh` local; o workflow de `develop` segue sem funcionar (sem `develop`, sem WIF) |
| 13/10/2026 | Rotina diária de conciliação criada e executada à mão (homologação) | idem | `partyx-varredura-diaria` 04:00; execução manual 200 | Nenhuma |
| 13/10/2026 | Teste rápido pelo Hosting (homologação) | idem | saúde, inicial, `/entrar` e vitrine 200; `/admin` redireciona para `/entrar`; `run.app` sem `X-Forwarded-Host` 403; webhook com assinatura inválida 401 | Nenhuma |
| 13/10/2026 | Roteiro 11.2 em homologação (rodada `tmv9wk`) | idem | **21 de 21** com o Mercado Pago de teste; e-mails lidos na caixa de captura | Três rodadas anteriores pararam por defeitos do roteiro e por lentidão do Pix de teste (`../registros/dados-ficticios-homologacao.md`) |
| 13/10/2026 | Carga reduzida em homologação (rodada `tmvbad`) | idem | 50 visitantes e 20 compras/min por 2 min: 30 compras, 9 recusas por estoque, 0 erros, sem venda acima do estoque; memória máxima 179 MiB de 512; 1 instância | Carga do PDF 11.3 em escala cheia só foi feita no ambiente local |
| 13/10/2026 | Backup: conferência e execução manual (homologação) | idem | diário às 03:00 com sucesso de 06/10 a 13/10; bucket privado, 35 dias; manual `partyx-20261013T225411Z` | Nenhuma |
| 13/10/2026 | **Restauração real em banco isolado** (homologação) | idem | dump `partyx-20261013T225411Z` restaurado em `restore_ensaio`, numa branch temporária do Neon: SHA-256 ok, 23 s, 20 verificações OK, 18 tabelas com contagem idêntica à origem, 9 migrações, esquema idêntico ao criado pelos arquivos. **Ponto recuperado: 13/10 22:54:11 UTC. RPO do backup diário: até 24 h** | Branch apagada. Ensaio em produção, com dados reais, continua pendente |
| 13/10/2026 | PITR do Neon (homologação) | idem | branch criada no instante 22:29:48 UTC (pedido 22:30:00): continha a rodada das 22:25 e não a das 22:47; último pedido 22:24:38 | Janela de 1 dia em homologação (7 em produção). RPO do PITR: segundos, dentro da janela |
| 13/10/2026 | Alertas: 3 sinais criados e disparo de propósito (homologação, rodada `tmvbwa`) | idem | 16 políticas e 15 métricas. `estorno_parcial`: log 23:00:32, incidente 23:04:32. `cobranca_duplicada`: log 23:00:36, incidente 23:04:32 (UTC). Pedido continua pago, nada cancelado nem emitido a mais | O responsável confirmou em 13/10/2026 o recebimento dos dois e-mails. Incidentes fecham sozinhos em 24 h |
| 13/10/2026 | `sslmode=verify-full` (homologação) | idem | URLs já usam; aceita o certificado certo, recusa nome trocado e CA falsa | Replicar a conferência em produção no próximo deploy |
