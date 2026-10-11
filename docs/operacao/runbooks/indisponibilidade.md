# Runbook: plataforma indisponível

**Gravidade:** crítica quando tudo está fora (primeira resposta em até 4 horas úteis). Em dia de evento, avise a PartyX para ir à **lista impressa** (`portaria.md`) sem esperar.

1. **Confirme** de fora: `curl -s https://<endereço>/api/health` (sem banco) e `/api/health/ready` (com banco). Teste de outra rede.
2. **Só `ready` falha:** problema no banco ou na conexão. Veja o painel do Neon (projeto suspenso? limite de conexões? fora do ar?). Autosuspend do Neon acorda sozinho em segundos; se persiste, escale a computação ou abra chamado no Neon. `npm run db:check` (com as URLs) mostra qual conexão falha, sem imprimir segredos.
3. **`health` também falha:** Cloud Run. `gcloud run services describe <serviço> --region=<região>` (última revisão pronta, tráfego) e `gcloud run services logs read <serviço> --region=<região> --limit=50`. Revisão nova com erro de configuração (`Configuração inválida: ...`)? Faça **rollback** (`rollback.md`).
4. **Pico de tráfego:** 429/503 com muita carga. Suba `--max-instances` temporariamente (custo: avisar o cliente se passar do previsto).
5. **Gateway fora** não derruba a plataforma: a venda de Pix e cartão falha com mensagem clara. Ver `gateway.md`.
6. Quando voltar: confira `ops:weekly` (webhooks pendentes), rode a varredura (`gcloud scheduler jobs run partyx-varredura-diaria --location=<região>`) e verifique pedidos pendentes.
7. **Registre** início, fim, causa, impacto (vendas perdidas?) e ação em `../registro-rotinas.md`, e informe a PartyX por escrito.
