# Operação continuada (Prompt 30)

Preparado em 05/10/2026, **antes de existir produção**. Tudo aqui descreve a operação que começa depois do go-live (Prompt 29, ainda não executado). Os comandos foram testados contra bancos locais e, onde indicado, contra a homologação em modo leitura; **nada foi provado em produção**.

## Responsabilidades

| Quem | Faz |
|---|---|
| **CONTRATADA** (Zanon de Andrade Softwares, operadora) | Hospedagem, monitoramento, backup, manutenção corretiva e preventiva, atualizações de segurança, suporte à equipe da PartyX, relatório mensal da taxa |
| **PartyX** (controladora) | Atendimento ao comprador, estorno financeiro no gateway, conferência de documento na portaria, equipamentos e internet do local, procedimento de contingência, decisões (D-13, D-14 etc.) |
| **Fora do escopo** | Evoluções (Cláusula 8ª), cobrança de comprador, comissão de promoter, qualquer automação de boleto, cobrança ou suspensão |

## Suporte (conforme a documentação v1.0; **conferir com o contrato, que não está no repositório**)

| Item | Valor |
|---|---|
| Canal | WhatsApp +55 55 9958-7217 (equipe da PartyX; **não** é canal de comprador) |
| Horário | Segunda a sexta, 9h às 17h (Brasília), exceto feriados. Chamado fora do horário conta a partir do próximo período |
| Falha crítica (plataforma totalmente indisponível) | Primeira resposta em até **4 horas úteis** |
| Falha leve (problema parcial) | Primeira resposta em até **2 dias úteis** |
| Pedido de alteração | Análise e estimativa em até **5 dias úteis** |
| Risco registrado (D-17) | Festas são à noite e nos fins de semana, fora do horário. Alinhar por escrito com a PartyX ou prever plantão. Estar de sobreaviso em dia de evento é boa prática, **não obrigação** |

## Calendário de rotinas

Registre cada execução em `registro-rotinas.md` (data, quem, resultado, o que foi feito).

| Frequência | Rotina | Como | Sinal de problema |
|---|---|---|---|
| Contínua | Disponibilidade e alertas | Verificação de uptime e alertas por log (`infra/operacao/alerts.sh`) | E-mail de alerta |
| **Diária** | Backup do dia concluído (o job roda às 03:00; há alertas `backup_falhou` e `backup ausente`) | `PROJECT=<projeto> infra/operacao/check-backup.sh` | Saída 1 (falha) ou 2 (não verificado), ou e-mail de alerta |
| Automática | Conciliação: tarefa por pedido (+10, +25, +55 min) e varredura diária 04:00 | `infra/producao/deploy.sh status` | Alerta `conciliacao_revisao_manual` ou `fila_conciliacao_falhou` |
| **Semanal** | Erros e webhooks não processados | `npm run ops:weekly` (sai com 2 se algo exige atenção) e Cloud Logging com `severity>=ERROR` | "Exige atenção" |
| **Mensal, até o dia 5** | Extrato da taxa do mês anterior | `npm run ops:fee -- --mensalidade=<valor do contrato>` (padrão: mês anterior). **Só gera o relatório**; o boleto (mensalidade + taxa, vencimento dia 10) é emitido por uma pessoa | Conciliação "NÃO CONFERE" (sai com 2): investigar antes de cobrar |
| Mensal | Atualizações de segurança | Seção abaixo | `npm audit` com achado novo |
| **Trimestral** | Restauração em ambiente separado (20 verificações) | `infra/backup/restore.sh` e `runbooks/restauracao.md` | Restauração falha ou alguma verificação reprova |
| Antes de abertura de vendas grande | Revisão de capacidade (cliente avisa com 15 dias) | Seção abaixo | — |
| Aos 11 meses da publicação | Lembrar a PartyX de que a renovação exige manifestação com 30 dias de antecedência (Cl. 19.3) | Aviso por escrito | — |

## Sinais de alerta que o sistema emite

