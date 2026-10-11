# Arquitetura

Atualizada em 01/10/2026 (Prompt 02).

## Decisão: front-end em Vite, API própria

O front-end **permanece em Vite + React + TypeScript** (decisão do responsável técnico em 01/10/2026, registrada em D-19). O plano de 30 prompts previa Next.js; a decisão muda a forma, não o escopo.

```
Navegador ──► Cloud Run (um contêiner, porta 8080)
               ├── /api/*  Hono (TypeScript): regras, banco, gateway, e-mail
               └── /*      build do Vite (index.html + assets), com fallback de SPA
                                  │
                                  └──► Neon PostgreSQL (Drizzle)
```

| Camada | Pasta | Responsabilidade |
|---|---|---|
| Páginas | `src/` | Interface (React). Hoje é o protótipo com dados simulados. |
| API | `server/src/api/` | HTTP, validação de entrada (zod), códigos de resposta. Sem regra de negócio. |
| Domínio | `server/src/domain/` | Regras puras, sem I/O: dinheiro em centavos, tempo em UTC, erros esperados. |
| Persistência | `server/src/db/` | Pool do PostgreSQL, Drizzle, esquema e migrações. |
| Provedores | `server/src/providers/` | Relógio injetável hoje. Gateway, e-mail e storage entram depois, cada um atrás de uma interface. |

## Consequências da decisão

1. **Open Graph (RF-26, CA-13) precisa de tratamento no servidor.** Um app de página única entrega o mesmo `index.html` para toda URL, e o WhatsApp não executa JavaScript. Para `/eventos/:slug` mostrar banner e título, a API deve responder essa rota com as tags `<meta property="og:*">` do evento injetadas no HTML. **Feito no Prompt 08** (ver `vitrine.md`). O fallback de SPA atual (`server/src/app.ts`) é o ponto onde essa injeção será feita.
2. **SEO das páginas de evento** depende do mesmo mecanismo. A documentação cita "bom SEO" como motivo para o Next.js (seção 5.1).
3. **Um deploy só.** A API serve o build do Vite no mesmo contêiner. Não há segundo serviço nem CORS em produção. Em desenvolvimento, o Vite faz proxy de `/api` para a porta 8080.
4. **Sem renderização no servidor.** Telas autenticadas e o checkout continuam em cliente. Isso é aceitável porque a autorização é sempre verificada na API.

## Por que Drizzle, transações e SQL explícito

- O esquema é código TypeScript, e as consultas simples saem tipadas.
- As migrações são versionadas em `drizzle/` (`npm run db:generate`, `npm run db:migrate`).
- As operações que decidem dinheiro e entrada **não** devem ficar escondidas num ORM. Elas precisam de controle explícito:
  - **Estoque**: `SELECT ... FOR UPDATE` nas linhas dos tipos de ingresso, em ordem determinística, dentro de uma transação. Garante que, com várias instâncias, a última unidade vende uma vez só (CA-16).
  - **Portaria**: `UPDATE tickets SET status = 'utilizado' ... WHERE status = 'valido'`. Só uma leitura afeta uma linha (CA-25).
  Drizzle permite `db.transaction` e o operador `sql` para isso, sem sair da biblioteca. Esses trechos ficam em módulos de domínio dedicados e testados contra PostgreSQL real.
- Nenhuma chamada externa (gateway, e-mail) acontece dentro de uma transação aberta.

## Convenções

- **Dinheiro**: inteiro em centavos (`server/src/domain/money.ts`). Nunca `float`.
- **Tempo**: instantes em UTC. O fuso `America/Sao_Paulo` só entra na exibição e em decisões de "qual dia ou mês" (`server/src/domain/time.ts`). A virada do mês do relatório da taxa usa o fuso do evento.
- **Relógio**: sempre injetado (`Clock`), para testar reserva, expiração e relatórios sem esperar.
- **Erros**: `AppError` para o que é esperado. Qualquer outro erro vira resposta genérica; detalhes só no log.
- **Logs**: JSON, uma linha por evento, campo `severity` (Cloud Logging). Nunca CPF, senha, token, PAN/CVV ou segredo.
- **Configuração**: variáveis de ambiente validadas na partida (`server/src/config.ts`). Segredos sem valor padrão.

## Limites e custos ainda por definir (Prompt 04)

- `DB_POOL_MAX` é por instância. O total de conexões é esse valor vezes o máximo de instâncias do Cloud Run, e precisa caber no limite do plano do Neon (a verificar na conta real).
- Região, orçamento e alertas ficam para o Prompt 04.

## Desvios do Prompt 02

| Item pedido | O que foi feito | Motivo |
|---|---|---|
| Next.js App Router | Vite + Hono | Decisão D-19. |
| Tailwind | **Não instalado** | A interface existente usa os estilos do design e não tem classes utilitárias. Instalar agora não teria uso. Decidir quando a interface nova começar a ser escrita. |
| Páginas e API no mesmo projeto Next | Dois blocos (`src/` e `server/`) em um só repositório, um só `package.json` | Evita workspaces e mantém um único deploy. |
