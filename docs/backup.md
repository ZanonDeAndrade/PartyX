# Backup e restauração (Prompt 25)

Verificado em **06/10/2026 na homologação** (Neon `aws-sa-east-1`, PostgreSQL 18.6). **Produção ainda não existe**: os mesmos scripts valem para ela (`deploy.sh roles` e `deploy.sh backup`), mas nada foi executado lá.

## O que existe

| Peça | Como | Onde |
|---|---|---|
| Cópia diária independente | `pg_dump` (formato custom, compactado) por um Cloud Run Job, às **03:00 de São Paulo**, enviado a um bucket **privado** do Cloud Storage | `infra/backup/` |
| Papel de leitura | `partyx_backup`: só `pg_read_all_data`. Não escreve, não é dono, não é da aplicação. Conexão **direta** (o `pg_dump` não funciona por PgBouncer) | `server/src/db/appRole.ts` |
| Conta de serviço | `partyx-backup`: lê só o segredo `database-url-backup`, cria objetos e consulta o que enviou. **Não apaga nem sobrescreve** | `infra/backup/setup.sh` |
| Agendamento autenticado | Cloud Scheduler chama a API do Cloud Run com token OAuth da conta `partyx-scheduler` (`roles/run.invoker` só nesse job). Sem segredo compartilhado | idem |
| Conferência no envio | tamanho e **MD5 do objeto no bucket** contra o arquivo local; lista o conteúdo do dump (≥ 20 entradas); tamanho mínimo | `backup.sh` |
| Manifesto | contagem de linhas por tabela, migrações aplicadas, versão do servidor | `<cópia>.manifest.json` |
| SHA-256 | ao lado de cada cópia; a restauração confere antes de usar | `<cópia>.dump.sha256` |
| Restauração | `infra/backup/restore.sh`: baixa, confere o SHA-256, restaura **só em banco isolado e vazio** (`restore_*` ou `teste_*`; `PROTECTED_HOSTS`), roda 20 verificações | `server/src/ops/restoreCheck.ts` |
| Conferência diária | `PROJECT=<projeto> infra/operacao/check-backup.sh` (só lê) | `infra/operacao/` |

**Criptografia:** o Cloud Storage cifra tudo em repouso por padrão (chaves gerenciadas pelo Google) e a conexão com o Neon é TLS. Não configurei chave própria (CMEK); se a PartyX exigir, é um acréscimo.
**Retenção:** o bucket apaga objetos com mais de **35 dias** (mínimo exigido: 7) e é versionado. **Banners:** o bucket de banners também é versionado.

## O que os alertas fazem

| Alerta | Dispara quando |
|---|---|
| `backup_falhou` | o job registra falha (dump, conferência, envio) |
| `backup ausente` | menos de 1 `backup_ok` numa janela de **25 h** (o Cloud Monitoring só aceita "ausência" de até 23h30, que dispararia todo dia antes da próxima cópia de 24 h; por isso é um limiar sobre a janela, tratando "sem dado" como alerta) |

**Atenção:** o `backup ausente` dispara logo depois de criado, até o primeiro backup. **Rode o job uma vez ao terminar o `setup`.**

## Plano e janela do Neon (fatos de 06/10/2026, homologação)

| Item | Valor | Fonte |
|---|---|---|
| Servidor | PostgreSQL 18.6, `aws-sa-east-1` | consulta ao banco |
| Janela de restauração do projeto | 24 h (`history_retention_seconds = 86400`) | API do Neon, 01/10 |
| Planos oficiais | Free: 6 h de janela. **Launch: até 7 dias**, sem mensalidade mínima, US$ 0,106 por CU-hora e US$ 0,35 por GB-mês | páginas de preços do Neon |
| Plano da conta de homologação | **não aparece pela API: confirme no console** | — |

**O backup diário NÃO depende do histórico do Neon**: ele é a cópia que vale se o projeto inteiro for perdido. A janela de restauração do Neon é um complemento.

## Perda de dados possível (RPO) e tempo de restauração

- **RPO:** até **24 h**. Se o banco for perdido logo antes das 03:00, perde-se tudo o que aconteceu desde a cópia da véspera. A janela do Neon pode recuperar mais, mas **não conte com ela** (24 h na homologação, 6 h no Free).
- **Medido:** a cópia da homologação (66 KB, 156 entradas) foi gerada em **2 s** pelo job e restaurada em **3 s** (5 s no total com download e conferência). Banco real de produção será maior: o tempo cresce com o tamanho; **repita a medição com dados reais**.
- Não há garantia de recuperar alterações posteriores à última cópia (Anexo II).

## Como restaurar (ensaio trimestral e emergência)

```bash
# 1) banco NOVO e vazio, com nome restore_* (outro projeto Neon, uma branch ou um Postgres local)
export TARGET_URL='postgres://usuario:senha@host/restore_ensaio'
# 2) restaura a última cópia (ou informe gs://.../partyx-AAAAMMDDTHHMMSSZ.dump) e confere
PROJECT=partyx-prod PROTECTED_HOSTS=<host do banco de produção> infra/backup/restore.sh latest
# sem o cliente do PostgreSQL 18 instalado: PG_DOCKER=1 (usa a imagem postgres:18-alpine)
```
O script recusa: destino que não se chame `restore_*`/`teste_*`, destino em `PROTECTED_HOSTS`, destino que não esteja vazio, cópia com SHA-256 diferente. As 20 verificações incluem: migrações, linhas por tabela contra o manifesto (tabelas que só crescem não podem ter menos), códigos de ingresso únicos, vendidos = ingressos emitidos por tipo, pedido pago com um ingresso por unidade, `paid_at` nos pedidos aprovados (base da taxa), estoque dentro da capacidade, ingresso utilizado com entrada registrada e os gatilhos de integridade.

Para **recuperar a produção** depois de conferir: decisão da PartyX e da CONTRATADA, janela combinada, aviso da perda desde a última cópia. **Nunca restaure por cima do banco em uso.**

## Rotinas

| Frequência | O quê | Registro |
|---|---|---|
| Diária | `check-backup.sh` (exit 0 = ok; 1 = falha; 2 = não deu para verificar) e olhar se houve e-mail de alerta | `docs/operacao/registro-rotinas.md` |
| Trimestral | Restauração completa em banco isolado, com tempo e resultado das 20 verificações. Corrija o roteiro com o que o ensaio mostrar | idem |
| Após mudança de esquema | Conferir que o `restoreCheck` ainda cobre as tabelas novas | PR da migração |

## Estimativa de custo

Cloud Storage (dados pequenos, Nearline, 35 dias de retenção) e Cloud Run Job de segundos por dia: **centavos de dólar por mês**; Artifact Registry da imagem de backup, a mesma ordem de grandeza. **Cloud Scheduler: 1 job a mais** na conta (os 3 gratuitos são por conta de faturamento, compartilhados com todos os projetos; depois, US$ 0,10 por job). Não medi a fatura real.

## O que NÃO foi verificado

- Execução agendada de verdade às 03:00 (só a execução manual do job, que usa a mesma conta e o mesmo caminho; o agendamento fica ativo e a primeira execução noturna ainda não aconteceu).
- Restauração de um banco de produção com volume real; o tempo medido é de 66 KB.
- Chave de criptografia própria (CMEK) e bloqueio de exclusão do bucket (retention lock).
- Copiar a cópia para **outro projeto ou região** (hoje as cópias estão no mesmo projeto do banco da aplicação: se a conta do projeto for perdida, perdem-se juntas). Recomendo uma cópia semanal em outro projeto antes do go-live.
