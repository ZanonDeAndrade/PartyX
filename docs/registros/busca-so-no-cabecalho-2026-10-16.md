# Busca só no cabeçalho (16/10/2026)

Pedido do responsável (Arthur), em 15/10/2026 à noite: tirar da página de eventos (vitrine) o formulário de busca com "Nome do evento", "Data" e o botão "Buscar"; fica só a busca do cabeçalho. Regras: testes, capturas, commit local, OK antes da virada; entra na próxima publicação da fila.

**Desvio do documento:** o RF-22 pede "Busca por nome ou data". Com esta mudança, a busca por data deixa de existir no site. Registrado como D-89, decisão do responsável, **com a aprovação da PartyX a registrar**. Voltar com a data é simples: a regra (dia no fuso do evento) está no histórico do Git.

## O que mudou

| Onde | Antes | Agora |
|---|---|---|
| Lista de eventos (`/eventos`) | Formulário "Nome do evento", "Data" e "Buscar", e os filtros removíveis (chips) | Sem formulário: a lista sobe para logo abaixo do título |
| Início (`/`) | O mesmo formulário abaixo do destaque | Sem formulário. Não estava no pedido, mas a do cabeçalho passou a ser a única busca do site |
| Cabeçalho, computador e tablet | Campo "Buscar evento por nome" | Igual. O campo mostra o termo da busca atual e esvazia fora dela |
| Cabeçalho, celular | A lupa levava à lista de eventos, onde ficava o formulário | **A lupa abre o campo por cima da linha do cabeçalho**, com o foco nele; fecha no X, no Esc ou ao tocar fora, e o foco volta para a lupa |
| Lista com busca | Chips com o termo e a data | "Resultados para “termo”" e "Limpar busca", depois a contagem |
| Sem resultado | "Nenhum evento encontrado" | "Nenhum evento encontrado para “termo”", com o botão "Ver todos os eventos" |
| Links antigos | `?q=` e `?date=` filtravam | `?q=` filtra; `?date=` é ignorado, sem erro (na página e na API) |
| API `GET /api/public/events` | `q` e `date`; data fora do formato dava 422 | Só `q`; `date` é descartado. A busca por nome ficou como era (acento, maiúsculas, parte do nome, `%` e `_` como texto) |

## Código removido

- `SearchForm` (`src/site/components.tsx`) e os blocos que o usavam em `pages.tsx`; os chips e a validação da data da lista.
- `searchPath(q)` ficou com um parâmetro; `api.events(q)` sem a data.
- Servidor: o filtro e a validação de `date` em `server/src/vitrine/service.ts` e na rota.
- CSS: `.px-searchbar`, `.px-search` (público) e `.px-chips` (base), sem outro uso.
- Mantido: a busca por nome na API e o protótipo (`src/logic`, `src/screens`), fora do site em produção.

## Verificação (local)

- **Novos testes:**
  - `server/src/api/public.integration.test.ts`: a data de links antigos é ignorada, com e sem nome (saíram os dois testes da busca por data e a recusa da data inválida);
  - `src/site/format.test.ts`: `searchPath` só com o nome;
  - `e2e/busca.spec.ts` (`npm run e2e:busca`, 4 casos): vitrine e início sem formulário, a lista logo abaixo do título; busca a 360 px pela lupa e a 1280 px no campo, com e sem resultado; "Limpar busca" e "Ver todos os eventos"; X, Esc e toque fora; links antigos com `?date=`; sem rolagem lateral; capturas.
- **Ajuste de teste:** `e2e/textos-longos.spec.ts` procura o botão "Buscar" da portaria pelo nome exato (a lupa do cabeçalho virou botão, "Buscar eventos").
- **Bateria:**

| Teste | Resultado |
|---|---|
| Lint | 0 erros (27 avisos antigos) |
| Tipos | ok |
| `test:db` | 1.107 + 4 (saíram 2 testes da data e entrou 1) |
| Busca | 4 |
| Textos longos | 78 (depois do ajuste do botão "Buscar" da portaria) |
| Documentos | 3 |
| Transições | 12 |
| Cronômetro | 8 |
| Cor | 8 |
| Transferência | 6 |
| Responsivo | 593 |
| Roteiro de compra, gateway fictício | 20 (1 pulado, como antes) |

Capturas a 360 e 1280 px (vitrine sem formulário, lupa aberta, com e sem resultado): página privada https://claude.ai/artifact/UD6hug6c499mi85Z8UHxSm.

## Publicação

Não publicado. Entra na próxima publicação da fila, junto com a saída da meia-entrada, com o OK do responsável antes da virada.
