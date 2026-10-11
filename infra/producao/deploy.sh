#!/usr/bin/env bash
# PartyX em PRODUÇÃO: Google Cloud (Cloud Run + Cloud Tasks) + Firebase Hosting na frente + Neon (fora do Google).
# NÃO FOI EXECUTADO. Idempotente onde dá. Uso: ./infra/producao/deploy.sh <comando>
#
#   setup        cria o projeto (opcional), APIs, contas de serviço, fila, buckets, segredos e orçamento
#   varredura    cria a rotina diária das 04:00 (Cloud Scheduler) e remove a varredura de 5 min, se existir; rode depois do 1º deploy
#   roles        cria os papéis partyx_app (aplicação) e partyx_backup (só leitura) NO NEON e grava as URLs nos segredos. ANTES da 1ª migração
#   backup       backup diário: imagem, job, agendamento às 03:00 e alertas (infra/backup/setup.sh). Depois de `roles` e do `setup`
#   migrate      roda as migrações (Cloud Run Job com a conexão direta do Neon)
#   deploy       build + migração + publicação no Cloud Run + teste rápido
#   hosting      publica o firebase.json (rewrites para o Cloud Run) no Firebase Hosting
#   evento-on    min-instances=1: instância sempre quente (use ANTES do evento)
#   evento-off   min-instances=0: volta a escalar a zero (use DEPOIS do evento)
#   rollback     volta para a revisão anterior (ou REVISAO=<nome>)
#   status       mostra o que está no ar, a configuração e avisos de custo
#   alertas      cria os alertas por log (infra/operacao/alerts.sh)
#
# Variáveis OBRIGATÓRIAS (sem padrão, para ninguém criar custo na conta errada):
#   PROJECT           id do projeto de produção (ex.: partyx-prod)
#   BILLING_ACCOUNT   conta de faturamento (só no `setup`)
# Opcionais:   REGION=southamerica-east1  SERVICE=partyx  BUDGET_BRL=30  CREATE_PROJECT=1
#   PUBLIC_BASE_URL   endereço público em HTTPS (obrigatório no `deploy`): https://seudominio.com.br
#   TRUSTED_PROXY_HOPS=2   MEDIDO atrás do Firebase Hosting em 05/10/2026 (ver README-DEPLOY.md). Direto no Cloud Run seria 1.
#   MIN_INSTANCES=0  MAX_INSTANCES=3  NOTIFY_EMAIL=<e-mail dos alertas>
#   RECONCILE_TASK_OFFSETS_SECONDS=60,120,240,480  RECONCILE_TASK_MARGIN_SECONDS=120
#   RECONCILE_LATE_OFFSETS_SECONDS=900,1800,3600,10800,28800,86400  RECONCILE_LOCK_SECONDS=120   (padrões do código; só passe para mudar)
#   PARTYX_SUPPORT_EMAIL  PARTYX_SUPPORT_WHATSAPP   contato de atendimento DA PARTYX para o comprador (nunca o da contratada)
set -euo pipefail
cd "$(dirname "$0")/../.."

: "${PROJECT:?informe PROJECT (id do projeto de produção)}"
case "$PROJECT" in *hml*|*homolog*) echo "PROJECT parece de homologação: $PROJECT" >&2; exit 1;; esac
REGION="${REGION:-southamerica-east1}"        # São Paulo (Tier 2), junto do Neon aws-sa-east-1
SERVICE="${SERVICE:-partyx}"
BUDGET_BRL="${BUDGET_BRL:-30}"
QUEUE="partyx-conciliacao"
REPO="partyx"
JOB="partyx-migrate"
SWEEP_JOB="partyx-varredura-diaria"
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
# sem pedido em aberto, nada roda e o Neon dorme (D-78). Com o backup das 03:00, são 2 jobs no Scheduler. Rodar depois do 1º deploy.
cmd_varredura() {
  : "${PUBLIC_BASE_URL:?informe PUBLIC_BASE_URL para o X-Forwarded-Host da varredura}"
  local url host; url="$(run_url)"; host="$(public_host)"
  local verb=create; exists g scheduler jobs describe "$SWEEP_JOB" --location="$REGION" && verb=update
  g scheduler jobs "$verb" http "$SWEEP_JOB" --location="$REGION" --schedule="0 4 * * *" --time-zone="America/Sao_Paulo" \
    --uri="$url/api/internal/jobs/reconcile-payments" --http-method=POST \
    --headers="X-Forwarded-Host=$host" \
    --oidc-service-account-email="$(sa $SCHED_SA)" --oidc-token-audience="$url" --attempt-deadline=120s --max-retry-attempts=1
  echo "Rotina diária às 04:00 (America/Sao_Paulo) -> $url"
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
  : "${IMAGE:?use via 'deploy', ou informe IMAGE=<imagem>}"
  local verb=create; exists g run jobs describe "$JOB" --region="$REGION" && verb=update
  g run jobs "$verb" "$JOB" --region="$REGION" --image="$IMAGE" --service-account="$(sa $DEPLOY_SA)" \
    --set-secrets=DATABASE_URL_DIRECT=database-url-direct:latest --set-env-vars=APP_ENV=producao \
    --command=node --args=dist-server/migrate.js --max-retries=0 --task-timeout=300s --quiet
  g run jobs execute "$JOB" --region="$REGION" --wait
}

