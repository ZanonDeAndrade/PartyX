#!/usr/bin/env bash
# PartyX em PRODUÇÃO: Google Cloud (Cloud Run + Cloud Tasks) + Firebase Hosting na frente + Neon (fora do Google).
# NÃO FOI EXECUTADO. Idempotente onde dá. Uso: ./infra/producao/deploy.sh <comando>
#
#   setup        cria o projeto (opcional), APIs, contas de serviço, fila, buckets, segredos e orçamento
#   varredura    cria a rotina diária das 04:00 e a limpeza de retenção das 04:05 (Cloud Scheduler) e remove a varredura de 5 min,
#                se existir; rode depois do 1º deploy e depois de mudar o PUBLIC_BASE_URL
#   roles        cria os papéis partyx_app (aplicação) e partyx_backup (só leitura) NO NEON e grava as URLs nos segredos. ANTES da 1ª migração
#   backup       backup diário: imagem, job, agendamento às 03:00 e alertas (infra/backup/setup.sh). Depois de `roles` e do `setup`
#   migrate      roda as migrações (Cloud Run Job com a conexão direta do Neon)
#   conferir     confere o arquivo de variáveis, os segredos, a conta do gateway e a marca do banco. Não muda nada
#   build        constrói a imagem da tag RELEASE (git archive da tag, nunca a pasta de trabalho)
#   candidata    publica a imagem como revisão SEM tráfego (tag "candidata") e roda o teste rápido nela
#   virar        passa 100% do tráfego para a candidata, mantém a anterior e imprime o comando de rollback
#   deploy       atalho: conferir + build + migração + candidata (sem tráfego); a virada é sempre o comando `virar`
#   hosting      publica o firebase.json (rewrites para o Cloud Run) no Firebase Hosting
#   banners-iam  papel só para listar e apagar imagens no bucket dos banners (exclusão de evento sem uso, 15/10/2026). Idempotente
#   evento-on    1 instância mínima NO SERVIÇO (--min=1), sem revisão nova: servidor sempre acordado (abertura das vendas e evento)
#   evento-off   tira a instância mínima do serviço (--min=default): volta a escalar a zero
#   rollback     volta para a revisão anterior (ou REVISAO=<nome>)
#   manutencao   on|off: liga ou desliga a página de manutenção (G06) sem build, só trocando a variável (nova revisão)
#   status       mostra o que está no ar, a configuração e avisos de custo
#   alertas      cria os alertas por log (infra/operacao/alerts.sh)
#
# Variáveis OBRIGATÓRIAS (sem padrão, para ninguém criar custo na conta errada):
#   PROJECT           id do projeto de produção (ex.: partyx-prod)
#   BILLING_ACCOUNT   conta de faturamento (só no `setup`)
# Opcionais:   REGION=southamerica-east1  SERVICE=partyx  BUDGET_BRL=30  CREATE_PROJECT=1
#   RELEASE           tag do Git a publicar (obrigatória em build, migrate, candidata e deploy), ex.: release-2026-10-13
#   ENV_FILE=infra/producao/env.prod.yaml   variáveis NÃO secretas do serviço: a ÚNICA fonte (endereço, venda, cadastro, gateway,
#                    limites, textos legais). O que estiver no ambiente com valor diferente do arquivo é recusado
#   BACKUP_DONE=sim  NO_FICTITIOUS_DATA=sim   confirmações de cada publicação (candidata, deploy)
#   TRUSTED_PROXY_HOPS=2   MEDIDO atrás do Firebase Hosting em 05/10/2026 (ver README-DEPLOY.md). Direto no Cloud Run seria 1.
#   MIN_INSTANCES=0  MAX_INSTANCES=3  NOTIFY_EMAIL=<e-mail dos alertas>
#   MEMORY=512Mi  NODE_HEAP_MB=320  CONCURRENCY=80   memória, heap do V8 e requisições por instância (docs/operacao/memoria.md);
#                    MEMORY diferente de 512Mi exige NODE_HEAP_MB (ex.: MEMORY=1Gi NODE_HEAP_MB=768 numa abertura grande)
#   RECONCILE_TASK_OFFSETS_SECONDS=60,120,240,480  RECONCILE_TASK_MARGIN_SECONDS=120
#   RECONCILE_LATE_OFFSETS_SECONDS=900,1800,3600,10800,28800,86400  RECONCILE_LOCK_SECONDS=120   (padrões do código; só passe para mudar)
#   PARTYX_SUPPORT_EMAIL  PARTYX_SUPPORT_WHATSAPP   contato de atendimento DA PARTYX para o comprador (nunca o da contratada)
#   PARTYX_LEGAL_NAME  PARTYX_CNPJ  PARTYX_ADDRESS  PARTYX_SUPPORT_HOURS   dados públicos DA PARTYX (rodapé, e-mails, manutenção)
#   TERMS_DATE  PRIVACY_DATE  CANCELLATION_DATE   vigência (AAAA-MM-DD) das versões; textos em conteudo-legal/ (no Git, vão pela tag)
#   SIGNUP_OPEN=false   cadastro de compradores; `true` só com Termos e Privacidade publicados (arquivo, versão e data; D-84)
#   MAINTENANCE_MODE=false   página de manutenção (G06); para ligar sem novo build: comando `manutencao on|off`
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${PROJECT:?informe PROJECT (id do projeto de produção)}"
case "$PROJECT" in *hml*|*homolog*) echo "PROJECT parece de homologação: $PROJECT" >&2; exit 1;; esac
REGION="${REGION:-southamerica-east1}"        # São Paulo (Tier 2), junto do Neon aws-sa-east-1
SERVICE="${SERVICE:-partyx}"
# Heap do V8 abaixo da memória da instância: com 512 MiB, 320 MB de heap deixam cerca de 190 MB para o que não é heap.
MEMORY="${MEMORY:-512Mi}"
case "$MEMORY" in 512Mi) NODE_HEAP_MB="${NODE_HEAP_MB:-320}";; *) : "${NODE_HEAP_MB:?com MEMORY=$MEMORY, informe NODE_HEAP_MB}";; esac
BUDGET_BRL="${BUDGET_BRL:-30}"
QUEUE="partyx-conciliacao"
REPO="partyx"
JOB="partyx-migrate"
SWEEP_JOB="partyx-varredura-diaria"
PURGE_JOB="partyx-limpeza-retencao"   # limpeza diária dos dados técnicos pelos prazos RETENTION_* (D-62)
OLD_PENDING_JOB="partyx-varredura-pendentes"   # varredura de 5 min de uma versão anterior deste script: removida (D-78)
BANNERS="${PROJECT}-banners"
BACKUPS="${PROJECT}-backups"
APP_SA="partyx-app"; DEPLOY_SA="partyx-deploy"; SCHED_SA="partyx-scheduler"; TASKS_SA="partyx-tasks"
LABELS="app=partyx,env=producao"
sa() { echo "$1@$PROJECT.iam.gserviceaccount.com"; }

g() { gcloud --project="$PROJECT" "$@"; }
exists() { "$@" >/dev/null 2>&1; }
# Endereço run.app previsível (nome do serviço + número do projeto). É o `audience` dos tokens das tarefas e do Scheduler,
# e para onde elas são entregues. Não é o domínio próprio: o Cloud Tasks e o Scheduler chamam o Cloud Run direto.
run_url() { echo "https://${SERVICE}-$(g projects describe "$PROJECT" --format='value(projectNumber)').${REGION}.run.app"; }
public_host() { node -e 'process.stdout.write(new URL(process.argv[1]).host)' "$PUBLIC_BASE_URL"; }

