# Vitrine pública

Implementado em 01/10/2026 (Prompt 08): RF-20 a RF-27 e CA-12 a CA-14. É a primeira interface **real** do projeto, ao lado do protótipo navegável.

## Onde está cada coisa

| O quê | Onde |
|---|---|
| API pública (sem login) | `server/src/api/public.ts`, `server/src/vitrine/service.ts`, regras em `server/src/domain/vitrine.ts` |
| Open Graph no servidor | `server/src/vitrine/og.ts` e a rota `/eventos/:slug` em `server/src/app.ts` |
| Páginas | `src/site/` (`SiteApp.tsx`, `pages.tsx`, `components.tsx`, `site.css`) |
| Protótipo navegável | Agora em **`/prototipo`** (antes ocupava `/`). A documentação segue em `/docs` |

## API (todas `GET`, públicas, cache de 15 s)

| Rota | O que devolve |
|---|---|
| `/api/public/home` | `featured` (destaques à venda) e `upcoming` (próximos eventos) |
| `/api/public/events?q=&date=` | Lista com busca por parte do nome e/ou data (`AAAA-MM-DD`, fuso do evento) |
| `/api/public/events/:slug` | Evento completo com tipos, preços, estado e texto de cada um |
| `/api/public/site` | Ambiente e `provisionalTheme` (a faixa amarela de tema provisório) |

## Regras

- **Rascunho não existe para o público:** some das listas, e a página dá 404. **Encerrado** sai das listas, mas a página continua acessível, sem venda.
- **Janela de exibição:** evento publicado fica na vitrine até **8 horas depois do início** (regra do protótipo; D-31). Encerrar é manual.
- **Sem filtro**, a lista traz eventos à venda, por começar, esgotados e indisponíveis por reserva; **vendas encerradas** só aparecem na busca. A página inicial mostra só o que tem venda em andamento ou por começar.
- **Busca (CA-12):** ignora acento e maiúsculas e acha por parte do nome. A data é comparada no fuso de Brasília (23h30 em Brasília ainda é o dia). `%`, `_` e aspas são texto comum (a busca é feita em memória, sem montar SQL).
- **Estado do evento:** à venda (com "a partir de" o menor preço entre os tipos à venda), vendas a partir de dd/mm, esgotado, indisponível no momento (só reservas em andamento), vendas encerradas, evento encerrado.
- **Estoque exato nunca é público.** Só o estado de cada tipo e se pode ser comprado (`canBuy`). Disponibilidade em cache não substitui a conferência do checkout (Prompt 09).

## Open Graph (RF-26, CA-13)

O WhatsApp não executa JavaScript. Em `/eventos/:slug` o servidor lê o `index.html` e troca a região `<!--og:start-->...<!--og:end-->` por título, descrição (data, horário, local e início da descrição), URL canônica e imagem.

- **Página inicial no HTML (11/10/2026):** ao servir `/`, o servidor embute a vitrine (`<script id="px-home-data" type="application/json">`, com `<` escapado), o `preload` do banner do destaque (`fetchpriority="high"`, nas larguras do `srcset`) e uma cópia estática do cabeçalho e do destaque dentro de `#root`, que o React troca pelo mesmo conteúdo ao montar. A consulta fica 60 s em memória por instância (só exibição; o checkout confere o estoque na hora). Sem banco ou com erro, a página sai como antes e o front-end busca pela API. Código em `server/src/vitrine/homeHtml.ts`.
- **Imagem:** o banner é gravado também como JPEG 1200x630 (`<hash>-og.jpg`, qualidade reduzida até caber em ~280 KB, porque o WhatsApp ignora imagens grandes). A URL é derivada do banner trocando `.webp` por `-og.jpg`.
- Todo texto é escapado; `$` no texto não vira padrão de substituição. Testes com nome e descrição maliciosos.
- Rascunho ou inexistente: **404 com tags genéricas**, sem nenhum dado do evento.
- Sem banner: cartão simples, sem `og:image`.
- A URL usa `PUBLIC_BASE_URL` (obrigatória em homologação e produção para o link ficar correto).

## Páginas

Início (destaque, busca, próximos), lista com busca e filtros removíveis (a busca fica na URL), página do evento (banner, data, horário, local, classificação, descrição, atrações, tipos com preço, compartilhar por WhatsApp, Facebook, X, copiar e compartilhar do aparelho), 404. Estados de carregamento, vazio e erro com "tentar de novo".

