# Cadastro e autenticação

Implementado em 01/10/2026 (Prompt 05): RF-01 a RF-06, RF-10 e CA-01 a CA-04. Código em `server/src/auth/` e `server/src/api/auth.ts`.

**O front-end ainda não usa esta API.** As telas de login, cadastro e recuperação continuam com o protótipo simulado. A integração entra junto com as telas reais (Prompts 08 e 10).

## Rotas

Todas em `/api`. Erros no formato `{ "erro": { "codigo", "mensagem", "detalhes" } }`.

| Rota | O que faz | Respostas principais |
|---|---|---|
| `GET /legal/versions` | Versões em vigor dos Termos e da Privacidade | `{ terms, privacy, ready, provisional }` |
| `POST /auth/register` | Cria a conta cliente, registra o aceite, abre a sessão | 201; 422 por campo; 409 `versao_desatualizada`; 503 `cadastro_indisponivel` |
| `POST /auth/login` | Entra com e-mail e senha | 200; 401 `credenciais_invalidas`; 403 `conta_desativada`; 429 `login_bloqueado` |
| `POST /auth/logout` | Revoga a sessão no servidor | 204 |
| `GET /auth/me` | Usuário atual e o `csrfToken` da sessão | 200; 401 |
| `POST /auth/password/forgot` | Pede o link de recuperação | **202 sempre**, com a mesma mensagem |
| `POST /auth/password/check` | Estado do link | `valido`, `expirado`, `utilizado` ou `invalido` |
| `POST /auth/password/reset` | Define a nova senha com o link | 200; 400 `link_expirado`, `link_utilizado`, `link_invalido` |
| `PATCH /me` | Edita nome e telefone | 200; 422 |
| `POST /me/password` | Troca a senha (exige a atual) | 200; 422 |

Campos do cadastro: `name`, `email`, `cpf`, `phone`, `password`, `acceptedTermsVersion`, `acceptedPrivacyVersion`, `accept`. O erro 422 traz `detalhes: [{ campo, mensagem }]` com as mensagens do design.

## Como a interface deve chamar

1. Abrir a tela: `GET /auth/me`. Com 200, guardar o `csrfToken` (só em memória, nunca em `localStorage`).
2. Toda requisição que altera dados e tem sessão envia o cabeçalho `X-CSRF-Token`.
3. O cookie `__session` é `HttpOnly`: o JavaScript da página não o lê.

## O que está garantido

| Requisito | Como | Teste |
|---|---|---|
| RF-01, RF-02, CA-02 | Nome e sobrenome, e-mail e CPF únicos, CPF com dígitos verificadores, telefone com DDD, senha de 8+ caracteres com letras e números. Duas requisições simultâneas com o mesmo e-mail criam uma conta só (decide o banco). | `auth.integration.test.ts`, `identity.test.ts` |
| RF-03, CA-03 | O aceite chega marcado pelo usuário, nunca pré-selecionado. Grava versão dos Termos, versão da Privacidade, data, IP e navegador. Versão desatualizada é recusada. | idem |
| RF-04 | Senha com **Argon2id**. A senha em texto nunca é guardada nem aparece em log. | idem |
| RF-05, CA-04 | Link de 256 bits, **só o hash** vai ao banco, vale 1 hora e **uma vez** (a marcação como usado é atômica). Pedir outro link invalida o anterior. Trocar a senha encerra todas as sessões. | idem |
| RF-06 | Nome, telefone e senha editáveis. E-mail e CPF **não** mudam por esta rota, mesmo se enviados. | idem |
| RF-10 | 5 falhas em 15 minutos bloqueiam o e-mail (429 com tempo de espera), mesmo para a senha certa. Entrar com sucesso zera a contagem. Fica no banco, então vale entre instâncias. Há também um limite por IP (30 falhas). | idem |

**Verificação humana (06/10/2026):** cadastro e recuperação de senha exigem um token do Cloudflare Turnstile (`captchaToken`), conferido no servidor antes dos limites por IP; falha fechada se a Cloudflare não responde. Obrigatória em produção. O cookie de sessão agora é `__session`. Ver `README-DEPLOY.md`, seção 8b.

Proteções transversais: resposta idêntica para e-mail existente e inexistente no login e na recuperação (e o tempo de resposta é igualado com uma verificação de senha fictícia); cookie `HttpOnly`, `Secure` fora do ambiente local e `SameSite=Lax`; checagem de `Origin` e token CSRF ligado à sessão; só o hash do token da sessão é guardado; CPF sai mascarado nas respostas; CPF, senha, e-mail e tokens não aparecem em nenhuma linha de log (teste automático).