# Exclusão de evento sem uso (15/10/2026): o runtime apaga a pasta de imagens do evento no bucket dos banners, com todas as versões
# (o bucket tem versionamento). Papel próprio, só com listar e apagar objetos, ligado SÓ a este bucket; criar continua pelo objectCreator.
cmd_banners_iam() {
  local role="partyxBannerCleanup"
  exists g iam roles describe "$role" || g iam roles create "$role" --title="PartyX: apagar imagens de evento excluido" \
    --description="Listar e apagar objetos; ligado so ao bucket dos banners" --permissions=storage.objects.list,storage.objects.delete --stage=GA >/dev/null
  gcloud storage buckets add-iam-policy-binding "gs://$BANNERS" --member="serviceAccount:$(sa $APP_SA)" --role="projects/$PROJECT/roles/$role" >/dev/null
  echo "ok: $(sa $APP_SA) lista e apaga objetos em gs://$BANNERS (papel $role)"
}

cmd_setup() {
  : "${BILLING_ACCOUNT:?informe BILLING_ACCOUNT}"
  if [ "${CREATE_PROJECT:-0}" = "1" ]; then
    echo "== Projeto e faturamento"
    exists gcloud projects describe "$PROJECT" || gcloud projects create "$PROJECT" --name="PartyX Producao" --labels="$LABELS"
    gcloud billing projects link "$PROJECT" --billing-account="$BILLING_ACCOUNT" >/dev/null
  fi

  echo "== APIs"
  g services enable run.googleapis.com cloudtasks.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com \
    storage.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com logging.googleapis.com monitoring.googleapis.com \
    iam.googleapis.com cloudresourcemanager.googleapis.com billingbudgets.googleapis.com iamcredentials.googleapis.com \
    firebase.googleapis.com firebasehosting.googleapis.com

  echo "== Artifact Registry (mantém só as 3 imagens mais recentes: dá para voltar uma versão e o armazenamento fica mínimo)"
  exists g artifacts repositories describe "$REPO" --location="$REGION" || \
    g artifacts repositories create "$REPO" --repository-format=docker --location="$REGION" --description="Imagens do PartyX" --labels="$LABELS"
  g artifacts repositories set-cleanup-policies "$REPO" --location="$REGION" --policy="infra/producao/artifact-cleanup.json" --no-dry-run

  echo "== Contas de serviço (menor privilégio)"
  for entry in "$APP_SA:Runtime do Cloud Run" "$DEPLOY_SA:Build, migração e deploy" "$SCHED_SA:Varredura diária (Cloud Scheduler)" "$TASKS_SA:Entrega das tarefas de conciliação (Cloud Tasks)"; do
    exists g iam service-accounts describe "$(sa "${entry%%:*}")" || g iam service-accounts create "${entry%%:*}" --display-name="${entry#*:}"
  done
  # Quem roda este script é uma PESSOA com acesso ao projeto. A conta partyx-deploy só serve de identidade do job de migração: lê o
  # segredo database-url-direct (abaixo) e mais nada. Nenhum papel amplo é concedido a ela.

  echo "== Cloud Tasks: fila da conciliação sob demanda (3 tentativas de entrega, ritmo baixo = teto de gasto)"
  if ! exists g tasks queues describe "$QUEUE" --location="$REGION"; then
    g tasks queues create "$QUEUE" --location="$REGION" --max-attempts=3 --min-backoff=30s --max-backoff=300s \
      --max-dispatches-per-second=5 --max-concurrent-dispatches=5
  fi
  # O runtime só ENFILEIRA nesta fila, e só pode usar a conta que assina o token das tarefas (partyx-tasks).
  g tasks queues add-iam-policy-binding "$QUEUE" --location="$REGION" --member="serviceAccount:$(sa $APP_SA)" --role=roles/cloudtasks.enqueuer >/dev/null
  g iam service-accounts add-iam-policy-binding "$(sa $TASKS_SA)" --member="serviceAccount:$(sa $APP_SA)" --role=roles/iam.serviceAccountUser >/dev/null

  echo "== Buckets"
  exists gcloud storage buckets describe "gs://$BANNERS" --project="$PROJECT" || \
    gcloud storage buckets create "gs://$BANNERS" --project="$PROJECT" --location="$REGION" --uniform-bucket-level-access --default-storage-class=STANDARD
  gcloud storage buckets update "gs://$BANNERS" --versioning --update-labels="$LABELS"
  exists gcloud storage buckets describe "gs://$BACKUPS" --project="$PROJECT" || \
    gcloud storage buckets create "gs://$BACKUPS" --project="$PROJECT" --location="$REGION" --uniform-bucket-level-access --public-access-prevention --default-storage-class=NEARLINE
  gcloud storage buckets update "gs://$BACKUPS" --versioning --update-labels="$LABELS"
  echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":35}}]}' > "${TMPDIR:-/tmp}/partyx-prod-lifecycle.json"   # cópias: 35 dias (mínimo exigido: 7)
  gcloud storage buckets update "gs://$BACKUPS" --lifecycle-file="${TMPDIR:-/tmp}/partyx-prod-lifecycle.json"
  gcloud storage buckets add-iam-policy-binding "gs://$BANNERS" --member=allUsers --role=roles/storage.objectViewer >/dev/null
  gcloud storage buckets add-iam-policy-binding "gs://$BANNERS" --member="serviceAccount:$(sa $APP_SA)" --role=roles/storage.objectCreator >/dev/null
  cmd_banners_iam
  gcloud storage buckets add-iam-policy-binding "gs://$BACKUPS" --member="serviceAccount:$(sa $APP_SA)" --role=roles/storage.objectCreator >/dev/null

  echo "== Segredos (poucos; versões antigas devem ser destruídas: versão ativa conta no custo)"
  mk_secret() { # nome, quem lê, comando que gera o valor
    local name="$1" reader="$2"; shift 2
    exists g secrets describe "$name" || g secrets create "$name" --replication-policy=user-managed --locations="$REGION" --labels="$LABELS"
    [ -n "$(g secrets versions list "$name" --limit=1 --format='value(name)')" ] || "$@" | g secrets versions add "$name" --data-file=- >/dev/null
    g secrets add-iam-policy-binding "$name" --member="serviceAccount:$(sa "$reader")" --role=roles/secretmanager.secretAccessor >/dev/null
  }
  mk_secret session-secret "$APP_SA" openssl rand -base64 48
  # QR_HMAC_KEYS exige "versão:chave" em base64url. Para rotacionar, ACRESCENTE ",2:<chave>" e troque QR_HMAC_CURRENT. Chave de produção NUNCA é a de homologação.
  mk_secret qr-hmac-keys "$APP_SA" bash -c "printf '1:%s' \"\$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n')\""
  for name in database-url database-url-direct database-url-backup smtp-url turnstile-secret; do   # valores vêm de terceiros (Neon, e-mail, Cloudflare) (Neon, provedor de e-mail): entram à mão, fora do Git
    exists g secrets describe "$name" || g secrets create "$name" --replication-policy=user-managed --locations="$REGION" --labels="$LABELS"
  done
  for name in database-url smtp-url turnstile-secret; do g secrets add-iam-policy-binding "$name" --member="serviceAccount:$(sa $APP_SA)" --role=roles/secretmanager.secretAccessor >/dev/null; done
  g secrets add-iam-policy-binding database-url-direct --member="serviceAccount:$(sa $DEPLOY_SA)" --role=roles/secretmanager.secretAccessor >/dev/null

  echo "== Orçamento: R\$ $BUDGET_BRL/mês, alertas por e-mail em 50%, 90% e 100% (só ALERTA: o teto real é MAX_INSTANCES)"
  if ! gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" --format='value(displayName)' | grep -qx "partyx-prod"; then
    gcloud billing budgets create --billing-account="$BILLING_ACCOUNT" --display-name="partyx-prod" \
      --budget-amount="${BUDGET_BRL}BRL" --filter-projects="projects/$(g projects describe "$PROJECT" --format='value(projectNumber)')" \
      --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
  fi

  echo "== Firebase: liga o Firebase ao projeto (necessário para o Hosting)"
  curl -fsS -X POST -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: $PROJECT" \
    -H "content-type: application/json" -d '{}' "https://firebase.googleapis.com/v1beta1/projects/$PROJECT:addFirebase" >/dev/null || \
    echo "(Firebase já estava ligado ou precisa ser ligado no console; veja README-DEPLOY.md)"

  echo "ok. Falta: valores de database-url, database-url-direct e smtp-url; papel partyx_app no Neon ANTES da 1ª migração; deploy; hosting; varredura (comando 'varredura')."
}