cmd_deploy() {
  : "${PUBLIC_BASE_URL:?informe PUBLIC_BASE_URL (https://seudominio.com.br; antes do domínio, https://${PROJECT}.web.app)}"
  local sales="${SALES_OPEN:-false}" gateway="${PAYMENT_GATEWAY:-none}"
  # Proteção contra ambiente trocado (cada uma recusa ANTES do build):
  #  1) o banco precisa declarar que é de PRODUÇÃO (marca no próprio banco) e as URLs pooled e direta precisam ser do mesmo banco;
  #  2) credenciais de gateway de SANDBOX nunca entram em produção; com gateway real, GATEWAY_ENVIRONMENT=producao é obrigatório.
  [ "${GATEWAY_ENVIRONMENT:-}" != "sandbox" ] || { echo "Recuso: credenciais de SANDBOX do gateway em produção." >&2; exit 1; }
  [ "${PAYMENT_GATEWAY:-none}" = "none" ] || [ "${GATEWAY_ENVIRONMENT:-}" = "producao" ] || { echo "Recuso: com gateway configurado, informe GATEWAY_ENVIRONMENT=producao." >&2; exit 1; }
  [ "${PAYMENT_GATEWAY:-none}" != "mock" ] || { echo "Recuso: o gateway fictício não existe em produção." >&2; exit 1; }
  # Turnstile: OPCIONAL e DESLIGADO por padrão em produção (decisão de 06/10/2026). Para ligar: TURNSTILE_ENABLED=true com as DUAS chaves
  # (README-DEPLOY.md, seção 8b). Ligado sem as chaves, recusa aqui, antes do build e da migração. A chave de TESTE da Cloudflare não vale em produção.
  if [ "${TURNSTILE_ENABLED:-false}" = "true" ]; then
    [ -n "${TURNSTILE_SITE_KEY:-}" ] || { echo "Recuso: TURNSTILE_ENABLED=true exige TURNSTILE_SITE_KEY (chave PÚBLICA do site)." >&2; exit 1; }
    [ -n "$(g secrets versions list turnstile-secret --limit=1 --filter='state=ENABLED' --format='value(name)' 2>/dev/null)" ] \
      || { echo "Recuso: TURNSTILE_ENABLED=true exige o segredo turnstile-secret com valor (chave SECRETA)." >&2; exit 1; }
  fi
  local direct pooled
  direct="$(g secrets versions access latest --secret=database-url-direct 2>/dev/null || true)"; pooled="$(g secrets versions access latest --secret=database-url 2>/dev/null || true)"
  { [ -n "$direct" ] && [ -n "$pooled" ]; } || { echo "Recuso: database-url e database-url-direct precisam ter valor (rode 'roles')." >&2; exit 1; }
  DATABASE_URL_DIRECT="$direct" DATABASE_URL_POOLED="$pooled" npm run -s db:env -- check producao || { echo "Recuso: o banco apontado NÃO é o de produção." >&2; exit 1; }
  # Travas de TODA publicação (a migração só se desfaz restaurando backup):
  [ "${BACKUP_DONE:-}" = "sim" ] || { echo "Recuso: backup diário ativo e restauração testada são PRÉ-REQUISITO (BACKUP_DONE=sim). Prompt 25." >&2; exit 1; }
  [ "${NO_FICTITIOUS_DATA:-}" = "sim" ] || { echo "Recuso: confirme banco sem dados fictícios (NO_FICTITIOUS_DATA=sim)." >&2; exit 1; }
  if [ "$sales" = "true" ]; then   # travas extras para ABRIR A VENDA (go-live)
    [ "$gateway" != "none" ] || { echo "Recuso: venda aberta sem gateway real." >&2; exit 1; }
    for v in TERMS_VERSION PRIVACY_VERSION CANCELLATION_VERSION GO_LIVE_CONFIRMED; do [ -n "${!v:-}" ] || { echo "Recuso: $v é obrigatório para abrir a venda." >&2; exit 1; }; done
    [ "$GO_LIVE_CONFIRMED" = "sim-aceite-e-autorizacao-registrados" ] || { echo "Recuso: registre aceite/autorização e use GO_LIVE_CONFIRMED=sim-aceite-e-autorizacao-registrados." >&2; exit 1; }
    [ "${VISUAL_APPROVED:-}" = "true" ] || { echo "Recuso: identidade visual sem aprovação escrita (CA-33)." >&2; exit 1; }
  fi
  local tag="${TAG:-$(date -u +%Y%m%d-%H%M%S)}" url host; url="$(run_url)"; host="$(public_host)"
  export IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/partyx-api:$tag"

  echo "== build $tag (Cloud Build, manual: só roda quando você chama)"
  g builds submit . --region="$REGION" --tag="$IMAGE" --quiet
  # O Cloud Build guarda o código enviado num bucket próprio (criado no 1º build); limpa depois de 7 dias para não acumular custo.
  echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":7}}]}' > "${TMPDIR:-/tmp}/cb-lifecycle.json"
  gcloud storage buckets update "gs://${PROJECT}_cloudbuild" --lifecycle-file="${TMPDIR:-/tmp}/cb-lifecycle.json" >/dev/null 2>&1 || true
  echo "== migração (job com a conexão direta; só a conta de deploy lê o segredo)"
  cmd_migrate

  echo "== deploy (venda aberta: $sales)"
  # Variáveis em uma lista; o delimitador do gcloud é "#" (os valores têm vírgulas e e-mails com "@").
  local vars=(NODE_ENV=production APP_ENV=producao "DB_POOL_MAX=5" "TRUSTED_PROXY_HOPS=${TRUSTED_PROXY_HOPS:-2}"
    "PUBLIC_BASE_URL=$PUBLIC_BASE_URL" "BANNER_BUCKET=$BANNERS" "JOBS_AUDIENCE=$url"
    "JOBS_CALLER_EMAIL=$(sa $SCHED_SA),$(sa $TASKS_SA)"
    "TASKS_QUEUE=projects/$PROJECT/locations/$REGION/queues/$QUEUE" "TASKS_INVOKER_EMAIL=$(sa $TASKS_SA)"
    "TURNSTILE_ENABLED=${TURNSTILE_ENABLED:-false}" "GLOBAL_SIGNUPS_PER_HOUR=${GLOBAL_SIGNUPS_PER_HOUR:-1000}" "SIGNUPS_PER_IP_PER_HOUR=${SIGNUPS_PER_IP_PER_HOUR:-100}" "GLOBAL_RECOVERIES_PER_HOUR=${GLOBAL_RECOVERIES_PER_HOUR:-60}"
    ${GATEWAY_ENVIRONMENT:+"GATEWAY_ENVIRONMENT=$GATEWAY_ENVIRONMENT"}
    "QR_HMAC_CURRENT=${QR_HMAC_CURRENT:-1}" "SALES_OPEN=$sales" "PAYMENT_GATEWAY=$gateway" "VISUAL_APPROVED=${VISUAL_APPROVED:-false}")
  for v in TERMS_VERSION PRIVACY_VERSION CANCELLATION_VERSION EMAIL_FROM EMAIL_REPLY_TO RESERVATION_MINUTES MAX_TICKETS_PER_ORDER \
           RETENTION_LOGIN_ATTEMPTS_DAYS RETENTION_SESSIONS_DAYS RETENTION_PASSWORD_RESETS_DAYS GATE_SCANS_PER_MINUTE GATE_SEARCHES_PER_MINUTE \
           RECONCILE_TASK_OFFSETS_SECONDS RECONCILE_TASK_MARGIN_SECONDS RECONCILE_LATE_OFFSETS_SECONDS RECONCILE_LOCK_SECONDS \
           PARTYX_SUPPORT_EMAIL PARTYX_SUPPORT_WHATSAPP; do
    [ -z "${!v:-}" ] || vars+=("$v=${!v}")
  done
  [ "${TURNSTILE_ENABLED:-false}" != "true" ] || vars+=("TURNSTILE_SITE_KEY=$TURNSTILE_SITE_KEY")
  local joined; joined="$(IFS='#'; echo "${vars[*]}")"
  # Cobrança por requisição (CPU só durante a requisição), 1 vCPU/512 MiB, concorrência 80, teto de 3 instâncias (teto REAL de gasto).
  # Precisa aceitar chamadas sem login: o Firebase Hosting, o Cloud Tasks e o Scheduler chamam por HTTPS; quem protege é o código (OIDC/sessão).
  # Segredos obrigatórios sempre; SMTP e Turnstile só entram se o segredo já tem valor (o Cloud Run recusa montar segredo sem versão).
  local secrets="DATABASE_URL=database-url:latest,SESSION_SECRET=session-secret:latest,QR_HMAC_KEYS=qr-hmac-keys:latest"
  local pairs=(SMTP_URL=smtp-url); [ "${TURNSTILE_ENABLED:-false}" != "true" ] || pairs+=(TURNSTILE_SECRET=turnstile-secret)
  for pair in "${pairs[@]}"; do
    [ -z "$(g secrets versions list "${pair#*=}" --limit=1 --format='value(name)' 2>/dev/null)" ] || secrets="$secrets,${pair%%=*}=${pair#*=}:latest"
  done
  g run deploy "$SERVICE" --region="$REGION" --image="$IMAGE" --service-account="$(sa $APP_SA)" \
    --allow-unauthenticated --port=8080 --cpu=1 --memory=512Mi --concurrency=80 --timeout=60 --cpu-throttling --cpu-boost \
    --min-instances="${MIN_INSTANCES:-0}" --max-instances="${MAX_INSTANCES:-3}" \
    --set-env-vars="^#^${joined}" \
    --set-secrets="$secrets" \
    --labels="$LABELS" --quiet

  echo "== teste rápido em $url (sem abrir venda pública)"
  for i in 1 2 3 4 5; do
    curl -fsS "$url/api/health/ready" | grep -q '"database":"ok"' && break
    [ "$i" = 5 ] && { echo "FALHOU: /api/health/ready" >&2; exit 1; }; sleep 3
  done
  curl -fsS "$url/api/health" >/dev/null
  curl -fsS -H "X-Forwarded-Host: $host" "$url/api/public/site" | grep -q "\"salesOpen\":$sales" || { echo "FALHOU: salesOpen difere do esperado" >&2; exit 1; }
  curl -fsSI "$url/api/health" | tr -d '\r' | grep -qi '^cache-control: private, no-store' || { echo "FALHOU: /api sem Cache-Control private, no-store" >&2; exit 1; }
  echo "pronto. Ajuda para voltar: ./infra/producao/deploy.sh rollback"
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
cmd_evento_on() {
  g run services update "$SERVICE" --region="$REGION" --min-instances=1 --quiet
  echo "EVENTO ON: min-instances=1 (sem cold start). Custo da instância parada: CPU+memória em tarifa reduzida, cerca de US\$ 0,014/hora"
  echo "no preço do Tier 1 (São Paulo é Tier 2, um pouco mais: confira cloud.google.com/run/pricing). Esquecido ligado o mês todo seria ~US\$ 10."
  echo "=> Depois do evento: ./infra/producao/deploy.sh evento-off"
}
cmd_evento_off() {
  g run services update "$SERVICE" --region="$REGION" --min-instances=0 --quiet
  echo "EVENTO OFF: min-instances=0 (escala a zero, sem custo parado)."
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
    --format='table[box](status.url:label=URL,status.traffic[0].revisionName:label=REVISAO,spec.template.metadata.annotations["autoscaling.knative.dev/minScale"]:label=MIN,spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"]:label=MAX)'
  local min; min="$(g run services describe "$SERVICE" --region="$REGION" --format='value(spec.template.metadata.annotations["autoscaling.knative.dev/minScale"])')"
  [ -z "$min" ] || [ "$min" = "0" ] || echo "ATENÇÃO: min-instances=$min (instância sempre ligada, gera custo). Se o evento acabou: evento-off"
  g tasks queues describe "$QUEUE" --location="$REGION" --format='value(name,state)' || true
  g scheduler jobs list --location="$REGION" --format='table(name.basename(),schedule,state)' || true
}

cmd_alertas() { : "${NOTIFY_EMAIL:?informe NOTIFY_EMAIL}"; PROJECT="$PROJECT" SERVICE="$SERVICE" NOTIFY_EMAIL="$NOTIFY_EMAIL" ./infra/operacao/alerts.sh; }

case "${1:-}" in
  setup) cmd_setup ;; roles) cmd_roles ;; backup) cmd_backup ;; varredura) cmd_varredura ;; migrate) cmd_migrate ;; deploy) cmd_deploy ;; hosting) cmd_hosting ;;
  evento-on) cmd_evento_on ;; evento-off) cmd_evento_off ;; rollback) cmd_rollback ;; status) cmd_status ;; alertas) cmd_alertas ;;
  *) sed -n '2,28p' "$0"; exit 1 ;;
esac
