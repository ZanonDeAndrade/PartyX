# Carga, compatibilidade e segurança (Prompt 24)

Executado em 05/10/2026, **só no ambiente local**: um processo Node, PostgreSQL 16 na mesma máquina, gateway **fictício**, sem rede de verdade. **Nada foi executado em homologação** (sem gateway sandbox, D-01) **nem em produção**, e **nenhum aparelho real foi usado**. Scripts em `infra/testes/` (repetíveis em homologação). A suíte do repositório segue verde: 628 testes, tipos limpos.

## O que não foi executado (não confundir com aprovado)

| Item | Motivo |
|---|---|
| Rodada integrada **em homologação** com Pix e cartão sandbox (aprovado e recusado), e-mail real | Depende do gateway (D-01), do domínio e do remetente |
| Carga contra Cloud Run + Neon + gateway | Idem; os tempos abaixo **não** valem para a nuvem |
| Chrome Android, Safari iPhone e Chrome/Edge desktop **em aparelhos reais**, câmera real | Sem aparelhos; só emulação (Pixel 7, iPhone 14) |
| Edge | Não instalado (Chromium cobre o motor) |
| Varredura automatizada de vulnerabilidades (ZAP etc.) e teste de invasão externo | Não há ferramenta nem contratação; foi feita verificação manual em caixa-preta (abaixo) |
| HSTS e cookie `Secure` | Só existem em HTTPS; conferir em homologação |

## 1. Rodada integrada local (28 verificações, todas passam)

Vitrine → cadastro → cotação → pedido (total adulterado em R$ 1 não é aceito: 409) → Pix → dados de cartão no corpo recusados (422) → sem ingresso antes de pagar → webhook confirma → 3 ingressos → PDF → conteúdo do QR → outro comprador não vê ingresso nem PDF (404) → portaria verde e depois amarelo → administrador cancela e a portaria recusa → recusa e Pix vencido sem ingresso → taxa do mês = 3 ingressos = R$ 3,00 (cancelado conta) → relatório, CSV e PDF → validador, cliente e anônimo recebem 403/403/401 em rotas de administrador → cliente não acessa a portaria.

## 2. Carga (local)

Meta sugerida: 200 usuários simultâneos na página e 50 compras por minuto. Cada compra: cadastro, pedido com reserva, Pix, confirmação, Meus ingressos.

| Execução | Visitantes | Compras/min | Resultado |
|---|---|---|---|
| **Meta**, 180 s | 200 | 50 | 13.067 ciclos de 4 requisições, **0 erros 5xx**; 121 compras concluídas, 0 falhas do sistema¹ |
| **Dobro**, 120 s | 400 | 100 | 17.385 ciclos, **0 erros**; 167 de 167 compras concluídas |
| **Disputa de estoque** | 80 compradores, 20 unidades | simultâneos | 20 reservas (201) e 60 recusas (409); vendidos 20, ingressos 20, nenhum acima do total |

¹ 13 cadastros foram recusados com 422 porque meu teste reutilizou CPFs de uma rodada anterior; a causa foi confirmada ("Este CPF já tem cadastro"). Não é defeito.

Latências no servidor local (p50 / p95 / p99, ms), meta: página inicial 1,9 / 2,9 / 3,8; página do evento 3,5 / 4,6 / 6,9; cadastro 28,8 / 37,4 / 41,8 (hash de senha); pedido com reserva 8,6 / 12,2 / 14,7; Pix 6,2 / 8,7 / 13,1; confirmação do webhook 14,5 / 19,9 / 21,9; compra completa 66,5 / 79,8 / 83,8. No dobro, o pior p99 foi 94 ms. Processo: até ~30 % de uma CPU e ~500 MB de memória.

Depois de tudo, no banco: vendidos = ingressos emitidos por tipo, 0 códigos repetidos, 0 reservas ativas penduradas, nenhum tipo acima da capacidade. **Mas:** são tempos sem rede, sem gateway e com banco local; o gargalo real em produção será a latência do Neon, o limite de conexões (`DB_POOL_MAX`) e o gateway. Repetir em homologação antes de qualquer abertura grande.

## 3. Compatibilidade (275 páginas verificadas, 275 sem achado)

Chromium, **Firefox** e **WebKit** em 1366 px, 768 px e 360 px, mais Pixel 7 e iPhone 14 **emulados**, com os quatro perfis (público, cliente, administrador, validador): cada página sem rolagem horizontal, com título, sem tela de erro e sem erro de console.

**Corrigido:** em WebKit a 768 px o filtro dos relatórios criava rolagem horizontal de 4 px (o texto do `select` "Quantidade de ingressos" passava do campo). Ajuste de CSS em `src/site/site.css` (`.px-filters`), reverificado.

Observações: a tela de ingresso em tela cheia não tem `h1` de propósito (é um `role="dialog"` rotulado). O WebKit registra "access control checks" quando uma navegação cancela uma busca em andamento; o código já trata o cancelamento, sem efeito para o usuário.

## 4. Segurança (verificação manual em caixa-preta, 45 verificações, 0 achados abertos)

Passam: cabeçalhos (CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy com câmera só no próprio site, sem `X-Powered-By`); `.env`, `.git`, código-fonte, migrações e `../` não são servidos; payloads de SQL e XSS na busca, no slug e no login sem erro 5xx nem vazamento; corpo vazio, ruim e de 2 MB recusados (400/413); POST com `Origin` de outro site 403; sem token CSRF 403; CORS não libera outro site; cookie HttpOnly e SameSite=Lax; `role=administrador` no cadastro vira cliente; login e recuperação de senha respondem igual para e-mail existente e inexistente; força bruta bloqueia (429) na 6ª tentativa e a senha certa também fica bloqueada; rotina interna sem token 503, webhook sem assinatura 401; IDs inválidos 404.

**Observações (sem correção):**
- **Baixa:** um caminho com ponto codificado (`/api/tickets/%2e%2e/%2e%2e/admin/team`) devolve a página HTML do site em vez de 404 JSON. Não expõe dado nenhum (é só o `index.html`).
- **Baixa:** depois de um corpo acima do limite (413) o servidor encerra a conexão e um cliente que a reutilize pode ver uma falha de rede na requisição seguinte. Navegadores repetem sozinhos.
- **`npm audit`:** 2 moderados em dependência de dependência (`uuid` < 11.1.1 via `@google-cloud/storage` → `gaxios`). O defeito é de `uuid` v3/v5/v6 com buffer informado; o `gaxios` usa v4 sem buffer, então não parece alcançável, mas **não confirmei no código de terceiros**. `npm audit fix` não resolve; `--force` rebaixaria o `drizzle-kit` (mudança major), então **não apliquei**. Reavaliar quando o `@google-cloud/storage` atualizar.

## 5. Erros abertos

Nenhum defeito de produto aberto desta rodada. Pendências que seguem: tudo da seção "não executado", D-01, e a prova em aparelhos reais (CA-26).
