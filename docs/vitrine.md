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
| `/api/public/events?q=` | Lista com busca por parte do nome. Desde 16/10/2026 sem busca por data (D-89): um `date` de link antigo é ignorado |
| `/api/public/events/:slug` | Evento completo com tipos, preços, estado e texto de cada um |
| `/api/public/site` | Ambiente e `provisionalTheme` (a faixa amarela de tema provisório) |

## Regras

- **Rascunho não existe para o público:** some das listas, e a página dá 404. **Encerrado** sai das listas, mas a página continua acessível, sem venda.
- **Janela de exibição:** evento publicado fica na vitrine até **8 horas depois do início** (regra do protótipo; D-31). Encerrar é manual.
- **Sem filtro**, a lista traz eventos à venda, por começar, esgotados e indisponíveis por reserva; **vendas encerradas** só aparecem na busca. A página inicial mostra só o que tem venda em andamento ou por começar.
- **Busca (CA-12):** só pelo nome, a busca do cabeçalho (D-89, 16/10/2026). Ignora acento e maiúsculas e acha por parte do nome. `%`, `_` e aspas são texto comum (a busca é feita em memória, sem montar SQL).
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

Início (destaque, próximos), lista de eventos (a busca fica na URL; com busca, "Resultados para" e "Limpar busca"; sem resultado, "Nenhum evento encontrado para" e "Ver todos os eventos"). Desde 16/10/2026 a única busca é a do cabeçalho; no celular, a lupa abre o campo por cima da linha do cabeçalho (fecha no X, no Esc ou ao tocar fora). Também: página do evento (banner, data, horário, local, classificação, descrição, atrações, tipos com preço, compartilhar por WhatsApp, Facebook, X, copiar e compartilhar do aparelho), 404. Estados de carregamento, vazio e erro com "tentar de novo".

Acessibilidade: link "ir para o conteúdo", marcos (`header`, `nav`, `main`), `label` em todos os campos, resultado da busca anunciado (`aria-live`), estado sempre em texto (nunca só cor), foco visível, alvos de toque de 44 px, campos de 16 px (sem zoom no iPhone), `prefers-reduced-motion`.

**Tema provisório:** cores e fonte do protótipo, com a faixa "Tema provisório" até a aprovação visual (Prompt 19). O rodapé usa o mesmo aviso de dados a fornecer.

## Abertura e logotipo (10/10/2026; regras novas em 16/10/2026)

Desde 16/10/2026 a abertura toca em toda carga de página (registro: `registros/abertura-sempre-2026-10-16.md`). Antes, tocava uma vez por aba, só na vitrine, e fechava na hora quando o vídeo era bloqueado.

- **Quando toca:** em toda carga de página (primeira visita, recarregar, nova aba, link de fora), na volta pelo Voltar restaurada do cache do navegador (`pageshow` com `persisted`) e na volta para a aba depois de pelo menos 1 minuto fora (`visibilitychange`; a hora em que a aba ficou escondida fica só na memória). Sem marca de "já viu". Navegar por links dentro do site não é carga de página e não toca.
- **Onde nunca toca (rotas de tarefa):** `/admin` e `/portaria` (com as subpáginas), `/checkout/...`, `/pedido/...` (pagamento: a pessoa sai para o app do banco e volta), `/ingressos/...` (QR Code, tela cheia, transferir), `/meus-ingressos`, `/autorizacao-menor/...`, `/entrar`, `/criar-conta`, `/primeiro-acesso`, `/recuperar-senha` e `/redefinir-senha`. Nelas o vídeo não é baixado.
- **Como toca:** vídeo MP4 sem som (`muted`, `playsinline`, `autoplay`, `preload="auto"`, poster preto). Se o `play()` for recusado (iPhone em Pouca Energia, navegador interno que exige toque) ou o vídeo não começar em 1 s, entra o logo PartyX em SVG com uma animação em CSS de cerca de 1,5 s (o X aparece e o PARTY entra ao lado). Com economia de dados, vai direto para ela, sem baixar o vídeo. Com "reduzir movimento", o logo parado com um fade curto.
- **Quanto dura:** some em no máximo **4 s, com o fade**, contados da abertura do site ou da volta à aba. O fade começa no fim do vídeo e encurta quando sobra pouco, para o vídeo terminar inteiro mesmo começando com até 1 s de atraso. Um toque em qualquer lugar, o Esc ou o "Pular" pulam; o toque termina na camada, que fica por cima durante o fade, e nada passa para a página.
- **Quem decide:** `public/intro/abertura.js`, carregado no `<head>` antes da primeira pintura (o CSP não permite script em linha; nome novo porque o estático fica 1 hora em cache). A camada (`#px-abertura`, com o vídeo sem endereço e o logo em SVG) já vem no `index.html`, e o script marca `<html data-px-abertura="video|css|parado">`: o site não pisca antes dela. O vídeo recebe o endereço logo que o HTML termina de chegar, antes do JavaScript do site. A página é montada normalmente por baixo, inerte e sem rolagem. Estilos em `src/site/styles/abertura.css` (no CSS de entrada). Os testes desligam a abertura com `window.__partyxSemAbertura = true`, posto antes do carregamento; não vale para visitantes.
- **Arquivos:** `public/intro/partyx-intro.mp4` (H.264, 1080×1080, sem áudio, preto do vídeo igual a `#0B0B10`, 80 KB, com faststart); o logo em SVG está no próprio `index.html` (vetorizado do original `IMG_3404.PNG`, 99,9% de sobreposição com ele); logotipos em `public/brand/`; ícones em `public/`. Os originais ficam em `assets-originais/` (fora da imagem). Para regerar a logo e os ícones: `node reference/tools/brand-assets.mjs assets-originais/IMG_3404.PNG`. O vídeo é gerado com ffmpeg a partir do `.MOV` (recorte quadrado central, preto elevado para `#0B0B10`, H.264 CRF 23). O WebM e a imagem de poster saíram em 16/10/2026.
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