# UMA agenda fixa no Cloud Scheduler: a rotina diária, de madrugada, rede de segurança para e-mails pendentes, pagamentos de até 3 dias
# (inclusive pedidos cujas tarefas no Cloud Tasks falharam) e ingressos que faltarem. A conciliação "a cada poucos minutos" e a da
# aprovação tardia são tarefas POR PEDIDO no Cloud Tasks (1, 2, 4, 8 min, fim da reserva, e 15 min, 30 min, 1 h, 3 h, 8 h, 24 h), sem cron:
# sem pedido em aberto, nada roda e o Neon dorme (D-78). Mais a limpeza de retenção das 04:05 (D-62) e o backup das 03:00: 3 jobs no
# Scheduler. Rodar depois do 1º deploy.
cmd_varredura() {
  load_env_file   # o X-Forwarded-Host da varredura sai do PUBLIC_BASE_URL do arquivo de variáveis
  local url host; url="$(run_url)"; host="$(public_host)"
  # Na criação o gcloud usa --headers; na atualização de um job existente, --update-headers (o --headers é recusado).
  local verb=create headers_flag=--headers
  if exists g scheduler jobs describe "$SWEEP_JOB" --location="$REGION"; then verb=update; headers_flag=--update-headers; fi
  g scheduler jobs "$verb" http "$SWEEP_JOB" --location="$REGION" --schedule="0 4 * * *" --time-zone="America/Sao_Paulo" \
    --uri="$url/api/internal/jobs/reconcile-payments" --http-method=POST \
    "$headers_flag=X-Forwarded-Host=$host" \
    --oidc-service-account-email="$(sa $SCHED_SA)" --oidc-token-audience="$url" --attempt-deadline=120s --max-retry-attempts=1
  echo "Rotina diária às 04:00 (America/Sao_Paulo) -> $url"
  # Limpeza de retenção (D-62): sessões encerradas, tentativas de login e códigos de recuperação mais velhos que os prazos RETENTION_* do
  # arquivo de variáveis. Às 04:05, logo depois da varredura, para aproveitar o banco já acordado (o Neon escala a zero).
  verb=create; headers_flag=--headers
  if exists g scheduler jobs describe "$PURGE_JOB" --location="$REGION"; then verb=update; headers_flag=--update-headers; fi
  g scheduler jobs "$verb" http "$PURGE_JOB" --location="$REGION" --schedule="5 4 * * *" --time-zone="America/Sao_Paulo" \
    --uri="$url/api/internal/jobs/purge-retention" --http-method=POST \
    "$headers_flag=X-Forwarded-Host=$host" \
    --oidc-service-account-email="$(sa $SCHED_SA)" --oidc-token-audience="$url" --attempt-deadline=120s --max-retry-attempts=1
  echo "Limpeza de retenção às 04:05 (America/Sao_Paulo) -> $url"
  # A varredura de 5 min de uma versão anterior (nunca executada) manteria o Neon acordado: se alguém a criou, sai.
  if exists g scheduler jobs describe "$OLD_PENDING_JOB" --location="$REGION"; then
    g scheduler jobs delete "$OLD_PENDING_JOB" --location="$REGION" --quiet
    echo "Removido o job $OLD_PENDING_JOB (varredura de 5 min)."
  fi
}

# Papéis do banco: a migração 0002 ABORTA sem `partyx_app`. Criados por SQL com a conexão direta do DONO (nunca pela API do Neon, que
# põe o papel em neon_superuser). As senhas nunca são impressas: vão de arquivo temporário (0600) para o Secret Manager, que é apagado.
cmd_roles() {
  local owner; owner="$(g secrets versions access latest --secret=database-url-direct 2>/dev/null)" || true
  [ -n "$owner" ] || { echo "Grave primeiro a conexão DIRETA do dono do banco no segredo database-url-direct (README-DEPLOY.md)." >&2; exit 1; }
  # O banco declara a que ambiente pertence ANTES de qualquer outra coisa. Recusa se já pertencer à homologação.
  DATABASE_URL_DIRECT="$owner" npm run -s db:env -- mark producao
  local dir; dir="$(mktemp -d)"; rmdir "$dir"   # o script cria a pasta (recusa pasta existente)
  trap 'rm -rf "$dir"' RETURN
  DATABASE_URL_DIRECT="$owner" npm run -s db:create-app-role -- --emit-to="$dir" ${ROTATE:+--rotate}
  g secrets versions add database-url --data-file="$dir/database-url" >/dev/null
  g secrets versions add database-url-backup --data-file="$dir/database-url-backup" >/dev/null
  g secrets add-iam-policy-binding database-url-backup --member="serviceAccount:partyx-backup@$PROJECT.iam.gserviceaccount.com" --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
  echo "Papéis criados e URLs gravadas em database-url e database-url-backup."
}

cmd_backup() { NOTIFY_EMAIL="${NOTIFY_EMAIL:?informe NOTIFY_EMAIL}" PROJECT="$PROJECT" REGION="$REGION" ./infra/backup/setup.sh; }

cmd_migrate() {
  local IMAGE="${IMAGE:-$(release_image)}"   # a imagem da tag RELEASE (rode 'build' antes), ou IMAGE=<imagem>
  local verb=create; exists g run jobs describe "$JOB" --region="$REGION" && verb=update
  g run jobs "$verb" "$JOB" --region="$REGION" --image="$IMAGE" --service-account="$(sa $DEPLOY_SA)" \
    --set-secrets=DATABASE_URL_DIRECT=database-url-direct:latest --set-env-vars=APP_ENV=producao \
    --command=node --args=dist-server/migrate.js --max-retries=0 --task-timeout=300s --quiet
  g run jobs execute "$JOB" --region="$REGION" --wait
}

# --- Publicação (13/10/2026): variáveis do arquivo versionado, imagem construída de uma TAG do Git, revisão candidata SEM tráfego,
# --- virada e rollback como comandos separados. Nada aqui abre venda nem cadastro: isso é o arquivo de variáveis que decide.
ENV_FILE="${ENV_FILE:-infra/producao/env.prod.yaml}"
CANDIDATE_TAG="candidata"
has_version() { [ -n "$(g secrets versions list "$1" --limit=1 --filter='state=ENABLED' --format='value(name)' 2>/dev/null)" ]; }

