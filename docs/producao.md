# Produção (Prompt 28, preparação)

Atualizado em 06/10/2026. **Nenhum recurso de produção foi criado e nenhuma versão foi publicada em produção.** A escolha registrada com o responsável foi: preparar a produção **com as vendas fechadas**, sem go-live, sem declarar aceite e sem anunciar nada. O que existe é a preparação reproduzível; a execução depende de dados que ainda não foram informados.

**Novidades de 06/10/2026 (antes do go-live, sem tocar em produção):** verificação humana (Turnstile) no cadastro e na recuperação; reenvio de e-mail por Cloud Tasks (+2, +10, +30 min); migração `0002` que aborta sem o papel `partyx_app` e `deploy.sh roles` para criá-lo; regra expand/contract verificada na CI; **backup diário** (`infra/backup/`, `docs/backup.md`); alertas disparados de verdade na homologação; homologação atualizada e testada ponta a ponta atrás do Hosting. Resultados medidos em `README-DEPLOY.md`, seção 11. **Produção continua inexistente.**

## Efeito contratual (para decidir com consciência)

Pela Cláusula 5.4, **autorização de produção ou primeira venda real contam como aceite**, e a data de publicação inicia os 12 meses e os 30 dias de garantia. Por isso o `deploy.sh` de produção só abre a venda com `GO_LIVE_CONFIRMED=sim-aceite-e-autorizacao-registrados`. A fase atual (vendas fechadas) **não** é go-live e não deve ser comunicada ao cliente como tal. Se o ambiente de produção ficar acessível, vale combinar por escrito que não representa aceite.

## O que foi preparado (não executado em produção)

Roteiro completo, decisões, medições e estimativa de custo: **`README-DEPLOY.md`** (raiz do repositório). Resumo:

| Arquivo | O que faz |
|---|---|
| `infra/producao/deploy.sh` | Um único script com subcomandos: `setup`, `varredura`, `migrate`, `deploy`, `hosting`, `evento-on`, `evento-off`, `rollback`, `status`, `alertas`. Exige `PROJECT` (e `BILLING_ACCOUNT` no `setup`), sem padrão, e recusa nomes de homologação. O `deploy` **recusa** sem `BACKUP_DONE=sim` e `NO_FICTITIOUS_DATA=sim`; para abrir a venda exige gateway real, textos legais, identidade aprovada e `GO_LIVE_CONFIRMED`. Padrão: vendas **fechadas**. Recusas testadas sem tocar na nuvem; os flags do `gcloud` foram conferidos contra a ajuda da versão instalada |
| `firebase.json` | Rewrites `/api/**` e `**` para o Cloud Run em `southamerica-east1` |
| `infra/producao/artifact-cleanup.json` | Mantém só as 3 imagens mais recentes |
| `infra/operacao/alerts.sh` | 8 sinais de alerta por log (inclui `conciliacao_revisao_manual` e `fila_conciliacao_falhou`) |

**Código (testado, 661 testes):** cookie `__session`; `Cache-Control: private, no-store` em toda `/api/*`; estáticos com hash imutáveis e `index.html` `no-cache`; conciliação sob demanda por Cloud Tasks (`server/src/payments/taskQueue.ts`, `reconcileTask.ts`); `JOBS_CALLER_EMAIL` com mais de uma conta.

**Verificado de verdade na nuvem (homologação, 05/10/2026), depois removido:** Hosting na frente de um Cloud Run em São Paulo (cookies, cache da CDN, `X-Forwarded-For`, corpo bruto, latência) e o código novo contra a API real do Cloud Tasks (aceita a tarefa, trata duplicata, `audience` correto). A sonda, a fila de teste e o repositório temporário de imagens foram apagados; o site `partyx-hml.web.app` ficou vazio (404). **Efeito colateral:** o Firebase foi ligado ao projeto `partyx-hml` e as APIs Cloud Tasks, Firebase e Hosting ficaram habilitadas lá (sem custo).

**Falha encontrada e corrigida nos scripts de homologação** (já registrada antes): o `deploy.sh` de homologação não passava `QR_HMAC_KEYS`. Corrigido, mas o segredo novo `qr-hmac-keys` só passa a existir se o `setup.sh` de homologação for executado.

## O que falta para executar (entradas necessárias)

| Item | Quem | Situação |
|---|---|---|
| Id do projeto de produção e conta de faturamento (existem duas contas: "Pagamento do Firebase", usada na homologação, e "Minha conta de faturamento") | Responsável | **Serão informados por você** (os comandos já leem `PROJECT` e `BILLING_ACCOUNT`) |
| Orçamento mensal para o alerta | Responsável | **R$ 30** (padrão do script). Cobre só o Google; o Neon é cobrado à parte |
| Neon de produção: projeto separado em `aws-sa-east-1`, plano **Launch** (só uso, sem mensalidade mínima, restauração de até 7 dias; confirmado na página de preços), papel `partyx_app` criado **antes** da 1ª migração (D-18) | Responsável | Não criado |
| Gateway real na conta da PartyX, credenciais e webhook (D-01 a D-04) | Cliente | Bloqueado |
| Textos legais e versões (D-11); identidade visual aprovada (D-10) | Cliente | Bloqueado |
| Domínio e DNS, HTTPS, SPF/DKIM/DMARC, remetente (D-08, D-09) | Cliente | Bloqueado. Firebase Hosting na frente do Cloud Run versus balanceador: comparar custo depois do orçamento; não usar a URL `run.app` como endereço final |
| Backup diário e restauração testada (Prompt 25) | Contratada | **Não executado** (a trava `BACKUP_DONE` impede o deploy sem isso) |
| Primeiro administrador real (`npm run admin:bootstrap`) e equipe, com troca de senha temporária | Cliente informa nomes | Pendente |
| Compra real de baixo valor e estorno pelo cliente | Cliente | Só no go-live |

## Checklist 13.1 (resumo)

Aceite ou autorização expressa: **não**. Credenciais e webhook do gateway: **não**. Compra real de teste: **não**. Domínio, HTTPS e redirecionamentos: **não**. Produção sem dados fictícios: não há banco ainda. Vendas fechadas por padrão: **sim**, garantido em código (`SALES_OPEN` fica falso em produção quando não definido) e pelo script.

## Próximo passo

Informar o id do projeto e a conta de faturamento de produção e o orçamento mensal aprovado; então executo `setup.sh` (cria custo) e preparo o Neon de produção. O deploy continua dependendo do backup (Prompt 25).
