# Primeiro administrador de produção (14/10/2026)

| Campo | Registro |
|---|---|
| Pedido | Arthur (responsável da contratada), nesta data: administrador para ele mesmo, pelo caminho do projeto, com senha digitada sem eco e troca obrigatória no primeiro login |
| Conta | Arthur Zanon de Andrade, `arthurzanondea@gmail.com`, perfil `administrador` |
| Por que outro e-mail | `zanondea@gmail.com` já era uma conta de **cliente** (criada às 19:11 UTC para testes de compra). O projeto não promove cliente a equipe: o bootstrap recusa e-mail em uso e o painel da equipe não mostra clientes. Escolha do responsável: usar `arthurzanondea@gmail.com` |
| Como | `server/scripts/bootstrap-admin.ts` (`admin:bootstrap`), rodado pelo responsável no terminal dele com um script de apoio fora do Git: senha pedida duas vezes sem eco e passada só ao processo, URL do banco lida do Secret Manager (`database-url`). Ensaio antes num banco descartável do PostgreSQL de teste |
| Senha | Não registrada em lugar nenhum (nem aqui, nem em log, comando ou arquivo) |
| Conferência prévia (só leitura, papel `partyx_backup`) | Nenhum administrador existia; o e-mail escolhido estava livre |

## Trilha de auditoria e logs (conferidos só lendo, sem dados pessoais)

| Hora (UTC) | Fonte | Evento |
|---|---|---|
| 19:24:07 | `audit_log` | `equipe.bootstrap`, conta criada com `must_change_password = true` |
| 19:24:22 | log do Cloud Run (`partyx-00010-ced`) | `POST /api/auth/login` 200 |
| 19:24:25 | log do Cloud Run | `GET /api/admin/payments/exceptions` 403: painel bloqueado enquanto a troca de senha é obrigatória |
| 19:24:37 | log do Cloud Run | `POST /api/me/password` 200: senha trocada |
| 19:24:47 | log do Cloud Run | `POST /api/auth/login` 200 |
| 19:24:56 em diante | log do Cloud Run | `/api/admin/overview`, `/api/admin/events`, `/api/admin/buyers` 200: painel aberto |
| 19:33:26 | banco | `last_login_at` da conta (bate com o login do mesmo horário no log) |

Estado conferido por volta de 20:30 UTC: 1 administrador, ativo, `must_change_password = false`.

**Limite:** o projeto não grava o login nem a troca de senha na trilha de auditoria (`audit_log`); só a criação. A prova da troca é o log de requisição mais a troca obrigatória desligada no banco. Se a PartyX quiser esses eventos na trilha, é mudança de código com publicação.

Novos membros da equipe: pelo painel (`/admin/equipe`), com senha temporária e troca obrigatória.
