# Eventos, tipos de ingresso e promoters

Implementado em 01/10/2026 (Prompt 07): RF-11 a RF-19 e CA-07 a CA-11 (parte API). Código em `server/src/events/service.ts`, `server/src/api/events.ts`, `server/src/media/banner.ts`, `server/src/providers/bannerStorage.ts` e `server/src/domain/events.ts`. **Sem migração**: as tabelas `events`, `ticket_types`, `promoters` e `audit_log` já existiam.

**O front-end ainda não usa esta API.** O painel (ADM02 a ADM08) continua simulado. A vitrine pública é o Prompt 08; a venda e a reserva, o Prompt 09. Dados de teste são fictícios; nenhum evento real foi cadastrado.

## Rotas (todas sob `/api/admin`, só administrador)

| Rota | O que faz |
|---|---|
| `GET /admin/events`, `GET /admin/events/:id` | Lista; detalhe com tipos, vendidos, reservados, disponíveis e estado de venda |
| `POST /admin/events` | Cria em rascunho. O endereço (`slug`) sai do nome; repetido ganha `-2`, `-3`... |
| `PATCH /admin/events/:id` | Edita campos. O `slug` não muda |
| `POST /admin/events/:id/publish` / `close` | Rascunho → publicado; publicado → encerrado |
| `PUT /admin/events/:id/banner` | Envia a imagem (multipart, campo `file`). `DELETE` remove a URL |
| `POST /admin/events/:id/ticket-types`, `PATCH /admin/ticket-types/:id` | Cria e edita tipos |
| `GET/POST /admin/promoters`, `PATCH /admin/promoters/:id` | Promoters |

Datas chegam em ISO 8601 **com fuso** (`2026-12-12T22:00:00-03:00`); sem fuso é recusada. Preço em centavos inteiros. Erros no formato de sempre; 422 traz `detalhes: [{ campo, mensagem }]`.

## Regras

- **Estados do evento:** rascunho → publicado → encerrado, sem volta. Encerrar tira o destaque; evento encerrado não aceita edição, tipo novo nem banner. Nada é apagado.
- **Publicar** exige data futura e ao menos um tipo ativo (D-27). Publicações simultâneas resultam em uma só (linha trancada).
- **Tipo de ingresso:** preço de 1 centavo a R$ 100.000, quantidade de 1 a 100.000, fim das vendas depois do início, nome único por evento. Zero é proibido (gratuito e cortesia estão fora do escopo).
- **Estado de venda** (`salesState`, `domain/events.ts`): `indisponivel` (desativado) → `em_breve` → `encerrada` → `esgotado` (vendidos ≥ capacidade) → `reservado` (vendidos mais reservas ≥ capacidade) → `a_venda`. Reserva sozinha **não** esgota, porque pode voltar ao estoque: aparece como "Indisponível no momento". O checkout confere de novo.
- **Capacidade:** não pode ficar abaixo de vendidos mais reservas válidas (ativas e dentro do prazo). A linha do tipo é trancada (`FOR UPDATE`) durante a edição, o mesmo bloqueio que a reserva do Prompt 09 usará. A resposta 409 traz `vendidos`, `reservados` e `minimo`.
- **Promoter:** código de 3 a 20 letras ou números, sem acento. Minúsculas viram maiúsculas; duplicado é recusado pelo banco (inclusive em criações simultâneas). O código só atribui a venda: sem desconto, sem comissão.
- **Auditoria:** toda criação e edição grava autor, momento, antes e depois em `audit_log` (`evento.*`, `ingresso_tipo.*`, `promoter.*`).

## Banner (RF-13)

1. Limite de 5 MB (413 acima disso, antes de ler o corpo inteiro).
2. O formato é decidido pelo **conteúdo**, não pelo nome nem pelo `Content-Type`. Só JPEG, PNG e WebP; SVG, GIF e arquivos que não são imagem são recusados.
3. Mínimo de 600 px de largura (considerando a rotação da câmera). Limite de 40 milhões de pixels contra "bomba de descompressão".
4. Reencodado para WebP, no máximo 1600 px de largura, sem ampliar. Isso apaga EXIF, GPS e qualquer carga escondida no arquivo original.
5. Além do banner, o servidor gera uma imagem de pré-visualização 1200x630 em JPEG (abaixo de ~280 KB) para o WhatsApp, gravada ao lado como `<hash>-og.jpg` (ver `vitrine.md`). O nome do objeto é gerado no servidor: `events/<id do evento>/<hash do conteúdo>.webp`. Nada enviado pelo navegador entra no caminho. Repetir a mesma imagem não cria objeto novo.
6. **Escrita restrita:** a conta do Cloud Run tem só `roles/storage.objectCreator` no bucket (`infra/homologacao/setup.sh`, que também remove o papel amplo `objectAdmin` de execuções anteriores). Como o nome é o hash, nunca precisa sobrescrever ou apagar; o versionamento do bucket guarda o histórico. Leitura é pública.
7. Variáveis: `BANNER_BUCKET` e, opcionalmente, `BANNER_PUBLIC_BASE_URL` (CDN ou domínio próprio). Sem bucket, só `APP_ENV=local` grava em `.data/banners` (servido por `/api/media/*`); nos demais ambientes o upload responde 503.

## Verificação

Testes de integração em PostgreSQL real (`events.integration.test.ts`, 37 testes), unitários de domínio e de imagem. Validados por mutação: sem a checagem de capacidade, sem a trava da linha e sem a validação de formato, testes falham. A trava é provada com uma transação externa que segura a linha: a edição espera, e ao liberar enxerga a reserva.

## O que **não** foi verificado

- **Cloud Storage real.** O envio foi testado com armazenamento em memória e a implementação do GCS não foi executada contra um bucket. O deploy de homologação não foi refeito (`BANNER_BUCKET` já está em `deploy.sh`, `setup.sh` ajustado, nada executado). Fazer: rodar `setup.sh`, publicar e enviar um banner de teste.
- **`ifGenerationMatch: 0`** (criar só se não existe) exige confirmar que `objectCreator` basta; em caso de 403, ver o papel mínimo.
- Tela do painel, vitrine e Open Graph (Prompts 08 e 16).
- CA-07 (rascunho não aparece no site) e CA-11 (encerrado sai da listagem) estão provados só no estado; a listagem pública é do Prompt 08. CA-09 (esgotado ao vender a última) depende da venda real (Prompt 09).

## Decisões abertas

D-27 (condições de publicação), D-28 (formatos e limites do banner), D-29 (editar preço com vendas), D-30 (quantos destaques). Ver `registros/decisoes-pendentes.md`. O limite de ingressos por compra, que o protótipo põe no formulário do evento, é decisão do cliente (insumo) e entra com a reserva (Prompt 09).
