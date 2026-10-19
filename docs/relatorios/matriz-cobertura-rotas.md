| Área | Método | Rota | Integração | Unitário | Sandbox MP | E2E | Scripts hml | Front usa | Situação |
|---|---|---|---|---|---|---|---|---|---|
| pública | POST | `/auth/login` | 20 | 1 | 1 | 3 | 4 | sim | API + interface |
| pública | POST | `/auth/logout` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| pública | POST | `/auth/password/check` | 4 | 0 | 0 | 1 | 0 | sim | API + interface |
| pública | POST | `/auth/password/forgot` | 4 | 0 | 0 | 0 | 2 | sim | só API |
| pública | POST | `/auth/password/reset` | 4 | 0 | 0 | 1 | 0 | sim | API + interface |
| pública | POST | `/auth/register` | 5 | 1 | 0 | 1 | 6 | sim | API + interface |
| pública | GET | `/legal/versions` | 3 | 0 | 0 | 1 | 6 | sim | API + interface |
| pública | GET | `/public/events` | 9 | 1 | 0 | 4 | 4 | sim | API + interface |
| pública | GET | `/public/events/:slug` | 7 | 0 | 0 | 2 | 4 | sim | API + interface |
| pública | GET | `/public/events/:slug/autorizacao-menor.pdf` | 3 | 0 | 0 | 0 | 0 | sim | só API |
| pública | GET | `/public/home` | 3 | 0 | 0 | 1 | 1 | sim | API + interface |
| pública | GET | `/public/legal/:kind` | 1 | 2 | 0 | 1 | 0 | sim | API + interface |
| pública | GET | `/public/site` | 4 | 2 | 0 | 0 | 0 | sim | só API |
| comprador | GET | `/auth/me` | 20 | 0 | 1 | 4 | 6 | sim | API + interface |
| comprador | POST | `/checkout/quote` | 3 | 0 | 0 | 1 | 1 | sim | API + interface |
| comprador | PATCH | `/me` | 20 | 1 | 2 | 5 | 6 | sim | API + interface |
| comprador | POST | `/me/birth-date` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| comprador | POST | `/me/consents` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| comprador | POST | `/me/password` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| comprador | GET | `/orders` | 16 | 2 | 2 | 4 | 8 | sim | API + interface |
| comprador | POST | `/orders` | 16 | 2 | 2 | 4 | 8 | sim | API + interface |
| comprador | GET | `/orders/:id` | 15 | 2 | 2 | 3 | 8 | sim | API + interface |
| comprador | GET | `/orders/:id/autorizacao-menor.pdf` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| comprador | POST | `/orders/:id/cancel` | 3 | 0 | 0 | 0 | 0 | sim | só API |
| comprador | GET | `/orders/:id/payment` | 11 | 0 | 1 | 0 | 6 | sim | só API |
| comprador | POST | `/orders/:id/payment` | 11 | 0 | 1 | 0 | 6 | sim | só API |
| comprador | GET | `/orders/:id/tickets` | 3 | 0 | 0 | 0 | 2 | sim | só API |
| comprador | GET | `/orders/:id/tickets/pdf` | 2 | 0 | 0 | 0 | 2 | sim | só API |
| comprador | GET | `/payments/options` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| comprador | GET | `/tickets` | 16 | 2 | 1 | 4 | 5 | sim | API + interface |
| comprador | GET | `/tickets/:id` | 16 | 2 | 1 | 3 | 3 | sim | API + interface |
| comprador | GET | `/tickets/:id/autorizacao-menor.pdf` | 1 | 0 | 0 | 1 | 0 | sim | API + interface |
| comprador | GET | `/tickets/:id/pdf` | 3 | 0 | 0 | 0 | 0 | sim | só API |
| comprador | POST | `/tickets/:id/termo-menor` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| comprador | POST | `/tickets/:id/transfer` | 3 | 0 | 0 | 1 | 0 | sim | API + interface |
| comprador | POST | `/tickets/:id/transfer/preview` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| portaria | POST | `/gate/admit` | 3 | 0 | 0 | 0 | 0 | sim | só API |
| portaria | GET | `/gate/events` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| portaria | GET | `/gate/events/:id/counter` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| portaria | POST | `/gate/minor-refused` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| portaria | POST | `/gate/scan` | 4 | 1 | 1 | 1 | 2 | sim | API + interface |
| portaria | POST | `/gate/search` | 3 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/buyers` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/buyers/:id` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/buyers/:id/cpf` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/dev/mock-gateway/:orderId/:status` | 1 | 0 | 0 | 0 | 1 | não | só API |
| admin | GET | `/admin/emails` | 1 | 1 | 0 | 0 | 1 | não | só API |
| admin | POST | `/admin/emails/:id/retry` | 1 | 0 | 0 | 0 | 1 | não | só API |
| admin | GET | `/admin/events` | 10 | 0 | 0 | 2 | 0 | sim | API + interface |
| admin | POST | `/admin/events` | 10 | 0 | 0 | 2 | 0 | sim | API + interface |
| admin | GET | `/admin/events/:id` | 9 | 0 | 0 | 1 | 0 | sim | API + interface |
| admin | PATCH | `/admin/events/:id` | 9 | 0 | 0 | 1 | 0 | sim | API + interface |
| admin | POST | `/admin/events/:id/accent-suggestion` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/events/:id/archive` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | DELETE | `/admin/events/:id/banner` | 2 | 0 | 0 | 1 | 0 | sim | API + interface |
| admin | PUT | `/admin/events/:id/banner` | 2 | 0 | 0 | 1 | 0 | sim | API + interface |
| admin | GET | `/admin/events/:id/buyers` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/events/:id/close` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/events/:id/delete` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/events/:id/entries` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/events/:id/preview` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/events/:id/publish` | 4 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/events/:id/removal` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/events/:id/reopen` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/events/:id/stop-sales` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/events/:id/ticket-types` | 4 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/events/:id/tickets` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/events/:id/unarchive` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/events/meta` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/exports/events/:id/buyers.csv` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/exports/events/:id/contingency.csv` | 1 | 0 | 0 | 0 | 1 | não | só API |
| admin | GET | `/admin/exports/events/:id/contingency.pdf` | 1 | 0 | 0 | 0 | 1 | não | só API |
| admin | GET | `/admin/exports/events/:id/tickets.csv` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/exports/fee.csv` | 1 | 0 | 0 | 1 | 0 | sim | API + interface |
| admin | GET | `/admin/exports/orders.csv` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/exports/promoters.csv` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/exports/promoters/:id/orders.csv` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/exports/sales.csv` | 3 | 0 | 0 | 0 | 0 | sim | só API |
| admin | DELETE | `/admin/lots/:id` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| admin | PATCH | `/admin/lots/:id` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/lots/:id/move` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/orders` | 5 | 0 | 0 | 0 | 1 | sim | só API |
| admin | GET | `/admin/orders/:id` | 4 | 0 | 0 | 0 | 1 | sim | só API |
| admin | POST | `/admin/orders/:id/cancel-tickets` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/overview` | 2 | 0 | 0 | 1 | 0 | não | API + interface |
| admin | GET | `/admin/payments/exceptions` | 3 | 0 | 0 | 0 | 1 | sim | só API |
| admin | POST | `/admin/payments/exceptions/:orderId/duplicates/:chargeId/treat` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/payments/exceptions/:orderId/treat` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/privacy/subjects` | 2 | 0 | 0 | 0 | 0 | não | só API |
| admin | POST | `/admin/privacy/subjects/:id/anonymize` | 2 | 0 | 0 | 0 | 0 | não | só API |
| admin | GET | `/admin/privacy/subjects/:id/export` | 2 | 0 | 0 | 0 | 0 | não | só API |
| admin | GET | `/admin/promoters` | 3 | 0 | 0 | 3 | 0 | sim | API + interface |
| admin | POST | `/admin/promoters` | 3 | 0 | 0 | 3 | 0 | sim | API + interface |
| admin | PATCH | `/admin/promoters/:id` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/reports/fee` | 4 | 0 | 1 | 0 | 1 | sim | só API |
| admin | GET | `/admin/reports/promoters` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/reports/promoters/:id` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/reports/sales` | 5 | 0 | 0 | 0 | 1 | sim | só API |
| admin | GET | `/admin/settings/service-fee` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | PUT | `/admin/settings/service-fee` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/team` | 3 | 0 | 0 | 0 | 2 | sim | só API |
| admin | POST | `/admin/team` | 3 | 0 | 0 | 0 | 2 | sim | só API |
| admin | PATCH | `/admin/team/:id` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/team/:id/activate` | 1 | 0 | 0 | 0 | 0 | não | só API |
| admin | POST | `/admin/team/:id/deactivate` | 1 | 0 | 0 | 0 | 0 | não | só API |
| admin | POST | `/admin/team/:id/temporary-password` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | PATCH | `/admin/ticket-types/:id` | 4 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/ticket-types/:id/lots` | 2 | 0 | 0 | 0 | 0 | sim | só API |
| admin | POST | `/admin/ticket-types/:id/turn-lot` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | GET | `/admin/tickets/:id` | 4 | 0 | 0 | 1 | 1 | sim | API + interface |
| admin | POST | `/admin/tickets/:id/cancel` | 3 | 0 | 0 | 1 | 1 | sim | API + interface |
| admin | POST | `/admin/tickets/:id/transfer/undo` | 1 | 0 | 0 | 0 | 0 | sim | só API |
| admin | PATCH | `/admin/users/:id/identity` | 3 | 0 | 0 | 0 | 0 | sim | só API |
| rotina/webhook | POST | `/internal/jobs/purge-retention` | 2 | 0 | 0 | 0 | 0 | não | só API |
| rotina/webhook | POST | `/internal/jobs/reconcile-payments` | 6 | 1 | 0 | 0 | 1 | não | só API |
| rotina/webhook | POST | `/internal/tasks/reconcile-order` | 2 | 1 | 0 | 0 | 0 | não | só API |
| rotina/webhook | POST | `/internal/tasks/send-email` | 2 | 2 | 0 | 0 | 0 | não | só API |
| rotina/webhook | POST | `/webhooks/payments` | 10 | 2 | 1 | 1 | 3 | não | API + interface |
| técnica | POST | `/dev/mock-gateway/:orderId/:status` | 1 | 0 | 0 | 1 | 5 | sim | API + interface |
| técnica | GET | `/health` | 2 | 5 | 0 | 2 | 0 | não | API + interface |
| técnica | GET | `/health/origem` | 0 | 1 | 0 | 0 | 0 | não | parcial |
| técnica | GET | `/health/ready` | 0 | 4 | 0 | 1 | 0 | não | API + interface |
| técnica | GET | `/media/*` | 0 | 0 | 0 | 0 | 0 | não | **sem teste** |

Rotas: 123. Sem nenhuma ocorrência em teste: 1 (GET /media/*).
