# Eventos, tipos de ingresso e promoters

Implementado em 01/10/2026 (Prompt 07): RF-11 a RF-19 e CA-07 a CA-11 (parte API). Código em `server/src/events/service.ts`, `server/src/api/events.ts`, `server/src/media/banner.ts`, `server/src/providers/bannerStorage.ts` e `server/src/domain/events.ts`. **Sem migração**: as tabelas `events`, `ticket_types`, `promoters` e `audit_log` já existiam.

**Interface real do painel (ADM02 a ADM06) desde 10/10/2026**, etapa 04 da sequência de fechamento: `src/site/adminEvents.tsx` (seção abaixo). Promoters, equipe e compradores (ADM07 em diante) são da etapa 05. Dados de teste são fictícios; nenhum evento real foi cadastrado.

## Rotas (todas sob `/api/admin`, só administrador)

| Rota | O que faz |
|---|---|
| `GET /admin/events`, `GET /admin/events/:id` | Lista; detalhe com tipos, vendidos, reservados, disponíveis e estado de venda |
| `GET /admin/events/meta` | Regras para a tela, lidas do servidor e da configuração: limites e formatos do banner (e se há armazenamento), classificações etárias, tamanhos de texto, valor e quantidade máximos, janela da portaria para evento encerrado, minutos de reserva e limite por compra (10/10/2026) |
| `POST /admin/events/:id/stop-sales` | Encerrar vendas agora (só evento publicado); devolve o evento e quantos tipos saíram de venda |
| `GET /admin/events/:id/preview` | Página pública montada pelo id, em qualquer estado (inclusive rascunho), com nada à venda (`canBuy` falso). Só administrador; o público continua recebendo 404 para rascunho (10/10/2026) |
| `POST /admin/events` | Cria em rascunho. O endereço (`slug`) sai do nome; repetido ganha `-2`, `-3`... |
| `PATCH /admin/events/:id` | Edita campos. O `slug` não muda |
| `POST /admin/events/:id/publish` / `close` | Rascunho → publicado; publicado → encerrado |
| `PUT /admin/events/:id/banner` | Envia a imagem (multipart, campo `file`). `DELETE` remove a URL |
| `POST /admin/events/:id/ticket-types`, `PATCH /admin/ticket-types/:id` | Cria e edita tipos |
| `GET/POST /admin/promoters`, `PATCH /admin/promoters/:id` | Promoters |

Datas chegam em ISO 8601 **com fuso** (`2026-12-12T22:00:00-03:00`); sem fuso é recusada. Preço em centavos inteiros. Erros no formato de sempre; 422 traz `detalhes: [{ campo, mensagem }]`.

## Regras

- **Estados do evento:** rascunho → publicado → encerrado; encerrado → publicado só por "Reabrir evento" (abaixo). Encerrar tira o destaque; evento encerrado não aceita edição, tipo novo nem banner. Nada é apagado.
- **Publicar** exige data futura e ao menos um tipo ativo (D-27). Publicações simultâneas resultam em uma só (linha trancada).
- **Tipo de ingresso:** preço de 1 centavo a R$ 100.000, quantidade de 1 a 100.000, fim das vendas depois do início, nome único por evento. Zero é proibido (gratuito e cortesia estão fora do escopo).
- **Estado de venda** (`salesState`, `domain/events.ts`): `indisponivel` (desativado) → `em_breve` → `encerrada` → `esgotado` (vendidos ≥ capacidade) → `reservado` (vendidos mais reservas ≥ capacidade) → `a_venda`. Reserva sozinha **não** esgota, porque pode voltar ao estoque: aparece como "Indisponível no momento". O checkout confere de novo.
- **Capacidade:** não pode ficar abaixo de vendidos mais reservas válidas (ativas e dentro do prazo). A linha do tipo é trancada (`FOR UPDATE`) durante a edição, o mesmo bloqueio que a reserva do Prompt 09 usará. A resposta 409 traz `vendidos`, `reservados` e `minimo`.
- **Promoter:** código de 3 a 20 letras ou números, sem acento. Minúsculas viram maiúsculas; duplicado é recusado pelo banco (inclusive em criações simultâneas). O código só atribui a venda: sem desconto, sem comissão.
- **Auditoria:** toda criação e edição grava autor, momento, antes e depois em `audit_log` (`evento.*`, `ingresso_tipo.*`, `promoter.*`). Desde 10/10/2026, ativar e desativar um tipo têm ação própria (`ingresso_tipo.ativar`, `ingresso_tipo.desativar`).
- **Encerrar o evento** tira do site e para as vendas, sem cancelar ingressos nem estornar. Desde 10/10/2026 a portaria **continua abrindo** o evento encerrado dentro da janela operacional (padrão de 12 h antes a 24 h depois do início; `GATE_CLOSED_WINDOW_*`, D-79), se ele foi encerrado já dentro dela; encerrado antes (cancelamento antecipado) fica fechado. O encerramento grava `events.closed_at` (migração 0006). Ver `portaria.md`.
- **Reabrir evento** (`POST /admin/events/:id/reopen` `{ reason }`, ADM02 e ADM04, 10/10/2026): só administrador e só evento encerrado. Volta a publicado, limpa `closed_at` (a portaria volta a abrir como qualquer publicado) e grava `evento.reabrir` com o motivo (5 a 500 caracteres) e o antes e depois. Os tipos mantêm o período: se as vendas já terminaram, o diálogo avisa que é preciso editar o período para voltar a vender; a resposta traz `typesOnSale`. O destaque não volta sozinho.
- **Encerrar vendas agora** (`POST /admin/events/:id/stop-sales`, 10/10/2026): ninguém mais compra; o evento continua publicado e a portaria funciona normalmente. Sem estado novo: todo tipo **ativo** com fim das vendas no futuro passa a terminar agora (um tipo "em breve" também tem o início trazido para agora menos 1 s, para manter fim > início). Inativos e já encerrados não mudam. Quem já tinha reserva pode concluir o pagamento dela. Uma linha `evento.encerrar_vendas` na trilha, com o antes e o depois de cada tipo. Reabrir = editar o período de um tipo. Repetir não muda nada.

