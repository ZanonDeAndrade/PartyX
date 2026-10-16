# Visual, responsividade e textos legais

Implementado em 04/10/2026 (Prompt 19): RF-65, RF-66 (provisório), RF-67 (provisório), RF-68, CA-14, CA-32. **CA-33 depende do cliente.** Código em `src/site/` (CSS e páginas), `server/src/legal/documents.ts`, `server/src/api/public.ts` e `server/src/orders/service.ts`. **Sem migração.**

## Responsividade (RF-65, CA-14, CA-32)

- Larguras medidas em Chromium com uma varredura automática de **29 telas** (site público, conta, checkout, pedido, ingresso e tela cheia, painel inteiro, relatórios, portaria, páginas legais) em **360, 390, 768 e 1440 px**: 116 medições, **nenhuma com rolagem horizontal** (`scrollWidth` igual a `clientWidth`).
- **Tabelas do painel e dos relatórios viram cartões abaixo de 640 px** (D-60): o cabeçalho continua para leitores de tela e cada valor mostra o rótulo da coluna. Antes, a tabela rolava dentro da própria caixa. O componente é `TableWrap` (`src/site/adminPages.tsx`), que rotula as células a partir do cabeçalho, inclusive em linhas de subtotal.
- Abas do evento e menu do painel quebram em linhas em vez de rolar.
- Alvos de toque do cabeçalho e dos links do rodapé com 44 px de altura; verificação automática de `lang`, um único `h1`, `main`, imagens com `alt`, campos com rótulo e controles com nome acessível em 9 telas: sem pendências.
- QR legível: o QR do ingresso é desenhado em vetor, com margem e tela cheia (Prompt 13); a leitura foi testada com `jsQR` em tamanhos reduzidos e por câmera simulada na portaria (Prompt 15).

## Textos legais (RF-68, D-11)

> Atualização de 16/10/2026: não há meia-entrada (D-06). O documento de regras e a página `/meia-entrada` saíram do site; a página antiga vai para `/termos-de-uso` com 301 (`sem-meia-entrada-2026-10-16.md`). As menções abaixo à meia-entrada são históricas.

A PartyX fornece os textos; **a CONTRATADA não os redige**. Páginas: `/termos-de-uso`, `/privacidade`, `/politica-de-cancelamento`, `/meia-entrada`. Rodapé (todas as páginas) e checkout trazem os links; o evento com tipo de ingresso cujo nome contém "meia" mostra o link das regras.

Os textos ficam em **arquivos de texto simples** numa pasta fora do Git, apontada por `LEGAL_CONTENT_DIR`: `termos-de-uso.txt`, `privacidade.txt`, `cancelamento.txt`, `meia-entrada.txt`. Parágrafos separados por linha em branco; `# ` no início marca um título. O conteúdo **nunca é tratado como HTML** (testado). Máximo de 200 KB por arquivo. A versão vem de `TERMS_VERSION`, `PRIVACY_VERSION` e `CANCELLATION_VERSION`; trocar o arquivo e a versão juntos é o que publica uma nova versão (o cadastro registra a versão aceita).

| Situação                          | O que o visitante vê                                           |
| --------------------------------- | -------------------------------------------------------------- |
| Arquivo presente                  | Texto da PartyX, com a versão                                  |
| Arquivo ausente, fora de produção | Aviso "ambiente de homologação", **sem texto jurídico**        |
| Arquivo ausente, em produção      | "Documento ainda não disponível"; vendas e cadastro bloqueados |

### Bloqueio de produção

Mesmo com `SALES_OPEN=true`, `APP_ENV=producao` **recusa criar pedidos** (503 `vendas_fechadas`, com o motivo no log, sem expô-lo ao comprador) enquanto faltar qualquer item: versões dos Termos, da Privacidade e do Cancelamento; os três arquivos de texto; e a aprovação visual (`VISUAL_APPROVED=true`). O cadastro já era bloqueado sem as versões (Prompt 05). A meia-entrada só é exigida se o cliente oferecer o tipo.

### Etapa 08 (11/10/2026): versão, data, publicação e cadastro

