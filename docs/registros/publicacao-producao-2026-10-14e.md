# Publicação em produção: texto longo e mensagens sem "ambiente" (14/10/2026)

Pedido do responsável (Arthur) nesta sessão: corrigir de forma geral o texto longo digitado (site, PDFs, e-mails), trocar "As vendas ainda não foram abertas neste ambiente." e, "ao terminar, faça deploy em produção". Detalhes da mudança: `textos-longos-2026-10-14.md`.

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-14e`, commit `a437388`; sem migração; `env.prod.yaml` e `conteudo-legal/` iguais aos da `release-2026-10-14d` |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-14e-a437388` (Cloud Build `2df699a2`, 1 min 53 s) |
| Revisão no ar | `partyx-00012-vem`, 100% |
| Revisão anterior | `partyx-00010-ced` (mantida; referência de retorno) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada**, Termos e Privacidade 1.1, Termo de Ciência e autorização 1.0 |

## Antes de publicar (local)

- `npm run lint` (0 erros), `npm run typecheck`, `npm run test:db` (1.024 + 4 testes, nenhum pulado) e `npm run build`: ok.
- `npm run e2e:textos`: 26 telas × 360, 768 e 1280 px com textos no limite, 78 de 78.

## Linha do tempo (UTC)

| Hora | Passo | Resultado |
|---|---|---|
| 20:22 a 20:24 | `deploy.sh build` da `release-2026-10-14e` | imagem pronta |
| 20:24 | `infra/operacao/check-backup.sh` | ok: cópia `partyx-20261014T190131Z.dump` de hoje (19:01). Sem migração, não foi feito backup novo |
| 20:25 | `deploy.sh candidata` | revisão `partyx-00012-vem` sem tráfego; teste rápido 14 de 14 |
| 20:25 a 20:26 | `deploy.sh virar` | 100% na `partyx-00012-vem`; teste rápido 14 de 14 |
| 20:27 | Bateria por HTTPS em `partyx.com.br` | 21 de 21 (saúde, textos 1.1 e 1.0, contatos, venda fechada, cadastro vazio 422, webhook inválido 401, HSTS, CSP, `www` 308, `run.app` direto 403). O CSS servido traz a regra nova; nos scripts, só a frase nova ("As vendas deste evento ainda não estão abertas.") |
| 20:28 | Páginas públicas sem login (início, eventos, entrar, cadastro, Termos, Termo de Ciência) a 360, 768 e 1280 px | sem rolagem horizontal. Nos Termos, as quebras em hífen ou barra ("e-mail", CNPJ) são quebra normal do texto corrido, que já existia |

Sem mudança na Vercel, nas rotinas e na verificação de saúde.

## Voltar atrás

> Atualização de 15/10/2026 02:09 UTC: a `partyx-00014-bax` (termo revisto, sem autorização judicial, migração 0010) substituiu a `00012-vem`. A referência de retorno atual está em `publicacao-producao-2026-10-14f.md`.

- **Referência de retorno a partir daqui: `partyx-00012-vem`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00010-ced ./infra/producao/deploy.sh rollback` (mesmo banco, mesmos textos; volta só o leiaute e as frases antigas).

## Pendente

- Ver com evento real cadastrado e vendas abertas: as telas de compra só foram conferidas com dados fictícios no ambiente local.
- O que já estava pendente segue em `publicacao-producao-2026-10-14d.md` (e-mail sem SMTP, evento real com menores, prova da aprovação do Bernardo, Política de Cancelamento).