Acessibilidade: link "ir para o conteúdo", marcos (`header`, `nav`, `main`), `label` em todos os campos, resultado da busca anunciado (`aria-live`), estado sempre em texto (nunca só cor), foco visível, alvos de toque de 44 px, campos de 16 px (sem zoom no iPhone), `prefers-reduced-motion`.

**Tema provisório:** cores e fonte do protótipo, com a faixa "Tema provisório" até a aprovação visual (Prompt 19). O rodapé usa o mesmo aviso de dados a fornecer.

## Abertura em vídeo e logotipo (10/10/2026)

- **Quando toca:** só na primeira página aberta na sessão, e só se ela for início, `/eventos` ou `/eventos/:slug`. Não toca com "reduzir movimento", no modo de economia de dados nem sem `sessionStorage`. Compra, conta, ingressos, painel, portaria, entrar, recuperar/redefinir senha e documentos nunca tocam (a primeira página dessas já marca a sessão).
- **Quem decide:** `public/intro/gate.js`, carregado no `<head>` antes da primeira pintura (o CSP não permite script em linha). Ele marca `<html data-px-intro>`: o CSS já pinta o fundo de preto e `src/site/IntroSplash.tsx` lê a mesma marca. Não há SSR, então não existe risco de hidratação; a página é desenhada por baixo (inerte e sem rolagem) e o HTML com o Open Graph não depende da abertura.
- **Nunca prende o site:** fecha no fim do vídeo, no "Pular", no Esc, se o `play()` for recusado, se nenhum formato carregar e, no máximo, **5 s depois de o visitante abrir o endereço** (contados pela navegação, com o fade incluído).
- **Arquivos:** `public/intro/partyx-intro.{webm,mp4}` (1080×1080, sem áudio, preto do vídeo igual a `#0B0B10`) e `partyx-intro-poster.jpg`; logotipos em `public/brand/`; ícones em `public/`. Os originais ficam em `assets-originais/` (fora da imagem). Para regerar a logo e os ícones: `node reference/tools/brand-assets.mjs assets-originais/IMG_3404.PNG`. Os vídeos são gerados com ffmpeg a partir do `.MOV` (recorte quadrado central, preto elevado para `#0B0B10`, H.264 CRF 23 e VP9 CRF 34).
- **Servidor:** vídeo com `Content-Type` certo e `Range` (206, exigido pelo Safari do iPhone), com o mesmo `Cache-Control` de 1 hora dos demais estáticos. `/brand/*` sai com `Cross-Origin-Resource-Policy: cross-origin`, porque a logo aparece nos e-mails; o resto segue `same-origin`.

## O que foi verificado

- 35 testes novos (a maioria de integração em PostgreSQL real: rascunho, encerrado, janela de 8 h, destaques, busca por nome/data/acento, estados dos tipos, reserva que vence, OG, XSS) e testes unitários. Mutações: sem o filtro de rascunho e sem o escape do HTML, testes falham.
- Navegador real (Playwright), com servidor local, banco descartável e banner enviado pelo endpoint do painel: **Chromium e WebKit (motor do Safari) a 360, 768 e 1280 px**, seis páginas cada: **sem rolagem horizontal**, imagens carregadas, título correto por página. Busca por nome, remoção de filtro, estado vazio e foco por teclado exercitados.

## O que **não** foi verificado

- **Link no WhatsApp real (CA-13).** As tags estão no HTML e a imagem é pequena, mas o WhatsApp só lê URL pública em HTTPS e guarda cache. Teste a fazer em homologação com o domínio definitivo (e o Sharing Debugger do Facebook).
- **Aparelhos reais** (Chrome Android, Safari iPhone): só emulação de motor e tamanho. Fica para o Prompt 24.
- **Auditoria de acessibilidade automática** (axe/Lighthouse) e leitor de tela.
- **Compra:** seleção, entrar, criar conta, revisão e pedido existem desde o Prompt 10 (ver `pagamento.md`). Ainda não há Meus ingressos nem os textos de Termos e Privacidade (Prompts 13 e 19).
- Cloud Storage real continua sem teste (ver `eventos.md`).

## Decisões abertas

D-31 (8 horas e encerramento manual) e D-32 (tipos desativados visíveis). D-30 (quantos destaques) segue pendente.
