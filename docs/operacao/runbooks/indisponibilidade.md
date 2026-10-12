# Runbook: plataforma indisponível

**Gravidade:** crítica quando tudo está fora (primeira resposta em até 4 horas úteis). Em dia de evento, avise a PartyX para ir à **lista impressa** (`portaria.md`) sem esperar.

1. **Confirme** de fora: `curl -s https://<endereço>/api/health` (sem banco) e `/api/health/ready` (com banco). Teste de outra rede.
2. **Só `ready` falha:** problema no banco ou na conexão. Veja o painel do Neon (projeto suspenso? limite de conexões? fora do ar?). Autosuspend do Neon acorda sozinho em segundos; se persiste, escale a computação ou abra chamado no Neon. `npm run db:check` (com as URLs) mostra qual conexão falha, sem imprimir segredos.
3. **`health` também falha:** Cloud Run. `gcloud run services describe <serviço> --region=<região>` (última revisão pronta, tráfego) e `gcloud run services logs read <serviço> --region=<região> --limit=50`. Revisão nova com erro de configuração (`Configuração inválida: ...`)? Faça **rollback** (`rollback.md`).
4. **Pico de tráfego:** 429/503 com muita carga. Suba `--max-instances` temporariamente (custo: avisar o cliente se passar do previsto).
5. **Gateway fora** não derruba a plataforma: a venda de Pix e cartão falha com mensagem clara. Ver `gateway.md`.
6. Quando voltar: confira `ops:weekly` (webhooks pendentes), rode a varredura (`gcloud scheduler jobs run partyx-varredura-diaria --location=<região>`) e verifique pedidos pendentes.
7. **Registre** início, fim, causa, impacto (vendas perdidas?) e ação em `../registro-rotinas.md`, e informe a PartyX por escrito.

## Página de manutenção (G06)

Para manutenção planejada ou quando o site está de pé mas não deve atender (ex.: correção de dados, banco em restauração):

- **Ligar:** `PROJECT=<projeto> ./infra/producao/deploy.sh manutencao on` (cria uma revisão nova só com `MAINTENANCE_MODE=true`, sem build). **Desligar:** `... manutencao off`. Em homologação: `gcloud run services update partyx-hml --region=<região> --update-env-vars=MAINTENANCE_MODE=true`.
- **O que fecha:** o site inteiro, inclusive **painel e portaria** (página 503 sem cache, com o contato da PartyX dos `PARTYX_SUPPORT_*` e sem prometer prazo nem atendimento 24 horas). Quem estava com o site aberto vê o mesmo aviso na próxima chamada à API.
- **O que continua:** `/api/health`, o webhook do gateway (`/api/webhooks/*`) e as rotinas internas (`/api/internal/*`): nenhum pagamento se perde, e ingressos continuam sendo emitidos.
- **Para fechar só a venda** (portaria e painel funcionando, por exemplo em dia de evento), use `SALES_OPEN=false`, não a manutenção. Com a manutenção ligada em dia de evento, a portaria vai para a **lista impressa** (`portaria.md`).
- Um `deploy` normal volta `MAINTENANCE_MODE` para `false`, a menos que a variável seja passada.
- Queda total do Cloud Run não mostra esta página (quem responde é o Firebase Hosting). Ela é para indisponibilidade **decidida**.
