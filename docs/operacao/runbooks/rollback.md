# Runbook: voltar a versão anterior (rollback)

Plano de retorno: a revisão anterior do Cloud Run continua disponível (o `deploy.sh` não apaga revisões). **Trocar de revisão é rápido e seguro; desfazer migração de banco não é.**

## Só o código (o caso normal)
0. **Produção, revisão sem a correção do pool** (commit `184da3c`; a `partyx-00040-dow` e anteriores): se a verificação de saúde estiver em `/api/health`, volte-a para `/api/health/ready` **antes** do passo 2 (comando no README-DEPLOY, seção 6). Sem a correção, o Neon dormindo derruba o processo.
1. `gcloud run revisions list --service=<serviço> --region=<região>`
2. `gcloud run services update-traffic <serviço> --region=<região> --to-revisions=<revisão-anterior>=100`
3. Conferir `/api/health/ready` e a página inicial. Registrar.

## Quando a revisão nova tinha migração
Cada migração tem a reversão em `drizzle/rollback/`, mas **não verifiquei uma a uma se o código anterior funciona com o esquema novo** (a `0003` altera ou remove algo). Leia a migração da revisão antes de decidir. Em produção `npm run db:rollback` é **bloqueado de propósito**: reverter é decisão humana, com backup recente, por SQL revisado.
1. Primeiro tente só voltar a revisão: o código antigo costuma funcionar com o esquema novo (colunas a mais). Se funcionar, **pare aí**.
2. Se não funcionar: backup do momento, avalie o SQL de reversão da migração, revise com outra pessoa e aplique com a conexão direta. Se envolveu perda de dados, use `restauracao.md`.
3. Nunca reverter com venda aberta sem avisar a PartyX.

## Depois
Causa, correção, novo teste em homologação, nova publicação. Registrar em `../registro-rotinas.md`.