Os testes foram validados por **mutação**: desligar o CSRF, permitir reuso do token, tirar o limite de login e deixar de encerrar sessões na recuperação fazem testes falharem.

## Premissas e decisões abertas

| ID | Tema | O que foi feito | Precisa de |
|---|---|---|---|
| D-21 | Duração das sessões | Cliente: 7 dias sem uso e 30 no máximo. Equipe: 30 minutos sem uso e 12 horas no máximo. A documentação pede expiração por inatividade no painel (12.1.C) mas não dá prazos. | Confirmar com o cliente. |
| D-22 | Mensagem de "já cadastrado" | CA-02 pede "mensagem clara", então o cadastro diz se o e-mail ou o CPF já existe. Isso permite descobrir se alguém é cliente. O endpoint tem limite por IP (10 por hora, por instância). | Confirmar com o cliente se aceita esse risco. |
| D-23 | Bloqueio por IP | 30 falhas em 15 minutos. Mais alto que o do e-mail porque eventos concentram muita gente na mesma rede. | Ajustar com o público real. |

## Limitações conhecidas

1. **E-mail:** resolvido no Prompt 14 (`email.md`): fila persistente, modelos e entrega SMTP. A entrega **real** continua dependendo do provedor, do domínio e do remetente do cliente (D-09). Sem eles, o item fica na fila e o alerta dispara; nunca consta como enviado.
2. O link de recuperação é gerado **no envio** (token novo; o anterior deixa de valer), então a fila nunca guarda token e o reenvio é seguro (decisão D-45).
3. Limitadores de cadastro e de recuperação por IP ficam **em memória, por instância**. Com várias instâncias o limite efetivo é maior. O endurecimento entre instâncias é do Prompt 20.
4. Tentativas de login com e-mails inexistentes também são gravadas em `login_attempts`. A limpeza periódica (remover o antigo) entra no Prompt 30.
5. Edição de e-mail e CPF pelo administrador, desativação de usuários e primeiro administrador: feitos no Prompt 06 (seção abaixo).
6. Textos legais: com `APP_ENV=producao`, sem `TERMS_VERSION` e `PRIVACY_VERSION` o cadastro devolve 503. Fora de produção valem versões fictícias (`ficticio-0`), identificadas como provisórias.

## Verificado em homologação (Cloud Run e Neon)

Cadastro, sessão com cookie `Secure`, token CSRF, recusa de origem estranha, mensagem igual para e-mail inexistente, recuperação com resposta neutra, logout revogando a sessão, IP real gravado no aceite, hash `argon2id` no banco. O usuário de teste foi apagado depois.

---

# Equipe e permissões (Prompt 06)

Implementado em 01/10/2026: RF-07 a RF-09, CA-05 e CA-06. Código em `server/src/auth/permissions.ts`, `team.ts`, `bootstrap.ts` e `server/src/api/team.ts`. **Sem migração**: usa `users`, `sessions` e `audit_log` já existentes. Como no Prompt 05, o front-end ainda não chama estas rotas.

## Perfis e regra de acesso

| Perfil | Pode |
|---|---|
| cliente | Comprar, ver os próprios pedidos e ingressos, editar a própria conta |
| validador | Portaria (prefixo `/api/gate`, Prompt 15) e a própria conta. **Nada de `/api/admin`** |
| administrador | Tudo do validador e a área `/api/admin` |

- Quem decide é o servidor. Ordem: sem sessão → 401; perfil sem permissão → 403 `sem_permissao`; senha temporária não trocada → 403 `troca_de_senha_obrigatoria`.
- O perfil vem sempre da linha do usuário no banco, lida a cada requisição. Cabeçalho, corpo ou cookie nunca o definem.
- **Negar por padrão**: `app.use('/admin/*', requireAdmin)` cobre o prefixo inteiro. Uma rota nova sob `/admin` já nasce restrita, e um caminho que nem existe responde 403 ao validador (não 404). `ROUTE_POLICY` em `permissions.ts` registra o prefixo `/gate` para o Prompt 15.
- O cadastro público ignora `role`, `isActive` e quaisquer campos extras: cria sempre `cliente`.

## Rotas (todas exigem administrador)

