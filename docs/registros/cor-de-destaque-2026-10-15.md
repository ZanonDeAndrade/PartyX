# Cor de destaque por evento (15/10/2026)

Pedido do responsável (Arthur), nesta data: campo "Cor de destaque" no cadastro do evento (seletor RGB e hexadecimal, prévia, "Voltar ao padrão" e, opcional, "Sugerir pela imagem de capa"), aplicado só na página do evento; texto preto ou branco pelo contraste WCAG (mínimo 4,5:1); variações de passar o mouse, desabilitado e fundo suave; só `#RRGGBB`, validado no servidor, aplicado por variável CSS, com a mesma CSP; migração só de expansão; testes e capturas a 360 e 1280 px com verde, amarelo, vermelho e o padrão. Regras do pedido: plano e migração antes, testes, commits locais, OK antes de publicar.

Respostas do responsável às perguntas do plano: na vitrine, **só o bloco da data** do card; sugestão **pela capa salva** (com capa nova ainda não salva, o painel pede para salvar antes).

## Como ficou

| Onde | Com a cor do evento | Sempre com as cores da PartyX |
|---|---|---|
| Página do evento | Bloco da data, blocos do cronômetro e "Acontecendo agora", frase do cronômetro, linhas laterais de Quando, Onde e Classificação, borda e fundo suave do aviso de menores, links, "Últimas unidades deste lote", "Continuar" (no quadro e na barra fixa do celular), anel de foco, aviso informativo do quadro de ingressos | Cabeçalho, menu, botão "Painel", rodapé |
| Vitrine | Bloco da data do card do evento | O resto do card ("Comprar", título) e o destaque da página inicial |
| Painel | A prévia do campo e a pré-visualização da página (ADM03) | O próprio painel |

- **Texto sobre a cor:** branco ou o preto de marca (#0B0B10), o que der mais contraste. Com #0B0B10 existe uma faixa estreita de cores médias (cerca de 4,43:1 no melhor caso) em que nenhum dos dois chega a 4,5:1: aí o fundo anda na luminosidade, com o mesmo matiz, até o tom mais próximo que chega, e o painel avisa ("Contraste insuficiente"), com um botão para pôr esse tom no campo. A página sempre usa o tom ajustado, mesmo que o campo guarde a cor original.
- **Tons derivados (só quando precisam):** links e frase no fundo preto com 4,5:1; linhas no preto com 3:1; texto em destaque no quadro branco com 4,5:1; borda do botão quando a cor quase some no branco (3:1); anel de foco com 3:1 no preto e no branco; fundo suave com texto a 4,5:1. Quando um deles difere da cor escolhida, o painel diz qual tom foi usado.
- **Passar o mouse e pressionar:** 12% e 22% na direção que aumenta o contraste do texto; se a mudança mal apareceria (amarelo, cores quase brancas), as duas vão para o outro lado, mantendo 4,5:1.
- **Desabilitado:** com cor própria, o botão esmaece como antes (opacidade 0,45) e também perde a saturação (`saturate(0.15)`), então nenhuma cor parece ativa. Sem cor própria, nada mudou.
- **Aplicação:** a página do evento ganhou um invólucro `.px-event-scope` (`display: contents`, sem efeito no layout) com as variáveis calculadas em `src/site/accent.ts`; os valores são sempre hexadecimais ou `rgb()` gerados ali, nunca o texto gravado. Tokens novos em `tokens.css` (`--px-on-accent`, `--px-violet-text`, `--px-violet-line`, `--px-accent-tint`, `--px-focus-glow`) com o valor de antes, então eventos sem cor ficam idênticos. CSP sem mudança.
- **Servidor:** `checkAccentColor` (`server/src/domain/accent.ts`) aceita nulo, vazio (vira nulo) ou `#RRGGBB` e grava em maiúsculas; qualquer outra coisa é 422 no campo `accentColor` ("Use uma cor no formato #RRGGBB (por exemplo, #7C3AED)."). A cor vai na trilha (`evento.editar`, antes e depois), no card e na página pública.
- **Sugestão pela capa:** `POST /admin/events/:id/accent-suggestion`, só administrador, só leitura (não grava nada). Lê a capa salva (a versão de 640 px quando existe), reduz a 48 x 48 e escolhe a cor viva mais presente, ignorando preto, branco e cinza; nula se a capa não tem cor viva. O nome do arquivo sai da URL gravada e só vale se for da pasta do próprio evento. Sem capa: 404 `sem_banner`; armazenamento indisponível ou arquivo ilegível: 503, com o erro no log.
- **Banco:** migração `drizzle/0014_cor_de_destaque.sql` (só expande: `events.accent_color` anulável, com a regra `events_accent_color_format`, `^#[0-9A-F]{6}$`). Eventos existentes ficam nulos, isto é, roxos. Reversão em `drizzle/rollback/0014_cor_de_destaque.down.sql` (perde só a cor escolhida).

## Premissas e decisões

- O destaque da página inicial continua roxo: ele faz parte da vitrine da PartyX e é montado também no HTML do servidor; levar a cor para lá exigiria repetir o cálculo de contraste no servidor.
- A pré-visualização do painel (ADM03) mostra a cor, porque usa a mesma página.
- Se a pessoa digitar sem `#` ou em minúsculas, o painel corrige ao sair do campo; o servidor continua exigindo `#RRGGBB`.

## Verificação (local)

- `npm run lint` (0 erros, 27 avisos antigos), `npm run typecheck`, `npm run build`, `npm run check:migrations` (15 migrações), `npm run test:db` (1.087 + 4, nenhum pulado), `npm run e2e:textos` (78 de 78), `npm run e2e:cronometro` (7 de 7) e o novo `npm run e2e:cor` (6 de 6).
- `src/site/accent.test.ts`: cor clara com texto preto e borda no branco, cores escuras com texto branco, faixa sem contraste ajustada e avisada, 308 cores (fixas e aleatórias) com todos os tons conferidos, variáveis só com valores calculados.
- `server/src/domain/accent.test.ts`: formato aceito e recusado; sugestão com preto, branco e cinza ignorados, peso por quantidade e saturação, pixels com alfa, capa sem cor viva.
- `server/src/api/events.integration.test.ts` (bloco "cor de destaque"): sem cor, válida em maiúsculas na página e no card, volta ao padrão com nulo e vazio, trilha, criação com cor, edição sem o campo mantém a cor, sete formatos recusados com 422, regra no banco, sugestão (verde numa capa com preto e branco, nula numa capa cinza, 404, 503 e 403).
- `e2e/cor-destaque.spec.ts` (Chromium, servidor local, dados fictícios): padrão, verde, amarelo e vermelho a 360 e 1280 px conferindo os estilos calculados (bloco da data, cronômetro, linhas, aviso de menores e links, "Continuar" ativo e desabilitado, borda no amarelo, anel de foco), botão "Painel" roxo, sem rolagem lateral; card da vitrine; painel (seletor, hexadecimal, prévia, aviso e ajuste de contraste, voltar ao padrão, erro de formato com foco no campo, salvar e ver na página).
- Capturas publicadas para o responsável (página privada, link no relatório da sessão).

## Publicação

Não publicado. Com o OK do responsável: `release-2026-10-15d`, com a migração 0014, pelo fluxo de sempre (build, backup, migrate, candidata, virar, bateria). A revisão no ar (`partyx-00020-kug`) funciona com o banco já migrado, porque a 0014 só acrescenta uma coluna que ela não lê; ela é a referência de retorno.