Cada um é um log JSON com o campo `alert`; `infra/operacao/alerts.sh` cria métrica e política por e-mail para todos (**não executado**).

| Sinal | O que significa | O que fazer |
|---|---|---|
| `pago_sem_estoque` | Pagamento aprovado depois de a reserva vencer, sem estoque. Nenhum ingresso emitido | Avisar a PartyX **no mesmo dia** para estornar no gateway (D-13, D-41). `GET /api/admin/payments/exceptions` lista |
| `webhook_falhou` | Notificação do gateway não processada | `runbooks/gateway.md` |
| `reconciliacao_falhou` | A rotina agendada não conseguiu consultar o gateway | `runbooks/gateway.md` |
| `pagamento_divergente` | Valor, conta, moeda ou pedido diferentes do esperado. Nada foi aprovado | `runbooks/gateway.md`; **não** forçar a aprovação |
| `estorno_fora_de_fluxo` | Estorno ou chargeback de pedido que nunca foi aprovado aqui | Conferir no gateway; revisão manual |
| `estorno_parcial` | Estorno parcial feito no Mercado Pago. Nenhum ingresso cancelado sozinho (D-82, proposta a confirmar) | Cancelar manualmente no ADM15 o ingresso correspondente, conforme a PartyX indicar. `runbooks/gateway.md` |
| `cobranca_duplicada` | Segunda cobrança para o mesmo pedido; nada emitido por ela (D-83) | A PartyX estorna **a cobrança em dobro** (não a do pedido) e marca como tratada em Exceções. O estorno faz o alerta aparecer de novo, sem efeito. `runbooks/gateway.md` |
| `email_falhou` | E-mail que esgotou as 4 tentativas (+2, +10, +30 min por Cloud Tasks): revisão manual | `runbooks/email.md` |
| `backup_falhou` / `backup ausente` | O job de backup falhou, ou nenhum backup bem-sucedido em 25 h | `docs/backup.md`; rodar `check-backup.sh` e executar o job à mão |
| `verificacao_humana_indisponivel` | A Cloudflare (Turnstile) não respondeu: cadastro e recuperação ficam **recusados** (falha fechada) | Conferir o status da Cloudflare; não desligar a verificação |
| `fila_email_falhou` | Não foi possível agendar o reenvio de e-mail | A varredura diária cobre; conferir a fila |
| `conciliacao_revisao_manual` | Pedido ainda pendente depois das 3 verificações sob demanda | Conferir no gateway; nada foi inventado: o pedido segue pendente |
| `fila_conciliacao_falhou` | Não foi possível agendar a verificação no Cloud Tasks | Conferir a fila e as permissões; a varredura diária cobre a lacuna |

## Atualizações mensais de segurança

1. `npm audit --omit=dev` e `npm outdated`. Anote o que mudou desde o mês anterior. **Pendência conhecida:** 2 avisos moderados de `uuid` via `@google-cloud/storage` (`docs/carga-compatibilidade-seguranca.md`); reavaliar a cada mês.
2. Atualizar só o que corrige vulnerabilidade ou é patch; mudança major vira pedido à parte. Depois: `npm run lint`, `npm run typecheck`, `npm run test:db`, `npm run build`.
3. Publicar em **homologação** primeiro, rodar `infra/testes/round.mjs`, só então produção, fora de horário de venda e de evento, com backup recente (`deploy.sh` exige `BACKUP_DONE=sim`).
4. Atualizar a imagem base do contêiner (`Dockerfile`) e conferir os avisos do Artifact Registry.
5. Registrar a data, o que foi atualizado e o resultado.

## Revisão de capacidade antes de grande abertura de vendas

Condição: o cliente avisa **com 15 dias** (Anexo II, 1). Sem aviso, registrar que a revisão foi feita sem o prazo.