| Rota | O que faz |
|---|---|
| `GET /admin/team` | Lista validadores e administradores (CPF mascarado) |
| `POST /admin/team` | Cria acesso (nome, e-mail, perfil; telefone e CPF opcionais). Responde 201 com `temporaryPassword` **uma única vez**, `Cache-Control: no-store` |
| `PATCH /admin/team/:id` | Edita nome, e-mail, telefone, CPF e perfil |
| `POST /admin/team/:id/deactivate` e `/activate` | Desativa ou reativa |
| `POST /admin/team/:id/temporary-password` | Nova senha temporária; invalida a antiga e as sessões |
| `PATCH /admin/users/:id/identity` | Corrige e-mail e/ou CPF de **qualquer** usuário, inclusive cliente (RF-06). Exige `reason` |

Cliente não aparece nas rotas `/admin/team/:id`: respondem 404, como se o id não existisse.

## Garantias

| Requisito | Como | Teste |
|---|---|---|
| RF-07 | Três perfis no enum do banco; perfil só muda pelo administrador | `team.integration.test.ts` |
| RF-08 | Criar, editar, ativar e desativar com trilha em `audit_log` (autor, momento, antes e depois; CPF mascarado; nunca a senha nem o hash) | idem |
| RF-09 | Teste de matriz percorre `app.routes`: toda rota não pública recusa sem sessão (401) e toda `/admin` recusa cliente e validador (403) | idem |
| CA-05 | Validador por URL direta: 403 em todas as rotas de `/admin` e em caminhos inexistentes sob o prefixo | idem |
| CA-06 | Desativar revoga as sessões na hora; login devolve 403 `conta_desativada`; sessão antiga devolve 401 | idem |

**Senha inicial segura (ADM22).** Não há convite por e-mail ainda (Prompt 14). O administrador recebe uma senha aleatória de 14 caracteres (sem 0/O/1/l/I) e a repassa por canal seguro. O primeiro acesso exige trocar a senha: até lá a equipe só consegue `GET /auth/me`, `POST /me/password` e sair.

**Último administrador.** Toda mutação tranca os administradores ativos (`SELECT ... FOR UPDATE`, ordem por id) e confere que quem age ainda é um deles. Ninguém desativa ou rebaixa a si mesmo (409 `autoalteracao`), e o único administrador ativo não pode ser desativado ou rebaixado (409 `ultimo_administrador`). Dois administradores se desativando ao mesmo tempo: um passa, o outro é recusado (15 rodadas por teste; sem o bloqueio de linhas o teste falha).

**Sessões.** Desativar, redefinir senha, mudar perfil, mudar e-mail ou corrigir identidade derrubam todas as sessões do usuário.

## Primeiro administrador (bootstrap)

```
BOOTSTRAP_ADMIN_NAME="Nome Sobrenome" BOOTSTRAP_ADMIN_EMAIL=pessoa@dominio.com npm run admin:bootstrap
```

- Idempotente e restrito: se existe **qualquer** administrador (mesmo desativado), não faz nada. Um *advisory lock* no PostgreSQL faz execuções simultâneas criarem um só.
- Sem senha fixa. `BOOTSTRAP_ADMIN_PASSWORD` (do Secret Manager) é opcional; sem ela, gera uma senha aleatória e a imprime **uma vez** no terminal de quem executou (não vai ao log estruturado). Em ambos os casos o primeiro acesso exige trocar a senha.
- Nunca promove conta existente: se o e-mail já pertence a alguém, recusa.
- Em homologação e produção rode com a `DATABASE_URL` do ambiente; o e-mail e o nome do administrador inicial vêm do cliente (insumo 14, equipe).

## Premissas e decisões abertas

| ID | Tema | O que foi feito | Precisa de |
|---|---|---|---|
| D-24 | Entrega da senha temporária | Mostrada ao administrador na criação, para repassar por canal seguro. Convite por e-mail fica para o Prompt 14. | Confirmar com o cliente |
| D-25 | Quem é o primeiro administrador | Nome e e-mail ainda não informados. O comando está pronto e não foi executado em homologação. | Cliente |
| D-26 | Administrador corrige e-mail e CPF de cliente | Permitido com motivo obrigatório e trilha. A documentação diz que só o administrador altera esses campos (RF-06). | Confirmar o procedimento |

## Limitações

1. Não há tela de equipe: o protótipo (ADM20 a ADM22) ainda é simulado. Entra com o painel (Prompt 16).
2. Sem e-mail ao criar ou redefinir acesso (Prompt 14).
3. Autenticação de dois fatores não faz parte do escopo.
4. Os limites de tentativas de troca de senha temporária usam o limite de login existente; endurecimento no Prompt 20.