## Banner (RF-13)

1. Limite de 5 MB (413 acima disso, antes de ler o corpo inteiro).
2. O formato é decidido pelo **conteúdo**, não pelo nome nem pelo `Content-Type`. Só JPEG, PNG e WebP; SVG, GIF e arquivos que não são imagem são recusados.
3. Mínimo de 600 px de largura (considerando a rotação da câmera). Limite de 40 milhões de pixels contra "bomba de descompressão".
4. Reencodado para WebP, no máximo 1600 px de largura, sem ampliar. Isso apaga EXIF, GPS e qualquer carga escondida no arquivo original.
5. Além do banner, o servidor gera uma imagem de pré-visualização 1200x630 em JPEG (abaixo de ~280 KB) para o WhatsApp, gravada ao lado como `<hash>-og.jpg` (ver `vitrine.md`). O nome do objeto é gerado no servidor: `events/<id do evento>/<hash do conteúdo>.webp`. Nada enviado pelo navegador entra no caminho. Repetir a mesma imagem não cria objeto novo.
6. Versões menores para o celular (11/10/2026, migração `0007_banner_responsivo`): no mesmo envio, o servidor grava o banner também em 640 e 1080 px (WebP, só as larguras menores que a imagem; nada é ampliado), como `<hash>-w640.webp` e `<hash>-w1080.webp`, **antes** de apontar o evento para o banner novo. As larguras ficam em `events.banner_widths` (vazio = banner antigo, exibido só pela `banner_url`) e a vitrine monta o `srcset` a partir delas (`bannerSrcSet` nos cartões e no evento). Banners enviados antes: `npm run banners:versoes` só confere e conta; `-- --executar` grava as versões e as larguras (idempotente). Em produção exige também `--producao-confirmado`, depois da conferência; **não foi executado em produção**.
6. Miniatura da capa (15/10/2026, migração `0015_capa_desfocada`): no mesmo envio, o servidor gera uma miniatura de 48 px em WebP, já desfocada (desde a segunda versão das transições, para a página não precisar de filtro de desfoque), e a guarda em `events.banner_placeholder` como `data:image/webp;base64,…` (cerca de 130 a 600 caracteres; regra no banco: só esse formato, até 1.500 caracteres e só com capa). Ela vai no card, na página e no HTML do destaque: a página mostra a miniatura na hora e troca pela capa nítida quando ela carrega. O HTML da página do evento leva também o `preload` da capa (prioridade normal), para ela começar a baixar junto com o JavaScript. Remover a capa apaga a miniatura; a trilha guarda só a URL. Capas enviadas antes: o mesmo `npm run banners:versoes` (agora em duas etapas, versões e miniaturas, idempotentes) preenche a miniatura a partir da versão de 640 px, com as mesmas travas (`--executar`, e `--producao-confirmado` em produção).
6. **Escrita restrita:** a conta do Cloud Run tem só `roles/storage.objectCreator` no bucket (`infra/homologacao/setup.sh`, que também remove o papel amplo `objectAdmin` de execuções anteriores). Como o nome é o hash, nunca precisa sobrescrever ou apagar; o versionamento do bucket guarda o histórico. Leitura é pública.
7. Variáveis: `BANNER_BUCKET` e, opcionalmente, `BANNER_PUBLIC_BASE_URL` (CDN ou domínio próprio). Sem bucket, só `APP_ENV=local` grava em `.data/banners` (servido por `/api/media/*`); nos demais ambientes o upload responde 503.

