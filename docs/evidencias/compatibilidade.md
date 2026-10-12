# Compatibilidade em aparelhos reais: checklist manual

Checklist para preencher à mão (PDF, seção 11.1 "Compatibilidade" e 11.4; CA-26, CA-31 e CA-32). **Nada aqui foi executado
ainda: todos os itens começam em "Não executado".** Só marque "Aprovado" o que você mesmo viu funcionar no aparelho indicado.

O que já existe de automatizado, e que **não** substitui este checklist:

- Roteiro 11.2 no Chromium, com a câmera **simulada** (vídeo com o QR) e o celular **emulado** (Pixel 7): `docs/evidencias/roteiro-11-2/`.
- Varredura de rolagem horizontal em 360, 390, 768 e 1440 px no Chromium: `docs/evidencias/responsividade/resultado.md`.
- CSV com BOM UTF-8 e separador ";" conferidos no arquivo (bytes), não abertos no Excel.

## Como preencher

- **Onde testar:** homologação (`https://partyx-hml.web.app`, ou o domínio de homologação vigente). A câmera do navegador só funciona
  em HTTPS: não teste a portaria por `http://` nem por IP da rede local.
- **Contas:** cliente, administrador e validador de teste da homologação (as mesmas da comunicação de entrega). Nunca use dados reais
  de comprador.
- **Pagamento:** só no ambiente de teste do gateway ou no fictício da homologação. Nada de cartão real.
- **Resultado:** `Aprovado`, `Reprovado` ou `Não executado`. Em `Reprovado`, descreva o que aconteceu e anexe foto ou vídeo.
- **Evidência:** caminho ou link da foto/vídeo (ex.: `docs/evidencias/compat/android-camera.mp4`). Não fotografe CPF completo.

## Aparelhos usados

| Ambiente | Aparelho e modelo | Sistema e versão | Navegador e versão | Quem testou | Data |
|---|---|---|---|---|---|
| Chrome Android | | | | | |
| Safari iPhone | | | | | |
| Chrome desktop | | Windows / macOS: | | | |
| Edge desktop | | Windows / macOS: | | | |

Para a leitura de QR (itens C e D) são precisos **dois** aparelhos: um mostra o ingresso, o outro lê pela portaria.

---

## A. Compra e ingresso (cliente)

| # | Verificação | Chrome Android | Safari iPhone | Chrome desktop | Edge desktop |
|---|---|---|---|---|---|
| A1 | Página do evento abre sem rolagem horizontal; escolha de quantidade e total corretos | Não executado | Não executado | Não executado | Não executado |
| A2 | Sem login, "Continuar" leva ao login e, depois de entrar, volta ao pedido com a seleção mantida | Não executado | Não executado | Não executado | Não executado |
| A3 | Pix: QR do pagamento aparece e o botão "Copiar código Pix" copia o código | Não executado | Não executado | Não executado | Não executado |
| A4 | Cartão (ambiente de teste do gateway): campos do Mercado Pago aparecem inteiros na tela e aceitam digitação | Não executado | Não executado | Não executado | Não executado |
| A5 | Compra confirmada mostra os ingressos; "Meus ingressos" lista um QR por ingresso | Não executado | Não executado | Não executado | Não executado |
| A6 | Ingresso em tela cheia: QR nítido, sem cortes, legível com o brilho no máximo | Não executado | Não executado | Não executado | Não executado |

Observações de A (aparelho, item, o que aconteceu):

```
A_:
```

## B. PDF do ingresso

| # | Verificação | Chrome Android | Safari iPhone | Chrome desktop | Edge desktop |
|---|---|---|---|---|---|
| B1 | "Baixar PDF" baixa ou abre o arquivo (anotar onde ele aparece: downloads, visualizador, nova aba) | Não executado | Não executado | Não executado | Não executado |
| B2 | O PDF abre no visualizador padrão do aparelho, com nome do evento, tipo, código e QR legíveis | Não executado | Não executado | Não executado | Não executado |
| B3 | O PDF não mostra CPF | Não executado | Não executado | Não executado | Não executado |
| B4 | PDF de pedido com vários ingressos: um QR por página/bloco, todos legíveis | Não executado | Não executado | Não executado | Não executado |
| B5 | Impressão do PDF (impressora comum, A4) sai com o QR inteiro e sem cortes | n/a | n/a | Não executado | Não executado |

Observações de B:

```
B_:
```

## C. Portaria: câmera e leitura (validador)

Faça no aparelho que **lê**. O ingresso lido pode estar em outro celular (QR na tela) ou impresso (QR em papel).