- **Versão e data de vigência:** `TERMS_DATE`, `PRIVACY_DATE` e `CANCELLATION_DATE` (AAAA-MM-DD, validadas na partida). A página do documento oficial mostra "Versão X" e "Vigente desde DD/MM/AAAA". Sem texto oficial, nenhuma data é exibida.
- **Publicação na nuvem:** pasta `conteudo-legal/`, no Git desde 14/10/2026 (antes ficava fora), levada da tag para a imagem (`/app/legal`) no build; `LEGAL_CONTENT_DIR=/app/legal` no deploy. Ver `../README-DEPLOY.md`, seção 8c-2.
- **Aceite versionado (RF-03):** a tela de cadastro mostra a versão e a data dos Termos e da Privacidade que a pessoa aceita; o servidor recusa (409) aceite de versão diferente da publicada e grava em `consents` a versão, a data e o IP. A Política de Cancelamento é ligada no checkout e exigida para vender; seu aceite não é gravado no cadastro (RF-03 cita só Termos e Privacidade; premissa D-80).
- **Cadastro em produção (D-80, D-84):** fechado por padrão (`SIGNUP_OPEN`). Mesmo com `SIGNUP_OPEN=true`, só abre com os Termos de Uso e a Política de Privacidade publicados (arquivo, versão e data); cada falta vai para o log (`cadastro bloqueado`), nunca para a tela. Desde 14/10/2026 (D-84, decisão do responsável) a Política de Cancelamento não é exigida para cadastrar, só para vender. A venda exige os três textos, com as datas.

### Regras de menores (14/10/2026, D-85): Termos 1.1, Privacidade 1.1 e textos de menores

Termos de Uso 1.1 e Política de Privacidade 1.1 (data de nascimento, menores de 16 e 17, guarda do termo em papel), o Termo de Ciência para Menores 1.0 (`termo-menor.txt`, aceito no checkout e público em `/termo-menor`) e o texto do Termo de Autorização 1.0 (`autorizacao-menor.txt`, usado no PDF). Versões por `MINOR_TERM_*` e `MINOR_AUTHORIZATION_*`; em produção, a compra de menor e o PDF exigem os dois publicados. **Novo aceite:** quem aceitou uma versão anterior vê a tela "Atualizamos os documentos" depois do login, e o checkout recusa (`aceite_pendente`) até aceitar. A vigência da 1.1 é a data da publicação.

### Publicação de 14/10/2026: Termos 1.0 e Privacidade 1.0

Termos de Uso e Política de Privacidade, versão 1.0, vigentes em 14/10/2026, entregues pelo responsável (D-11) e postos em `conteudo-legal/`, versionados no Git por decisão dele (textos públicos; a imagem os leva da tag); versões, datas e os dados públicos da PartyX (`PARTYX_*`, D-16) no `infra/producao/env.prod.yaml`. O rodapé ganhou a linha "Desenvolvido por Zanon de Andrade Softwares - CNPJ 57.971.378/0001-50". Conferido em servidor local a 360 px: página dos Termos com "Versão 1.0" e "Vigente desde 14/10/2026", cadastro mostrando a versão e a data aceitas, rodapé com razão social, CNPJ, endereço e contatos, e nenhuma rolagem horizontal. A Política de Cancelamento continua pendente.
- **Homologação:** sem o texto oficial, o cadastro mostra o aviso "Ambiente de homologação. Os Termos de Uso e a Política de Privacidade oficiais da PartyX ainda não foram publicados. O aceite aqui registra uma versão de teste, sem valor jurídico." As páginas legais continuam com o aviso sem texto jurídico.
- **Insumos:** não existe `docs/insumos/` e nenhum texto oficial foi recebido (D-11). Nada foi redigido pela contratada.

## Identidade visual (RF-66, RF-67, CA-33)

Aplicada a identidade **provisória** do protótipo (D-10). A proposta para aprovação escrita está em `proposta-visual.md` e o registro de envio e resposta em `registros/aprovacao-visual.md` (5 dias úteis, Cl. 4.3). **Nada foi enviado ao cliente.** A faixa "Tema provisório" aparece enquanto `VISUAL_APPROVED` não for `true`; os e-mails já avisam "identidade visual provisória" fora de produção.

## Como gerar as capturas

Com o servidor de homologação no ar: `python3` com Playwright, abrir cada tela nas quatro larguras e salvar (`page.screenshot(full_page=True)`). As capturas ficam fora do repositório; anexe-as ao envio da proposta.

## Não verificado

Aparelhos reais (iPhone e Android), Safari/WebKit nesta rodada (a varredura foi só Chromium), leitores de tela reais, contraste medido por ferramenta, os textos legais e a identidade final (dependem do cliente) e a aprovação escrita (CA-33).
