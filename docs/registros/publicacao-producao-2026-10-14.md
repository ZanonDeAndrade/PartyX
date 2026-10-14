# Publicação em produção: cadastro aberto (14/10/2026)

Autorização: `autorizacao-cadastro-producao-2026-10-14.md` (Bernardo pelo WhatsApp às 10:00 e Arthur). Pedido do responsável nesta sessão: OK para tag, build, conferência do backup e candidata, e em seguida o deploy em produção.

| Campo | Registro |
|---|---|
| Versão | tag `release-2026-10-14b`, commit `4009917` (sobre `ab72ed5`); sem migração nova |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-14b-4009917` (Cloud Build `2fb6f052`, 2 min) |
| Textos legais na imagem | Da tag: `termos-de-uso.txt` (sha256 `ba3d38f63f23431a`) e `privacidade.txt` (sha256 `69a379ecbb575ffc`), versão 1.0, vigência 2026-10-14 |
| Revisão no ar | `partyx-00008-gaz`, 100% |
| Revisão anterior | `partyx-00003-xeq` (mantida; ver "Voltar atrás" abaixo) |
| Estado | **Cadastro aberto, venda fechada** (`SIGNUP_OPEN=true`, `SALES_OPEN=false`), `PUBLIC_BASE_URL=https://partyx.com.br` |

## Linha do tempo (UTC)

| Hora | Passo | Resultado |
|---|---|---|
| 17:53 | `deploy.sh build` da `release-2026-10-14b` | ok; textos conferidos iguais aos da tag |
| 17:54 | `check-backup.sh` | ok: cópia das 06:00 UTC de hoje |
| 17:55 a 17:56 | `deploy.sh candidata` | revisão `partyx-00008-gaz` sem tráfego; teste rápido 12 de 12, inclusive cadastro aberto e Termos e Privacidade oficiais, versão 1.0, vigência 2026-10-14, pela API pública |
| 17:56 | **Efeito colateral:** `partyx.com.br` passou a servir a candidata já neste momento | a Vercel apontava para a etiqueta `candidata` (de propósito, para testar a cadeia antes da virada); o `web.app` seguiu na `00003` até a virada |
| 17:56 | `deploy.sh virar` | 100% na `partyx-00008-gaz`; teste rápido 12 de 12 no serviço |
| 17:57 | Vercel: destino do rewrite trocado para o endereço principal do serviço e publicado (`vercel@64.0.2 deploy --prod`) | publicação `partyx-dominio-1gwc9h15a` em produção, com `partyx.com.br` e `www` |
| 17:57 | `deploy.sh varredura` | rotina diária com `X-Forwarded-Host=partyx.com.br` (antes `partyx-producao.web.app`); rotina nova `partyx-limpeza-retencao` às 04:05 (3º job da conta de faturamento, dentro da cota grátis) |
| 17:57 | Execução manual das duas rotinas | `reconcile-payments` 200 e `purge-retention` 200, na `00008-gaz`; limpeza sem nada a apagar e nenhum prazo pulado |
| 17:58 | `uptime.sh` com `NAME=partyx-saude-dominio` | verificação de `https://partyx.com.br/api/health/ready` a cada 5 min e política "PartyX: saúde indisponível (partyx.com.br)", avisando o canal da operação |
| 17:59 | Apagadas a verificação `partyx-saude-publica` (web.app) e a política "PartyX: saúde indisponível", que só vigiava ela | 16 políticas ativas |
| 18:00 | Bateria por HTTPS em `partyx.com.br` | 25 de 25: páginas, saúde, cadastro aberto (POST vazio dá 422, não 503), venda fechada, textos oficiais, cancelamento pendente, dados da PartyX, webhook inválido 401, HSTS, CSP, API sem cache, http para https e www para a raiz (308), `run.app` direto 403, `web.app` 403 (aceito em 14/10) |

## Voltar atrás ou fechar o cadastro

- **Fechar só o cadastro (rápido, cerca de 1 minuto):** o tráfego está preso à revisão virada, então são dois comandos. Depois, ponha `SIGNUP_OPEN: "false"` no `env.prod.yaml`, senão a próxima publicação reabre.
  ```
  export CLOUDSDK_CORE_PROJECT=partyx-producao
  gcloud run services update partyx --region=southamerica-east1 --update-env-vars=SIGNUP_OPEN=false --quiet
  gcloud run services update-traffic partyx --region=southamerica-east1 --to-latest --quiet
  ```
- **Referência de retorno a partir daqui: `partyx-00008-gaz`** (na próxima publicação: `PROJECT=partyx-producao REVISAO=partyx-00008-gaz ./infra/producao/deploy.sh rollback`).
- **Rollback para a `partyx-00003-xeq`:** só como volta de emergência. Aquela revisão espera o `web.app` e responde 403 em `partyx.com.br`; exige também voltar o cabeçalho da rotina diária (`docs/operacao/vercel.md`, "Volta de emergência").
- `deploy.sh manutencao on|off` foi corrigido nesta data: antes criava a revisão nova sem tráfego (a manutenção não entraria no ar com o tráfego preso).

## O que ficou pendente

- **E-mail:** `smtp-url` sem versão. Cada cadastro gera um e-mail de boas-vindas que falha 4 vezes (cerca de 42 minutos) e dispara o alerta `email_falhou`; a recuperação de senha não chega. Sai quando o Resend for verificado e o segredo ganhar valor (checklist 2.4).
- **Teste real de cadastro** pelo responsável no navegador, com conferência no log e no banco sem expor dados pessoais.
- Confirmação escrita da PartyX sobre os Termos 1.0 e a Privacidade 1.0, a arquivar.
- Política de Cancelamento (exigida para vender, D-84).