# Lê e confere o arquivo (formato, obrigatórias, nada com cara de segredo, nada de homologação). As variáveis de configuração vêm SÓ
# do arquivo: se a mesma variável estiver no ambiente com outro valor, recusa (evita publicar algo diferente do que foi revisado).
load_env_file() {
  local checked v file_value
  checked="$(python3 -I infra/env-check.py "$ENV_FILE" producao)" || exit 1
  eval "$checked"
  for v in PUBLIC_BASE_URL SALES_OPEN SIGNUP_OPEN PAYMENT_GATEWAY GATEWAY_ENVIRONMENT MP_COLLECTOR_ID TURNSTILE_ENABLED TURNSTILE_SITE_KEY \
           VISUAL_APPROVED MAINTENANCE_MODE TERMS_VERSION TERMS_DATE PRIVACY_VERSION PRIVACY_DATE CANCELLATION_VERSION CANCELLATION_DATE EMAIL_FROM \
           MINOR_TERM_VERSION MINOR_TERM_DATE MINOR_AUTHORIZATION_VERSION MINOR_AUTHORIZATION_DATE; do
    file_value="$(eval "printf %s \"\${ENVF_$v:-}\"")"
    if [ -n "${!v:-}" ] && [ "${!v}" != "$file_value" ]; then
      echo "Recuso: $v está no ambiente com valor diferente do $ENV_FILE. Mude o arquivo, não a linha de comando." >&2; exit 1
    fi
    printf -v "$v" %s "$file_value"
  done
  [ "$ENVF_NODE_OPTIONS" = "--max-old-space-size=$NODE_HEAP_MB" ] \
    || { echo "Recuso: NODE_OPTIONS do $ENV_FILE ($ENVF_NODE_OPTIONS) não combina com MEMORY=$MEMORY (heap $NODE_HEAP_MB MB)." >&2; exit 1; }
}