## Interface do painel (ADM02 a ADM06, 10/10/2026)

Arquivo `src/site/adminEvents.tsx`, com os componentes e estilos já existentes do site (a identidade visual será refinada depois). Toda regra continua no servidor; a tela orienta e mostra o erro que a API devolve, junto ao campo.

| Tela | Rota | O que tem |
|---|---|---|
| ADM02 Lista | `/admin/eventos` | Busca pelo nome (sem acento), filtro por situação, "Criar evento"; por evento: editar, ingressos, pré-visualizar e publicar (rascunho) ou ver página pública, encerrar vendas agora e encerrar evento (publicado). Cartões no celular, linhas no computador. Vazio, sem resultado, carregando e erro |
| ADM03 Criar e editar | `/admin/eventos/novo`, `/admin/eventos/:id/editar` | Nome, data e horário (fuso do evento), local, endereço, descrição, atrações (uma por linha), classificação, destaque e banner. Banner com pré-visualização, conferência de formato, tamanho e largura antes do envio (limites lidos de `/admin/events/meta`), barra de progresso e orientação de proporção. Ações: salvar rascunho, pré-visualizar (salva antes) e publicar (salva antes e confirma). Aviso de alterações não salvas no `beforeunload` e na navegação interna (`useLeaveGuard` em `router.tsx`) |
| Pré-visualização | `/admin/eventos/:id/previa` | A página pública do evento (`EventView`, o mesmo componente da vitrine), com aviso de que é prévia e nada à venda |
| ADM04 Detalhe | `/admin/eventos/:id` (`?aba=tipos` abre os tipos) | Situação, data, local; editar, pré-visualizar ou ver página pública, publicar, **encerrar vendas agora** ("ninguém mais compra; a portaria continua funcionando") e **encerrar evento** ("sai do site e para as vendas; a portaria continua funcionando até [fim da janela]"), ambos com confirmação e sem cancelar ingressos. Se o evento for hoje, o diálogo de encerrar evento destaca que "Encerrar vendas agora" costuma ser o mais indicado e oferece o atalho. Abas: Informações, Tipos de ingresso e as já existentes (Entradas ao vivo, Ingressos, Compradores, Contingência) |
| ADM05 Tipos | aba "Tipos de ingresso" | Nome, preço, capacidade, vendidos, reservados agora, disponíveis, período de vendas, situação de venda e ativo/inativo; reservas temporárias explicadas separadas das vendas; total do evento. Ativar e desativar com confirmação |
| ADM06 Criar e editar tipo | diálogo | Nome, valor com máscara de R$ (salvo em centavos inteiros; zero recusado), quantidade, início e fim das vendas, ativo. Capacidade abaixo de vendidos + reservas: aviso no campo com os números, antes do envio e com o 409 da API. Sem lotes automáticos (lote é nome de tipo), limite por compra explicado como configuração do pedido inteiro, meia-entrada sem comprovante |

Sucesso aparece em aviso rápido (`toast` em `components.tsx`, lido pelo leitor de tela). Verificado no navegador (Chromium, 360 px e 1280 px, banco descartável e dados fictícios): fluxo inteiro de criar rascunho com banner, erros no campo, três tipos, confirmação ao descartar e ao sair com alteração, pré-visualizar, publicar, ver na vitrine, encerrar e sumir da vitrine; nenhuma rolagem horizontal e nenhum botão, campo ou link de navegação com menos de 44 px de altura.

## Verificação

Testes de integração em PostgreSQL real (`events.integration.test.ts`, 37 testes), unitários de domínio e de imagem. Validados por mutação: sem a checagem de capacidade, sem a trava da linha e sem a validação de formato, testes falham. A trava é provada com uma transação externa que segura a linha: a edição espera, e ao liberar enxerga a reserva.

## O que **não** foi verificado

- **Cloud Storage real.** O envio foi testado com armazenamento em memória e a implementação do GCS não foi executada contra um bucket. O deploy de homologação não foi refeito (`BANNER_BUCKET` já está em `deploy.sh`, `setup.sh` ajustado, nada executado). Fazer: rodar `setup.sh`, publicar e enviar um banner de teste.
- **`ifGenerationMatch: 0`** (criar só se não existe) exige confirmar que `objectCreator` basta; em caso de 403, ver o papel mínimo.
- Interface do painel em Safari e Firefox, em aparelhos reais e com leitor de tela (só Chromium automatizado). Envio de banner pela tela contra o Cloud Storage real.

## Decisões abertas

D-27 (condições de publicação), D-28 (formatos e limites do banner), D-29 (editar preço com vendas), D-30 (quantos destaques). Ver `registros/decisoes-pendentes.md`. O limite de ingressos por compra, que o protótipo põe no formulário do evento, é decisão do cliente (insumo) e entra com a reserva (Prompt 09).