1. Pedir: data e hora da abertura, público esperado, número de ingressos, divulgação prevista.
2. Comparar com o que foi medido: no servidor local, 200 visitantes e 50 compras por minuto passaram sem erro e o dobro também (`docs/carga-compatibilidade-seguranca.md`). **Isso não vale para a nuvem**: repita `infra/testes/load.mjs` em **homologação** com os números do cliente.
3. Ajustar: `--max-instances` do Cloud Run (hoje 3), `DB_POOL_MAX` (cada instância abre até esse número de conexões; multiplicar pelo máximo de instâncias e comparar com o limite do plano do Neon), unidades de computação do Neon (D-18), limites de chamadas do gateway.
4. Conferir: `/api/health/ready`, alertas ligados, backup do dia, rotina de conciliação rodando, e-mail autenticado, orçamento com folga.
5. Combinar a janela: nenhuma publicação nem manutenção nas 24 h ao redor.
6. Orçamento: aumento de custo acima do previsto precisa de autorização do cliente.

## Cobrança e inadimplência (sem automação)

O sistema **não** emite boleto, não cobra e não suspende. O extrato (`ops:fee`) é insumo; a emissão é humana.

- Divergência na taxa: o cliente contesta por escrito até o vencimento; a parte não contestada é paga (Cl. 6.5).
- Atraso: multa, juros e correção conforme a Cl. 7.1. **Aplicar é decisão humana, caso a caso.**
- **Antes de qualquer suspensão (Cl. 7.2: após 10 dias corridos de atraso, com notificação prévia):**
  1. Há notificação **prévia e escrita**, com prazo para pagar? Se não, **não suspender**.
  2. Há venda aberta ou **evento nas próximas 72 h** (confira o calendário de eventos da PartyX)? Se sim, **avaliar o impacto** (vendas e portaria param) e decidir com quem tem autoridade; por padrão, adiar.
  3. Quem autorizou, quando e por quê fica registrado em `registro-rotinas.md`.
  4. A suspensão é feita fora da aplicação (escala do Cloud Run para zero ou bloqueio de entrada) e **nunca apaga dados**.
  5. **Restabelecer em até 1 dia útil** depois da quitação integral (Cl. 7.4).

## Encerramento do contrato

Ver `runbooks/encerramento.md`: exportação em CSV (`npm run ops:export-closure`), disponível por **30 dias**, exclusão depois (respeitando a rotação dos backups e a retenção legal) e **sem entrega de código-fonte** (Cl. 9.4).

## Runbooks

`runbooks/indisponibilidade.md`, `gateway.md`, `email.md`, `estoque.md`, `portaria.md`, `incidente.md`, `rollback.md`, `restauracao.md`, `encerramento.md`.

## O que foi verificado e o que não foi

| Item | Situação |
|---|---|
| `ops:fee`, `ops:weekly`, `ops:export-closure` | **Testados**: 9 testes em PostgreSQL real (virada de mês no fuso, cancelado e estornado contando, exceção de pago sem estoque, conciliação, ausência de dado pessoal e de segredos nos relatórios e CSVs, neutralização de fórmulas) e execução dos comandos contra um banco local com uma compra completa |
| `check-backup.sh` | **Testado na homologação**: acusou a falta de backup diário antes do Prompt 25 e, depois do primeiro backup real, passou (OK, 0 h). Trata bucket inexistente como "não verificado" |
| `alerts.sh` | **Executado na homologação em 06/10/2026**: 10 métricas e 10 políticas. Alertas **abriram** no Cloud Monitoring (reais e sintéticos, 3 a 4 minutos depois do log). `infra/operacao/test-alerts.sh` dispara os sintéticos. **A chegada do e-mail à caixa de entrada não foi verificável por mim** |
| Restauração trimestral | **Ensaiada na homologação** (06/10/2026); falta o ensaio em produção com dados reais |
| Atualização mensal, revisão de capacidade, cobrança, suspensão, encerramento | Procedimentos escritos; **nunca executados** (não há produção) |
| Tempos de resposta | Vêm da documentação v1.0; o contrato assinado não está no repositório |