# Todas as conferências que não mudam nada. Roda sozinha (`conferir`) e antes de cada passo que publica.
cmd_conferir() {
  load_env_file
  local url; url="$(run_url)"
  [ "$ENVF_JOBS_AUDIENCE" = "$url" ] || { echo "Recuso: JOBS_AUDIENCE do $ENV_FILE difere de $url." >&2; exit 1; }
  [ "$ENVF_BANNER_BUCKET" = "$BANNERS" ] || { echo "Recuso: BANNER_BUCKET do $ENV_FILE difere de $BANNERS." >&2; exit 1; }
  [ "$ENVF_TASKS_QUEUE" = "projects/$PROJECT/locations/$REGION/queues/$QUEUE" ] || { echo "Recuso: TASKS_QUEUE do $ENV_FILE não é a fila deste projeto." >&2; exit 1; }
  # Mercado Pago (D-01): os três segredos, e a conta do token precisa ser a do arquivo e NÃO ser usuário de teste.
  if [ "$PAYMENT_GATEWAY" = "mercadopago" ]; then
    local s account
    for s in mp-access-token mp-public-key mp-webhook-secret; do
      has_version "$s" || { echo "Recuso: o segredo $s precisa ter valor (scripts/setup-mp-credentials-producao.sh)." >&2; exit 1; }
    done
    # O token vai pelo stdin do curl, nunca na linha de comando nem na saída.
    account="$(g secrets versions access latest --secret=mp-access-token \
      | { IFS= read -r t || [ -n "$t" ]; printf 'header = "Authorization: Bearer %s"\n' "$t"; } \
      | curl -sS --max-time 15 -K - https://api.mercadopago.com/users/me \
      | python3 -I -c 'import json,sys; d=json.load(sys.stdin); print("TESTE" if "test_user" in (d.get("tags") or []) else d.get("id",""))' 2>/dev/null || true)"
    [ "$account" != "TESTE" ] || { echo "Recuso: mp-access-token é de usuário de TESTE do Mercado Pago." >&2; exit 1; }
    [[ "$account" =~ ^[0-9]+$ ]] || { echo "Recuso: não foi possível conferir a conta do mp-access-token na API do Mercado Pago." >&2; exit 1; }
    [ "$account" = "$MP_COLLECTOR_ID" ] || { echo "Recuso: MP_COLLECTOR_ID do $ENV_FILE difere da conta do mp-access-token." >&2; exit 1; }
  fi
  # Turnstile: opcional e desligado por padrão (README-DEPLOY 8b). Ligado, exige a chave do site (arquivo) e a secreta (segredo).
  if [ "$TURNSTILE_ENABLED" = "true" ]; then
    has_version turnstile-secret || { echo "Recuso: TURNSTILE_ENABLED=true exige o segredo turnstile-secret com valor." >&2; exit 1; }
  fi
  ! has_version smtp-url || [ -n "$EMAIL_FROM" ] || { echo "Recuso: o segredo smtp-url tem valor e EMAIL_FROM não está no $ENV_FILE." >&2; exit 1; }
  # Banco: precisa declarar que é de PRODUÇÃO, e as URLs pooled e direta precisam ser do mesmo banco.
  local direct pooled
  direct="$(g secrets versions access latest --secret=database-url-direct 2>/dev/null || true)"; pooled="$(g secrets versions access latest --secret=database-url 2>/dev/null || true)"
  { [ -n "$direct" ] && [ -n "$pooled" ]; } || { echo "Recuso: database-url e database-url-direct precisam ter valor (rode 'roles')." >&2; exit 1; }
  DATABASE_URL_DIRECT="$direct" DATABASE_URL_POOLED="$pooled" npm run -s db:env -- check producao || { echo "Recuso: o banco apontado NÃO é o de produção." >&2; exit 1; }
  # Textos legais (D-11): vão na imagem a partir de conteudo-legal/ DA TAG (com RELEASE; sem ela, a pasta de trabalho). Cadastro aberto
  # exige Termos e Privacidade publicados; a Política de Cancelamento é exigida só para abrir a venda (D-84).
  local legal_dir="conteudo-legal" k v
  legal_ok() { # documento: existe e não está vazio na tag (ou na pasta, sem RELEASE)
    if [ -n "${RELEASE:-}" ]; then [ -n "$(git show "refs/tags/$RELEASE:$legal_dir/$1.txt" 2>/dev/null | head -c 1)" ]; else [ -s "$legal_dir/$1.txt" ]; fi
  }
  local where="${RELEASE:+na tag $RELEASE}"; where="${where:-na pasta de trabalho}"
  if [ "$SIGNUP_OPEN" = "true" ]; then
    for v in TERMS_VERSION TERMS_DATE PRIVACY_VERSION PRIVACY_DATE; do
      [ -n "${!v:-}" ] || { echo "Recuso: SIGNUP_OPEN=true exige $v no $ENV_FILE (texto legal fornecido pela PartyX)." >&2; exit 1; }
    done
    for k in termos-de-uso privacidade; do
      legal_ok "$k" || { echo "Recuso: SIGNUP_OPEN=true sem $legal_dir/$k.txt $where (texto oficial da PartyX)." >&2; exit 1; }
    done
  fi
  # Textos de menores: com versão no arquivo, o texto, a data e o par (termo e autorização) precisam vir juntos na tag.
  if [ -n "${MINOR_TERM_VERSION:-}${MINOR_AUTHORIZATION_VERSION:-}" ]; then
    for v in MINOR_TERM_VERSION MINOR_TERM_DATE MINOR_AUTHORIZATION_VERSION MINOR_AUTHORIZATION_DATE; do
      [ -n "${!v:-}" ] || { echo "Recuso: textos de menores exigem $v no $ENV_FILE." >&2; exit 1; }
    done
    for k in termo-menor autorizacao-menor; do
      legal_ok "$k" || { echo "Recuso: $legal_dir/$k.txt ausente $where (texto de menores)." >&2; exit 1; }
    done
  fi
  # Taxa de serviço (D-90): a release que cobra a taxa (migração 0017 na tag) só sobe com os Termos de Uso 1.3 e a Política de
  # Cancelamento 1.1, que falam dela; os textos anteriores diziam que não havia taxa (infra/producao/textos-taxa.py).
  local fee_migration="drizzle/0017_taxa_de_servico.sql"
  if { [ -n "${RELEASE:-}" ] && git cat-file -e "refs/tags/$RELEASE:$fee_migration" 2>/dev/null; } || { [ -z "${RELEASE:-}" ] && [ -f "$fee_migration" ]; }; then
    local fee_tmp; fee_tmp="$(mktemp -d)"
    for k in termos-de-uso cancelamento; do
      if [ -n "${RELEASE:-}" ]; then git show "refs/tags/$RELEASE:$legal_dir/$k.txt" > "$fee_tmp/$k.txt" 2>/dev/null || : > "$fee_tmp/$k.txt"
      else cat "$legal_dir/$k.txt" > "$fee_tmp/$k.txt" 2>/dev/null || : > "$fee_tmp/$k.txt"; fi
    done
    python3 -I infra/producao/textos-taxa.py "$fee_tmp/termos-de-uso.txt" "$fee_tmp/cancelamento.txt" "${TERMS_VERSION:-}" "${CANCELLATION_VERSION:-}" \
      || { rm -rf "$fee_tmp"; echo "Recuso: a release cobra a taxa de serviço e os textos legais $where não são os da taxa (Termos 1.3, Política 1.1)." >&2; exit 1; }
    rm -rf "$fee_tmp"
  fi
  # Desconto por promoter (D-91): a release que dá desconto pelo código (migração 0018 na tag) só sobe com os Termos de Uso 1.5, que
  # falam do desconto; os anteriores diziam que o código não dá desconto (infra/producao/textos-desconto.py).
  local discount_migration="drizzle/0018_desconto_por_promoter.sql"
  if { [ -n "${RELEASE:-}" ] && git cat-file -e "refs/tags/$RELEASE:$discount_migration" 2>/dev/null; } || { [ -z "${RELEASE:-}" ] && [ -f "$discount_migration" ]; }; then
    local disc_tmp; disc_tmp="$(mktemp -d)"
    if [ -n "${RELEASE:-}" ]; then git show "refs/tags/$RELEASE:$legal_dir/termos-de-uso.txt" > "$disc_tmp/termos.txt" 2>/dev/null || : > "$disc_tmp/termos.txt"
    else cat "$legal_dir/termos-de-uso.txt" > "$disc_tmp/termos.txt" 2>/dev/null || : > "$disc_tmp/termos.txt"; fi
    python3 -I infra/producao/textos-desconto.py "$disc_tmp/termos.txt" "${TERMS_VERSION:-}" \
      || { rm -rf "$disc_tmp"; echo "Recuso: a release dá desconto pelo código do promoter e os Termos de Uso $where não são os do desconto (1.5)." >&2; exit 1; }
    rm -rf "$disc_tmp"
  fi
  # Evento privado (D-92): a release com a lista de autorizados (migração 0019 na tag) só sobe com a Política de Privacidade e os
  # Termos de Uso que falam dela (infra/producao/textos-privado.py; proposta em docs/registros/evento-privado-textos-propostos.md).
  local private_migration="drizzle/0019_evento_privado.sql"
  if { [ -n "${RELEASE:-}" ] && git cat-file -e "refs/tags/$RELEASE:$private_migration" 2>/dev/null; } || { [ -z "${RELEASE:-}" ] && [ -f "$private_migration" ]; }; then
    local priv_tmp; priv_tmp="$(mktemp -d)"
    for k in privacidade termos-de-uso; do
      if [ -n "${RELEASE:-}" ]; then git show "refs/tags/$RELEASE:$legal_dir/$k.txt" > "$priv_tmp/$k.txt" 2>/dev/null || : > "$priv_tmp/$k.txt"
      else cat "$legal_dir/$k.txt" > "$priv_tmp/$k.txt" 2>/dev/null || : > "$priv_tmp/$k.txt"; fi
    done
    python3 -I infra/producao/textos-privado.py "$priv_tmp/privacidade.txt" "$priv_tmp/termos-de-uso.txt" "${PRIVACY_VERSION:-}" "${TERMS_VERSION:-}" \
      || { rm -rf "$priv_tmp"; echo "Recuso: a release tem o evento privado e os textos legais $where não falam dele (Privacidade 1.3, Termos 1.6)." >&2; exit 1; }
    rm -rf "$priv_tmp"
  fi
  if [ "$SALES_OPEN" = "true" ]; then   # travas extras para ABRIR A VENDA (go-live)
    [ "$PAYMENT_GATEWAY" != "none" ] || { echo "Recuso: venda aberta sem gateway real." >&2; exit 1; }
    for v in TERMS_VERSION TERMS_DATE PRIVACY_VERSION PRIVACY_DATE CANCELLATION_VERSION CANCELLATION_DATE GO_LIVE_CONFIRMED; do [ -n "${!v:-}" ] || { echo "Recuso: $v é obrigatório para abrir a venda." >&2; exit 1; }; done
    for k in termos-de-uso privacidade cancelamento; do
      legal_ok "$k" || { echo "Recuso: SALES_OPEN=true sem $legal_dir/$k.txt $where (texto oficial da PartyX)." >&2; exit 1; }
    done
    [ "$GO_LIVE_CONFIRMED" = "sim-aceite-e-autorizacao-registrados" ] || { echo "Recuso: registre aceite/autorização e use GO_LIVE_CONFIRMED=sim-aceite-e-autorizacao-registrados." >&2; exit 1; }
    [ "$VISUAL_APPROVED" = "true" ] || { echo "Recuso: identidade visual sem aprovação escrita (CA-33)." >&2; exit 1; }
  fi
  echo "ok: $ENV_FILE conferido. Venda: $SALES_OPEN; cadastro: $SIGNUP_OPEN; gateway: $PAYMENT_GATEWAY; endereço: $PUBLIC_BASE_URL"
}

# Travas de TODA publicação que mexe em banco ou serviço (a migração só se desfaz restaurando backup).
require_confirmations() {
  [ "${BACKUP_DONE:-}" = "sim" ] || { echo "Recuso: backup manual feito e restauração testada são PRÉ-REQUISITO (BACKUP_DONE=sim)." >&2; exit 1; }
  [ "${NO_FICTITIOUS_DATA:-}" = "sim" ] || { echo "Recuso: confirme banco sem dados fictícios (NO_FICTITIOUS_DATA=sim)." >&2; exit 1; }
}