| # | Verificação | Chrome Android | Safari iPhone | Chrome desktop (webcam) | Edge desktop (webcam) |
|---|---|---|---|---|---|
| C1 | "Iniciar leitura" pede permissão da câmera; aceitar abre a imagem da câmera traseira (no celular) | Não executado | Não executado | Não executado | Não executado |
| C2 | Negar a permissão mostra a mensagem de câmera indisponível e o caminho para a busca manual | Não executado | Não executado | Não executado | Não executado |
| C3 | **QR na tela** de outro celular: lê e mostra **verde** (válido) | Não executado | Não executado | Não executado | Não executado |
| C4 | O mesmo QR de novo: **amarelo** (já utilizado), com hora da primeira entrada | Não executado | Não executado | Não executado | Não executado |
| C5 | **QR impresso** (do PDF): lê e mostra verde | Não executado | Não executado | Não executado | Não executado |
| C6 | Ingresso cancelado pelo painel: **vermelho** | Não executado | Não executado | Não executado | Não executado |
| C7 | Ingresso de outro evento: vermelho com o nome do outro evento | Não executado | Não executado | Não executado | Não executado |
| C8 | QR com pouca luz / tela com brilho baixo: anotar se lê e quanto demora | Não executado | Não executado | Não executado | Não executado |
| C9 | Tempo por leitura com 4G (meta do PDF 11.4: menos de 2 s). Anotar 5 medições em segundos | Não executado | Não executado | n/a | n/a |
| C10 | Busca manual por nome e por código; CPF aparece mascarado | Não executado | Não executado | Não executado | Não executado |
| C11 | Sem internet (modo avião): aviso de sem conexão; **não** aprova offline | Não executado | Não executado | Não executado | Não executado |
| C12 | Tela bloqueada e desbloqueada no meio da portaria: a câmera volta com "Iniciar leitura" | Não executado | Não executado | n/a | n/a |

Tempos de C9 (s): Android `__ / __ / __ / __ / __` · iPhone `__ / __ / __ / __ / __`

Observações de C:

```
C_:
```

## D. Som da portaria

Com o volume do aparelho ligado e fora do modo silencioso (no iPhone, a chave lateral muda o comportamento: teste nos dois modos).

| # | Verificação | Chrome Android | Safari iPhone | Chrome desktop | Edge desktop |
|---|---|---|---|---|---|
| D1 | Válido toca o som de aprovação | Não executado | Não executado | Não executado | Não executado |
| D2 | Já utilizado toca um som diferente do válido | Não executado | Não executado | Não executado | Não executado |
| D3 | Inválido/cancelado/outro evento toca o som de recusa | Não executado | Não executado | Não executado | Não executado |
| D4 | iPhone no modo silencioso: anotar se toca (comportamento do Safari) | n/a | Não executado | n/a | n/a |
| D5 | O som não atrasa a próxima leitura | Não executado | Não executado | Não executado | Não executado |
| D6 | Android: vibra curto no válido e em dois toques nos demais (iPhone não vibra pelo navegador) | Não executado | n/a | n/a | n/a |

Observações de D:

```
D_:
```

## E. Planilhas (CSV) no Excel

No computador, com o Excel instalado. Baixe pelo painel (administrador) e abra **com duplo clique** (sem o assistente de importação).

| # | Planilha | Excel (Windows), versão: | Excel (macOS), versão: | Outro (LibreOffice/Google Planilhas), qual: |
|---|---|---|---|---|
| E1 | Relatório de vendas (`vendas_*.csv`): colunas separadas, acentos certos ("Fictícia", "Situação") | Não executado | Não executado | Não executado |
| E2 | Ranking de promoters (`ranking-promoters_*.csv`) | Não executado | Não executado | Não executado |
| E3 | Taxa mensal (`taxa-mensal_*.csv`): datas legíveis, valores com vírgula decimal | Não executado | Não executado | Não executado |
| E4 | Ingressos do evento e compradores do evento: CPF mascarado | Não executado | Não executado | Não executado |
| E5 | Lista de contingência (CSV e PDF) abre e imprime | Não executado | Não executado | Não executado |
| E6 | Nome com fórmula (ex.: comprador "=1+1"): aparece como texto, não calcula | Não executado | Não executado | Não executado |

Observações de E:

```
E_:
```

## F. Telas e navegação

| # | Verificação | Chrome Android | Safari iPhone | Chrome desktop | Edge desktop |
|---|---|---|---|---|---|
| F1 | Nenhuma tela com rolagem horizontal (girar o celular na horizontal e voltar) | Não executado | Não executado | Não executado | Não executado |
| F2 | Menu do celular abre e fecha; o painel tem o menu próprio no celular | Não executado | Não executado | n/a | n/a |
| F3 | Teclado virtual não cobre o campo em foco (cadastro, login, busca manual) | Não executado | Não executado | n/a | n/a |
| F4 | Voltar do navegador não perde a seleção do pedido nem duplica compra | Não executado | Não executado | Não executado | Não executado |
| F5 | Zoom do sistema/fonte grande: textos não se sobrepõem | Não executado | Não executado | Não executado | Não executado |

Observações de F:

```
F_:
```

---

## Resumo (preencher no fim)

| Ambiente | Aprovados | Reprovados | Não executados | Bloqueios para a entrega |
|---|---|---|---|---|
| Chrome Android | | | | |
| Safari iPhone | | | | |
| Chrome desktop | | | | |
| Edge desktop | | | | |

Assinatura de quem testou e data: ______________________
