# Publicação em produção: regras de menores, textos 1.1 e contatos novos (14/10/2026)

Autorização: aprovação do Bernardo informada por Arthur (`aprovacao-menores-e-contatos-2026-10-14.md`). Pedidos do responsável nesta sessão: "O Bernardo já aprovou essas alterações, edite e coloque em produção, junto com a parte dos menores" e, em seguida, "pode seguir com a migração e a virada".

| Campo | Registro |
|---|---|
| Versão | tag `release-2026-10-14d`, commit `247534b` |
| Migração | `0009_menores_de_idade` (só expande: colunas novas anuláveis ou com padrão e tabela nova; reversão em `drizzle/rollback/0009_menores_de_idade.down.sql`, recusa se já houver prova de menor) |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-14d-247534b` (Cloud Build `74be3114`), digest `sha256:de3f7bfd7b08...` |
| Textos legais na imagem | Da tag, iguais à pasta `conteudo-legal/`: `termos-de-uso.txt` 1.1 (sha256 `a5cd126eabe6a468`), `privacidade.txt` 1.1 (`ee71d314ecf37d8b`), `termo-menor.txt` 1.0 (`a4623176794f6224`), `autorizacao-menor.txt` 1.0 (`7ca0fe8bc9b25f03`), todos com vigência 2026-10-14 |
| Revisão no ar | `partyx-00010-ced`, 100% |
| Revisão anterior | `partyx-00008-gaz` (mantida; referência de retorno) |
| Estado | **Cadastro aberto, venda fechada** (`SIGNUP_OPEN=true`, `SALES_OPEN=false`); rodapé só com CNPJ, atendimento `partyx992@gmail.com` e WhatsApp `+55 55 99156-6900`, sem endereço |

## Linha do tempo (UTC)

| Hora | Passo | Resultado |
|---|---|---|
| antes de 19:01 | Tag local `release-2026-10-14d` e `deploy.sh build` | ok; textos da imagem conferidos iguais aos da tag |
| 19:01 | Backup sob demanda (`gcloud run jobs execute partyx-backup --wait`) | execução `partyx-backup-gmhk6` ok; cópia `partyx-20261014T190131Z.dump` conferida por `check-backup.sh` |
| 19:03 a 19:04 | `deploy.sh migrate` | execução `partyx-migrate-67cxn` ok ("migrações aplicadas"); a `00008-gaz` seguiu respondendo com o banco ok |
| 19:04 | `deploy.sh candidata` | revisão `partyx-00010-ced` sem tráfego; teste rápido 14 de 14, inclusive cadastro aberto, venda fechada e os quatro textos oficiais com versão e vigência certas |
| 19:05 | `deploy.sh virar` | 100% na `partyx-00010-ced`; teste rápido 14 de 14 no serviço |
| 19:07 | Bateria por HTTPS em `partyx.com.br` | 21 de 21: saúde com banco ok, `/api/legal/versions` 1.1, Termos e Privacidade oficiais 1.1 com o e-mail e o WhatsApp novos e sem endereço, Termo de Ciência e autorização 1.0 oficiais, `/api/public/site` com venda fechada e `address` nulo, páginas `/`, `/termo-menor`, `/termos-de-uso`, `/privacidade`, `/entrar` e `/cadastro` 200, cadastro com corpo vazio 422, webhook inválido 401, autorização em branco de evento inexistente 404, HSTS, CSP, `www` 308, `run.app` direto 403 nos dois endereços |
| 19:08 | Rodapé lido no navegador a 360 px e 1280 px | só CNPJ, e-mail, WhatsApp e horário novos; sem rolagem horizontal |

Sem mudança na Vercel (já aponta para o endereço principal do serviço), nas rotinas (`partyx-varredura-diaria`, `partyx-limpeza-retencao`) e na verificação `partyx-saude-dominio`.

## Voltar atrás

> Atualização de 14/10/2026 20:25 UTC: a `partyx-00012-vem` (texto longo) substituiu a `00010-ced`. A referência de retorno atual está em `publicacao-producao-2026-10-14e.md`.

- **Referência de retorno a partir daqui: `partyx-00010-ced`.** Se esta revisão der problema antes da próxima publicação: `PROJECT=partyx-producao REVISAO=partyx-00008-gaz ./infra/producao/deploy.sh rollback`.
- A `00008-gaz` funciona com o banco já migrado (a 0009 só acrescenta colunas e tabelas), mas não conhece as regras de menores nem os textos 1.1: volta aos Termos e Privacidade 1.0 e ao rodapé com os contatos antigos. Não é preciso reverter a migração para voltar.
- Reverter a 0009 só com o banco sem provas de menor (a reversão recusa) e depois de voltar a revisão.
- Fechar só o cadastro: como em `publicacao-producao-2026-10-14.md` (`services update` + `update-traffic --to-latest`).

## O que muda para quem já tem conta

- Contas que aceitaram os Termos e a Privacidade 1.0 veem a tela de novo aceite no próximo login ou checkout.
- Contas criadas antes da 0009 não têm data de nascimento: o checkout pede uma única vez, antes de continuar a compra (depois, só a PartyX corrige pelo painel).

## O que ficou pendente

- **E-mail:** `smtp-url` continua sem versão (checklist 2.4); o e-mail de compra com o link da autorização de menor só sai quando o SMTP estiver configurado.
- **Evento real que permite menores:** cadastrar a autorização judicial no evento e conferir o PDF baixado (checklist 1.9).
- **Prova da aprovação do Bernardo:** canal e local a informar (`aprovacao-menores-e-contatos-2026-10-14.md`).
- **Dados antigos que sobraram, não públicos:** `reference/docs/documentacao.txt` (documento-base do contrato) e a lista de destinatários da homologação encerrada (`infra/homologacao/env.hml.yaml`, `docs/operacao/dominio-partyx.md`, `docs/operacao/email-homologacao-smtp-real.md`).
- Política de Cancelamento (exigida para vender, D-84).