# A imagem sai SEMPRE de uma tag do Git (RELEASE), nunca da pasta de trabalho: publica exatamente o que foi validado em homologação.
release_image() {
  : "${RELEASE:?informe RELEASE=<tag do Git a publicar, ex.: release-2026-10-13>}"
  local sha; sha="$(git rev-parse --short "refs/tags/$RELEASE^{commit}" 2>/dev/null)" || { echo "Recuso: a tag $RELEASE não existe." >&2; exit 1; }
  echo "$REGION-docker.pkg.dev/$PROJECT/$REPO/partyx-api:$RELEASE-$sha"
}
cmd_build() {
  local image tmp k; image="$(release_image)"
  BUILD_TMP="$(mktemp -d)"; tmp="$BUILD_TMP"; trap 'rm -rf "${BUILD_TMP:-}"' EXIT
  git archive --format=tar "refs/tags/$RELEASE" | tar -x -C "$tmp"
  # Textos legais: versionados no Git desde 14/10/2026, entram na imagem PELA TAG (o git archive acima), nunca da pasta de trabalho.
  # Um arquivo da pasta local diferente do da tag, ou fora dela, é recusado: ninguém publica achando que levou um texto que não foi.
  if [ -d conteudo-legal ]; then
    for f in conteudo-legal/*; do
      [ -f "$f" ] || continue
      { git cat-file -e "refs/tags/$RELEASE:$f" 2>/dev/null \
        && [ "$(git show "refs/tags/$RELEASE:$f" | sha256sum)" = "$(sha256sum < "$f")" ]; } \
        || { echo "Recuso: $f difere da tag $RELEASE ou não está nela. Faça commit e uma tag nova." >&2; exit 1; }
    done
  fi
  for k in termos-de-uso privacidade cancelamento termo-menor autorizacao-menor; do
    [ ! -s "$tmp/conteudo-legal/$k.txt" ] || echo "   texto legal $k.txt (da tag): sha256 $(sha256sum < "$tmp/conteudo-legal/$k.txt" | cut -c1-16)"
  done
  echo "== build de $RELEASE -> $image (Cloud Build, manual: só roda quando você chama)"
  g builds submit "$tmp" --region="$REGION" --tag="$image" --quiet
  # O Cloud Build guarda o código enviado num bucket próprio (criado no 1º build); limpa depois de 7 dias para não acumular custo.
  echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":7}}]}' > "${TMPDIR:-/tmp}/cb-lifecycle.json"
  gcloud storage buckets update "gs://${PROJECT}_cloudbuild" --lifecycle-file="${TMPDIR:-/tmp}/cb-lifecycle.json" >/dev/null 2>&1 || true
  echo "imagem pronta: $image"
}

# Teste rápido de uma revisão pelo endereço dela (candidata ou serviço), com o X-Forwarded-Host do domínio público.
smoke() { # base
  local base="$1" host i code; host="$(public_host)"
  for i in 1 2 3 4 5; do
    curl -fsS "$base/api/health/ready" | grep -q '"database":"ok"' && break
    [ "$i" = 5 ] && { echo "FALHOU: /api/health/ready" >&2; return 1; }; sleep 3
  done
  check() { # descrição, esperado, argumentos do curl...
    local what="$1" want="$2"; shift 2
    code="$(curl -s -o /dev/null -w '%{http_code}' "$@")"
    [ "$code" = "$want" ] && echo "   ok   $what ($code)" || { echo "   FALHOU $what: $code, esperado $want" >&2; return 1; }
  }
  check "saúde" 200 "$base/api/health" || return 1
  check "página inicial pelo domínio" 200 -H "X-Forwarded-Host: $host" "$base/" || return 1
  check "/entrar" 200 -H "X-Forwarded-Host: $host" "$base/entrar" || return 1
  check "/admin sem login redireciona" 302 -H "X-Forwarded-Host: $host" "$base/admin" || return 1
  # Cadeia da Vercel (ponte temporária, docs/operacao/vercel.md): o visitante vem no X-Forwarded-For e o Google acrescenta
  # quem chamou; com TRUSTED_PROXY_HOPS=2 o servidor precisa devolver o visitante (203.0.113.10), mascarado.
  local origem
  # A assinatura do webhook do Mercado Pago depende do data.id da URL e do x-request-id: os dois precisam chegar intactos.
  origem="$(curl -fsS -H "X-Forwarded-Host: $host" -H 'X-Forwarded-For: 203.0.113.10' -H 'X-Vercel-Id: teste-de-publicacao' \
    -H 'X-Request-Id: teste-de-publicacao' "$base/api/health/origem?data.id=ORD000&type=order")" \
    || { echo "   FALHOU: /api/health/origem" >&2; return 1; }
  printf '%s' "$origem" | python3 -I -c 'import json,sys; d=json.load(sys.stdin); h=sys.argv[1]
ok = d.get("host")==h and d.get("intermediario")=="vercel" and d.get("ip")=="203.0.x.x" \
  and d.get("consulta")=="?data.id=ORD000&type=order" and (d.get("cabecalhos") or {}).get("x-request-id")=="teste-de-publicacao"
print("   ok   origem pela cadeia da Vercel (host %s, IP %s, query e x-request-id intactos)" % (d.get("host"), d.get("ip")) if ok else "   FALHOU origem: %s" % d, file=sys.stdout if ok else sys.stderr)
sys.exit(0 if ok else 1)' "$host" || return 1
  check "origem direto no run.app, sem o domínio" 403 "$base/api/health/origem" || return 1
  check "run.app sem o cabeçalho do domínio" 403 "$base/" || return 1
  check "webhook com assinatura inválida" 401 -X POST -H "X-Forwarded-Host: $host" -H 'content-type: application/json' \
    -H 'x-signature: ts=1,v1=00' -H 'x-request-id: teste-de-publicacao' -d '{"type":"order","data":{"id":"ORD000"}}' \
    "$base/api/webhooks/payments?data.id=ORD000&type=order" || return 1
  curl -fsS -H "X-Forwarded-Host: $host" "$base/api/public/site" | grep -q "\"salesOpen\":$SALES_OPEN" || { echo "   FALHOU: salesOpen difere do arquivo" >&2; return 1; }
  echo "   ok   salesOpen=$SALES_OPEN"
  # Cadastro: `ready` do /api/legal/versions só é verdadeiro com SIGNUP_OPEN=true E os textos exigidos publicados na imagem.
  curl -fsS -H "X-Forwarded-Host: $host" "$base/api/legal/versions" | grep -q "\"ready\":$SIGNUP_OPEN" \
    || { echo "   FALHOU: cadastro (ready do /api/legal/versions) difere de SIGNUP_OPEN=$SIGNUP_OPEN" >&2; return 1; }
  echo "   ok   signupOpen=$SIGNUP_OPEN (textos exigidos publicados)"
  # Textos com versão no arquivo de variáveis: a API pública precisa mostrar o texto OFICIAL, com essa versão e essa data de vigência.
  local kind ver date
  for kind in termos-de-uso:TERMS privacidade:PRIVACY cancelamento:CANCELLATION termo-menor:MINOR_TERM autorizacao-menor:MINOR_AUTHORIZATION; do
    ver="$(eval "printf %s \"\${${kind#*:}_VERSION:-}\"")"; date="$(eval "printf %s \"\${${kind#*:}_DATE:-}\"")"
    [ -n "$ver" ] || continue
    curl -fsS -H "X-Forwarded-Host: $host" "$base/api/public/legal/${kind%%:*}" | python3 -I -c 'import json,sys; d=json.load(sys.stdin)["document"]; k,v,dt=sys.argv[1:4]
ok = d.get("status")=="oficial" and d.get("version")==v and d.get("effectiveDate")==dt and len(d.get("blocks") or [])>0
print("   ok   %s: oficial, versão %s, vigência %s, %d blocos" % (k, d.get("version"), d.get("effectiveDate"), len(d.get("blocks") or [])) if ok else "   FALHOU %s: %s, versão %s, vigência %s" % (k, d.get("status"), d.get("version"), d.get("effectiveDate")), file=sys.stdout if ok else sys.stderr)
sys.exit(0 if ok else 1)' "${kind%%:*}" "$ver" "$date" || return 1
  done
  curl -fsSI "$base/api/health" | tr -d '\r' | grep -qi '^cache-control: private, no-store' || { echo "   FALHOU: /api sem Cache-Control private, no-store" >&2; return 1; }
}

# Nova revisão SEM tráfego, com a tag "candidata": o público continua na revisão anterior até o comando `virar`.
cmd_candidata() {
  cmd_conferir; require_confirmations
  local image; image="${IMAGE:-$(release_image)}"
  # Segredos obrigatórios sempre; SMTP e Turnstile só entram se o segredo já tem valor (o Cloud Run recusa montar segredo sem versão).
  local secrets="DATABASE_URL=database-url:latest,SESSION_SECRET=session-secret:latest,QR_HMAC_KEYS=qr-hmac-keys:latest"
  [ "$PAYMENT_GATEWAY" != "mercadopago" ] || secrets="$secrets,MP_ACCESS_TOKEN=mp-access-token:latest,MP_PUBLIC_KEY=mp-public-key:latest,MP_WEBHOOK_SECRET=mp-webhook-secret:latest"
  ! has_version smtp-url || secrets="$secrets,SMTP_URL=smtp-url:latest"
  [ "$TURNSTILE_ENABLED" != "true" ] || secrets="$secrets,TURNSTILE_SECRET=turnstile-secret:latest"
  echo "== revisão candidata, sem tráfego (venda: $SALES_OPEN; cadastro: $SIGNUP_OPEN)"
  # Cobrança por requisição, 1 vCPU/512 MiB (heap 320 MB), concorrência 80, teto de 3 instâncias (teto REAL de gasto).
  # Aceita chamadas sem login: o Firebase Hosting, o Cloud Tasks e o Scheduler chamam por HTTPS; quem protege é o código (OIDC/sessão).
  g run deploy "$SERVICE" --region="$REGION" --image="$image" --service-account="$(sa $APP_SA)" \
    --no-traffic --tag="$CANDIDATE_TAG" \
    --allow-unauthenticated --port=8080 --cpu=1 --memory="$MEMORY" --concurrency="${CONCURRENCY:-80}" --timeout=60 --cpu-throttling --cpu-boost \
    --min-instances="${MIN_INSTANCES:-0}" --max-instances="${MAX_INSTANCES:-3}" \
    --env-vars-file="$ENV_FILE" --set-secrets="$secrets" \
    --labels="$LABELS" --quiet
  local base; base="$(g run services describe "$SERVICE" --region="$REGION" --format=json \
    | python3 -I -c 'import json,sys; print(next((t["url"] for t in json.load(sys.stdin)["status"]["traffic"] if t.get("tag")=="'"$CANDIDATE_TAG"'"), ""))')"
  [ -n "$base" ] || { echo "FALHOU: endereço da revisão candidata não encontrado." >&2; exit 1; }
  echo "== teste rápido da candidata em $base (o público continua na revisão anterior)"
  smoke "$base" || { echo "A candidata NÃO passou. Nada mudou para o público. Não rode 'virar'." >&2; exit 1; }
  echo "candidata aprovada no teste rápido. Para colocar no ar: ./infra/producao/deploy.sh virar"
}

# Texto legal com versão nova vale a partir da virada (D-90: Termos 1.3 e Política de Cancelamento 1.1, "vigência na data da virada"):
# se a candidata troca a versão de um texto, a data dele precisa ser a de hoje em São Paulo. Senão, ajuste a data no env e refaça a
# candidata. Mesma versão (publicação que não mexe nos textos): nada a conferir.
legal_dates_on_switch() {
  local current="$1" target="$2" today; today="$(TZ=America/Sao_Paulo date +%F)"
  local env_of='import json,sys; c=json.load(sys.stdin)["spec"]["containers"][0]; print("\n".join(e["name"] + "=" + e["value"] for e in c.get("env", []) if "value" in e))'
  local cur tgt kind v d cv
  cur="$(g run revisions describe "$current" --region="$REGION" --format=json | python3 -I -c "$env_of")"
  tgt="$(g run revisions describe "$target" --region="$REGION" --format=json | python3 -I -c "$env_of")"
  for kind in TERMS PRIVACY CANCELLATION; do
    v="$(printf '%s\n' "$tgt" | sed -n "s/^${kind}_VERSION=//p")"; d="$(printf '%s\n' "$tgt" | sed -n "s/^${kind}_DATE=//p")"
    cv="$(printf '%s\n' "$cur" | sed -n "s/^${kind}_VERSION=//p")"
    if [ -n "$v" ] && [ "$v" != "$cv" ] && [ "$d" != "$today" ]; then
      echo "Recuso: a candidata publica ${kind}_VERSION=$v (antes ${cv:-nenhuma}) com vigência $d, e a virada é hoje ($today). Troque ${kind}_DATE no $ENV_FILE para $today e refaça a candidata." >&2
      exit 1
    fi
  done
}

# Passa 100% do tráfego para a candidata. A revisão anterior continua existindo: o comando de volta sai impresso aqui.
cmd_virar() {
  load_env_file
  local current target
  current="$(g run services describe "$SERVICE" --region="$REGION" --format=json \
    | python3 -I -c 'import json,sys; print(next((t["revisionName"] for t in json.load(sys.stdin)["status"]["traffic"] if t.get("percent")==100), ""))')"
  target="$(g run services describe "$SERVICE" --region="$REGION" --format=json \
    | python3 -I -c 'import json,sys; print(next((t["revisionName"] for t in json.load(sys.stdin)["status"]["traffic"] if t.get("tag")=="'"$CANDIDATE_TAG"'"), ""))')"
  [ -n "$target" ] || { echo "Recuso: não há revisão com a tag $CANDIDATE_TAG (rode 'candidata' antes)." >&2; exit 1; }
  [ "$target" != "$current" ] || { echo "A candidata $target já recebe 100% do tráfego." ; return 0; }
  legal_dates_on_switch "$current" "$target"
  echo "Atual: $current -> nova: $target"
  echo "ROLLBACK, se precisar: PROJECT=$PROJECT REVISAO=$current ./infra/producao/deploy.sh rollback"
  g run services update-traffic "$SERVICE" --region="$REGION" --to-revisions="$target=100" --quiet
  echo "== teste rápido do serviço no ar"
  smoke "$(run_url)" || { echo "FALHOU depois da virada. Volte: PROJECT=$PROJECT REVISAO=$current ./infra/producao/deploy.sh rollback" >&2; exit 1; }
  echo "no ar: $target. Revisão anterior mantida: $current"
}

# Atalho: conferências, build, migração e candidata SEM tráfego. A virada é sempre um comando à parte (`virar`).
cmd_deploy() {
  cmd_conferir; require_confirmations
  cmd_build
  export IMAGE; IMAGE="$(release_image)"
  echo "== migração (job com a conexão direta; só a conta de deploy lê o segredo)"
  cmd_migrate
  cmd_candidata
}

cmd_hosting() {
  # Publica os rewrites do firebase.json no Firebase Hosting pela API REST, com o token do gcloud (sem login interativo do Firebase CLI).
  # O site padrão do projeto serve em https://$PROJECT.web.app. Tudo (/api/** e **) vai para o Cloud Run; não há arquivos estáticos no Hosting.
  local token base body version
  token="$(gcloud auth print-access-token)"; base="https://firebasehosting.googleapis.com/v1beta1"
  body="$(SERVICE="$SERVICE" REGION="$REGION" node -e "
    const c=JSON.parse(require('fs').readFileSync('firebase.json','utf8')).hosting;
    const run={serviceId:process.env.SERVICE,region:process.env.REGION};
    console.log(JSON.stringify({config:{rewrites:c.rewrites.map(r=>({glob:r.source,run}))}}));")"
  local H=(-H "Authorization: Bearer $token" -H "x-goog-user-project: $PROJECT" -H "content-type: application/json")
  version="$(curl -fsS -X POST "${H[@]}" -d "$body" "$base/sites/$PROJECT/versions" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).name))")"
  curl -fsS -X PATCH "${H[@]}" -d '{"status":"FINALIZED"}' "$base/$version?update_mask=status" >/dev/null
  curl -fsS -X POST "${H[@]}" "$base/sites/$PROJECT/releases?versionName=$version" >/dev/null
  echo "Hosting publicado: https://$PROJECT.web.app -> Cloud Run $SERVICE ($REGION). Versão: $version"
}

# --- Dias de evento: instância sempre quente. LEMBRE de desligar depois. ---
# Instância mínima NO SERVIÇO (--min; anotação run.googleapis.com/minScale nos metadados do serviço): vale para a revisão que recebe
# o tráfego, sem criar revisão nova, e continua valendo nas viradas seguintes. Até 18/10/2026 usava --min-instances, que é da revisão:
# criava uma revisão nova, e ela ficava com 0% porque o tráfego fica preso à revisão virada (o site do público seguia dormindo).
cmd_evento_on() {
  g run services update "$SERVICE" --region="$REGION" --min=1 --quiet
  echo "EVENTO ON: 1 instância mínima no serviço (servidor sempre acordado), sem revisão nova."
  echo "Custo da instância parada (catálogo do Cloud Billing em 18/10/2026, São Paulo, Tier 2, 1 vCPU e 512 MiB): cerca de R\$ 0,11 por hora,"
  echo "R\$ 2,69 por dia; esquecida ligada o mês inteiro, cerca de R\$ 81 (o orçamento do projeto é de R\$ $BUDGET_BRL)."
  echo "=> Desligar: ./infra/producao/deploy.sh evento-off"
}
cmd_evento_off() {
  g run services update "$SERVICE" --region="$REGION" --min=default --quiet
  echo "EVENTO OFF: sem instância mínima no serviço (escala a zero, sem custo parado)."
}

# --- Manutenção (G06): o site inteiro mostra a página de indisponibilidade com o contato da PartyX. Webhook e rotinas seguem no ar. ---
# Depois da virada o tráfego fica PRESO à revisão virada (update-traffic --to-revisions): um `services update` cria a revisão nova com
# 0%. Por isso cada troca rápida de variável leva o tráfego para a revisão recém-criada (--to-latest). Verificado em 14/10/2026.
cmd_manutencao() {
  case "${1:-}" in
    on) g run services update "$SERVICE" --region="$REGION" --update-env-vars=MAINTENANCE_MODE=true --quiet
        g run services update-traffic "$SERVICE" --region="$REGION" --to-latest --quiet
        echo "MANUTENÇÃO LIGADA: site, painel e portaria fechados (503). Webhook do gateway e rotinas internas continuam."
        echo "=> Para desligar: ./infra/producao/deploy.sh manutencao off" ;;
    off) g run services update "$SERVICE" --region="$REGION" --update-env-vars=MAINTENANCE_MODE=false --quiet
         g run services update-traffic "$SERVICE" --region="$REGION" --to-latest --quiet
         echo "MANUTENÇÃO DESLIGADA." ;;
    *) echo "use: manutencao on|off" >&2; exit 1 ;;
  esac
}

cmd_rollback() {
  local target="${REVISAO:-}"
  if [ -z "$target" ]; then   # a revisão pronta mais recente que NÃO é a que recebe tráfego agora
    local current; current="$(g run services describe "$SERVICE" --region="$REGION" --format='value(status.traffic[0].revisionName)')"
    target="$(g run revisions list --service="$SERVICE" --region="$REGION" --format='value(metadata.name)' --sort-by='~metadata.creationTimestamp' | grep -vx "$current" | head -1)"
    [ -n "$target" ] || { echo "Nenhuma revisão anterior encontrada." >&2; exit 1; }
    echo "Atual: $current -> voltando para: $target"
  fi
  g run services update-traffic "$SERVICE" --region="$REGION" --to-revisions="$target=100"
  echo "feito. Migração de banco NÃO é desfeita por aqui (ver README-DEPLOY.md, seção Rollback)."
}

cmd_status() {
  g run services describe "$SERVICE" --region="$REGION" \
    --format='table[box](status.url:label=URL,status.traffic[0].revisionName:label=REVISAO,metadata.annotations["run.googleapis.com/minScale"]:label=MIN_SERVICO,spec.template.metadata.annotations["autoscaling.knative.dev/minScale"]:label=MIN_REVISAO,spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"]:label=MAX)'
  local min_svc min_rev
  min_svc="$(g run services describe "$SERVICE" --region="$REGION" --format='value(metadata.annotations["run.googleapis.com/minScale"])')"
  min_rev="$(g run services describe "$SERVICE" --region="$REGION" --format='value(spec.template.metadata.annotations["autoscaling.knative.dev/minScale"])')"
  [ -z "$min_svc" ] || [ "$min_svc" = "0" ] || echo "ATENÇÃO: instância mínima no serviço = $min_svc (sempre ligada, gera custo). Se a janela acabou: evento-off"
  [ -z "$min_rev" ] || [ "$min_rev" = "0" ] || echo "ATENÇÃO: instância mínima na revisão = $min_rev (do --min-instances antigo; o evento-off não tira: publique sem MIN_INSTANCES)"
  g tasks queues describe "$QUEUE" --location="$REGION" --format='value(name,state)' || true
  g scheduler jobs list --location="$REGION" --format='table(name.basename(),schedule,state)' || true
}

cmd_alertas() { : "${NOTIFY_EMAIL:?informe NOTIFY_EMAIL}"; PROJECT="$PROJECT" SERVICE="$SERVICE" NOTIFY_EMAIL="$NOTIFY_EMAIL" ./infra/operacao/alerts.sh; }

case "${1:-}" in
  setup) cmd_setup ;; banners-iam) cmd_banners_iam ;; roles) cmd_roles ;; backup) cmd_backup ;; varredura) cmd_varredura ;; migrate) cmd_migrate ;; deploy) cmd_deploy ;; hosting) cmd_hosting ;;
  conferir) cmd_conferir ;; build) cmd_build ;; candidata) cmd_candidata ;; virar) cmd_virar ;;
  evento-on) cmd_evento_on ;; evento-off) cmd_evento_off ;; rollback) cmd_rollback ;; status) cmd_status ;; alertas) cmd_alertas ;;
  manutencao) cmd_manutencao "${2:-}" ;;
  *) sed -n '2,40p' "$0"; exit 1 ;;
esac
