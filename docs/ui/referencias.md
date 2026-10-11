# Referências de UI para o redesenho do PartyX

Pesquisa feita em 11/10/2026 com páginas públicas, centrais de ajuda, lojas de aplicativos, críticas de design e imprensa. O objetivo é extrair **padrões** de interação e hierarquia, não copiar marca, paleta, tipografia ou layout de nenhum produto. Vários sites (dice.fm, ra.co, shotgun.live, central de ajuda da Fever) bloquearam a leitura automática (HTTP 403 ou 429); por isso, o que não pôde ser confirmado em fonte está marcado como **não verificado**. Observações de memória ou suposição não entram como fato.

Legenda: (V) verificado em fonte citada; (NV) não verificado.

## DICE (dice.fm)

**1. Card de evento**
- (V) Pôster do evento é o elemento visual dominante; a vitrine se apoia em "pôsteres visualmente atraentes" e em recomendações pela biblioteca musical do usuário.
- (V) Filtros em pílulas (data, preço, cidade) e categorias como navegação secundária; a lista atualiza na hora ao trocar a categoria.
- (NV) Ordem exata dos textos no card (data antes ou depois do título) e se o preço aparece no card.

**2. Página do evento**
- (V) Topo com banner, título, data, horário e local; data e horário destacados em cor de acento, o que a crítica considerou legível e com senso de tempo.
- (V) Hierarquia por cor: acento forte só para comprar e para data/local; contorno branco para ações secundárias (seguir artista/local); cinza para texto informativo não clicável.
- (V) Barra inferior fixa com o menor preço e o botão "Get Tickets"; ao tocar, a página expande a lista de tipos (ex.: pista, VIP) com preço de cada um.
- (V) Prévias de faixas dos artistas ajudam a decidir quando o line-up é desconhecido.
- (V) Esgotado: lista de espera ativada pelo organizador só depois de esgotar; ingresso devolvido vai ao próximo da fila.

**3. Checkout**
- (V) Compra em cerca de três toques, poucas telas; preço exibido já inclui taxas ("o preço que você vê é o preço que você paga").
- (V) Tela de conclusão confirma a compra com retorno claro.
- (NV) Existência e duração de cronômetro de reserva.

**4. Carteira**
- (V) Ingresso vive no app; o QR é ativado no dia do evento (cerca de 2 h antes, segundo páginas de evento; 1 h antes, segundo matéria de 2019) com o botão "Activate QR code".
- (V) O QR é animado para impedir captura de tela; o ingresso mostra data, hora e local junto do código.
- (V) Vários ingressos de um grupo podem ser mostrados no mesmo aparelho.
- (NV) Dica de brilho e visual de ingresso usado ou cancelado.

**5. Microinterações**
- (V) Troca de categoria com resposta imediata na lista.
- (NV) Animações de stepper, transições de página e momento de confirmação.

**Evitar**
- (V) Preço da barra fixa incluía um tipo esgotado: a página mostrava US$ 50,89 e o menor disponível era US$ 90,64. Mostrar sempre o menor preço **disponível**.
- (V) Seção "Vistos recentemente" ocupando a maior parte da busca e rolagem infinita escondendo seções. Também: QR animado (conflita com o QR simples preto no branco do PartyX).

## Shotgun (shotgun.live)

**1. Card de evento**
- (V) Feed inicial com módulo "Friends" que destaca eventos que amigos vão ou marcaram interesse; recomendação por gosto musical, artistas e organizadores seguidos.
- (NV) Hierarquia visual do card (sites bloquearam leitura automática).

**2. Página do evento**
- (V) Páginas em pt-BR avisam que "ingressos esgotados podem aparecer como disponíveis no app" quando há revenda; informam idade mínima e documento com foto na entrada.
- (V) Lista de espera ativada quando o evento esgota.
- (NV) Barra fixa de compra no celular e tratamento de "vendas ainda não abertas".

**3. Checkout**
- (V) Na venda na porta (Xpress Door), a compra leva segundos e o QR do ingresso aparece **na própria tela de confirmação**.
- (V) Causa comum de "não achei meu ingresso": e-mail não verificado ou login com outra conta (Apple, Facebook, outro e-mail).
- (NV) Cronômetro de reserva.

**4. Carteira**
- (V) Ingresso disponível no app e por e-mail; ingressos de outras plataformas não podem ser importados.
- (NV) Empilhamento, tela cheia e estados de usado/cancelado.

**5. Microinterações**: (NV) não foi possível verificar.

**Evitar**
- (V) Rótulo "Esgotado" que não significa esgotado (revenda reaparece): ambiguidade de estado. Excesso de camada social ("onde seus amigos vão") fora do foco de compra.

## Resident Advisor (ra.co)

**1. Card de evento**
- (V) Ex-designer relata ganho de 9% em conversão ao reduzir a sobrecarga das listagens e ajudar a achar o evento certo (dado autodeclarado).
- (V) App filtra por tipo, tamanho, gênero, data e popularidade.
- (NV) Agrupamento por data e hierarquia exata do card (ra.co bloqueou leitura).

**2. Página do evento**
- (V) Lotes dependentes (1º lote, lote final); fila de revenda só abre quando todos os lotes de um tipo esgotam.
- (NV) Como lotes esgotados aparecem (riscados, acinzentados) e se há barra fixa.

**3. Checkout**
- (V) Compra no app com Apple Pay; compras com Apple Pay às vezes criam conta nova, o que depois confunde o comprador.
- (NV) Cronômetro e mensagens de erro.

**4. Carteira**
- (V) "My Tickets" por pedido; recomenda mostrar o ingresso no celular; acesso offline só no app iOS; PDF só 24 h antes e mediante senha.
- (V) Troca de nome uma única vez, até 24 h antes, pelo ícone de lápis.
- (NV) Tratamento visual do QR e dos estados.

**5. Microinterações**: (NV) não foi possível verificar.

**Evitar**
- (V) Fragmentação: download de PDF só no site, offline só no iOS, Apple Wallet anunciada mas relatada como removida por usuários. Regras diferentes por canal confundem.

## Posh (posh.vip)

**1. Card de evento**
- (V) Card mínimo: imagem como peso visual, título, linha "horário, local", contagem "X people going" e um único botão "View event".
- (V) Explorar filtra por preço, data, cidade e "em alta".

**2. Página do evento**
- (V) Flyer em retrato 4:5 (mín. 1000 × 1250 px); vídeo vertical de 15 s só no feed.
- (V) Preço exibido é o total com taxas em todo lugar: feed, página e botões de tipo.
- (V) Organizador pode ocultar endereço (revelado no dia) e ocultar a lista e o número de confirmados.
- (V) Tipos com janela de venda (início e fim), senha, limite por cliente.

**3. Checkout**
- (V) Carrinho, depois checkout; login exigido no momento da compra.
- (V) Aceite de termos opcional antes de concluir; contestação no banco cancela o pedido e invalida ingressos.
- (NV) Cronômetro de reserva.

**4. Carteira**
- (V) App: abas "Upcoming" e "Past"; web: "View your orders" com ícone de QR.
- (V) Pedido com vários ingressos mostra **um QR principal**; o PDF do e-mail traz uma página por ingresso rotulada "1 of 5". Na porta, o QR abre todos os ingressos do pedido e o staff marca um a um.
- (V) Estados: pendente de aprovação; RSVP cancelado de forma imediata e irreversível; não mostra quais ingressos do pedido foram lidos.

**5. Microinterações**: (NV) não foi possível verificar.

**Evitar**
- (V) E-mails de carrinho abandonado (15 min, 2 dias, 1 dia antes) e programa "Kickback" (comissão para quem divulga): pressão e comissão estão fora do escopo do PartyX.
- (V) Contador "0 people going" como prova social: vira ruído ou constrangimento em eventos pequenos.

## Fever (feverup.com)

**1. Card de evento**
- (V) Imagem quadrada; acima do título, nota (ex.: "4.8") e local em linha pequena; depois data ou intervalo ("18 Oct - 13 Dec") e preço "From R$140.00".
- (V) Selos "New!" e desconto ("- 20%" com preço riscado); vitrine em carrosséis por tema, com "Top 10" numerado no topo.

**2. Página do evento**
- (V) Galeria, selo "Exclusivo Fever", título, nota e número de avaliações ("4.8(1240)").
- (V) Seletor "Selecione a data e opção" (dia, horário, setor) com preços por tipo (inteira, meia, social) e a frase "Sem taxas de reserva".
- (V) Bloco "Informação" com data e hora, duração, localização, idade e acessibilidade; depois programa, artistas, "Sobre o local" e "Como chegar?".
- (V) Esgotado: texto honesto ("não há ingressos disponíveis no momento") e CTA alternativo "Me avise".

**3. Checkout**
- (V) Data e horário, quantidade, "Buy now"; vouchers só no app.
- (NV) Cronômetro e tela de pagamento.

**4. Carteira**
- (V) Seção "Tickets" no app e e-mail de confirmação; algumas experiências só aceitam o ingresso no app.
- (NV) QR em tela cheia, brilho e estados.

**5. Microinterações**: (NV) não foi possível verificar.

**Evitar**
- (V) Preço riscado, "- 20%" e ranking "Top 10" no card: ruído promocional e cupom (desconto está fora do escopo).
- (V) Queixas recorrentes sobre reembolso e atendimento (fonte agregadora de baixa autoridade).

## Sympla (sympla.com.br)

**1. Card de evento**
- (V) Lista vertical: imagem acima, título em negrito como texto principal, depois "Local, Cidade, UF" e data por extenso curta ("Sábado, 21 de Nov às 21:00").
- (V) Nenhum preço ou selo no card da listagem de cidade; ordenação "Relevância" e contagem de resultados.

**2. Página do evento**
- (V) Título, intervalo de data e hora ("11 out - 2026 • 21:00 > 12 out - 2026 • 04:00"), "Evento presencial em ...", seção "Local" com endereço.
- (V) "Política do evento" com cancelamento (7 dias após a compra, até 48 h antes) e edição de participante; "Fale com o produtor" em vários pontos; "Parcele em até 12x".
- (NV) Lista de tipos, seletor de quantidade e texto de esgotado (renderizados no cliente, não lidos).

**3. Checkout**
- (V) Ingresso eletrônico enviado por e-mail assim que o pagamento é aprovado; reembolso Pix volta para a conta de origem.
- (NV) Cronômetro de reserva, prazo de expiração do Pix e tela "copia e cola".

**4. Carteira**
- (V) Aba "Ingressos" com ativos e de eventos passados; acesso offline; botão "Adicionar à Apple Wallet" nem sempre presente.
- (V) Na entrada aceita QR impresso, PDF ou app, com documento original com foto.
- (NV) Dica de brilho e estados visuais.

**5. Microinterações**: (NV) não foi possível verificar.

**Evitar**
- (V) Card sem preço obriga abrir cada evento para saber o custo. Multa do Procon-MG por reter taxa de conveniência em desistência: taxa precisa ser clara e reembolsável conforme a lei.

## Ingresse (ingresse.com)

**1. Card de evento**: (NV) o site é renderizado no cliente e não pôde ser lido.

**2. Página do evento**
- (V) App recomenda eventos pela localização e mostra horários e rota no mapa.
- (NV) Demais itens.

**3. Checkout**
- (V) "Compre ingressos em poucos toques"; o ingresso vai direto para a carteira.
- (NV) Fluxo de Pix, cronômetro e erros.

**4. Carteira**
- (V) Carteira no app com acesso offline; não envia ingresso por e-mail (só o comprador acessa).
- (V) Notas de versão: carteira "mais clara e organizada", passaportes e ingressos na mesma seção, acompanhamento de revenda pela carteira.
- (NV) QR, brilho e estados de usado/cancelado.

**5. Microinterações**: (NV) não foi possível verificar.

**Evitar**
- (V) Revenda automática ligada por padrão e "Fastpass" para vender mais rápido: opção paga e padrão que o usuário não escolheu. Transferência e revenda estão fora do escopo do PartyX.

Nota: reclamações encontradas sobre Pix "aguardando pagamento" após pagar são do **Ingresso.com** (outra empresa), não da Ingresse. Servem só como lição genérica: status de Pix precisa ser claro e se atualizar sozinho.

## O que levamos para o PartyX

Restrições respeitadas: sem cupom de desconto, sem comissão de promoter, sem escassez falsa, sem confete, QR preto sobre branco sem animação, check-in instantâneo e sem validação offline.

1. **Vitrine: card com três linhas fixas.** Imagem em proporção fixa no topo; abaixo, linha de data em destaque curto ("Sáb, 21 nov · 23:00"), título em até duas linhas e "Local, Cidade". Preço "a partir de R$ X" só com tipos à venda. Nada de nota, ranking ou selo promocional (contra Fever; a favor de Sympla e Posh).
2. **Vitrine: filtros em pílulas com resposta imediata** (Hoje, Este fim de semana, Cidade), sem recarregar a página e sem seção de "vistos recentemente" dominando a tela (lição da crítica ao DICE).
3. **Evento: data, hora e local como bloco de acento.** O acento de cor fica reservado para data/local e para o botão de compra; ações secundárias com contorno; texto informativo em tom neutro (hierarquia observada no DICE).
4. **Evento: ordem da informação.** Banner, título, bloco data/hora/local, tipos de ingresso, line-up, descrição, "Informações" (idade, documento, acessibilidade), "Como chegar", política de cancelamento. Inspirado no bloco "Informação" da Fever e na "Política do evento" da Sympla.
5. **Evento: barra fixa no celular com o menor preço disponível** e "Comprar ingressos". O preço nunca considera tipo esgotado (erro do DICE). Se houver taxa, o valor exibido desde o card já é o total (DICE, Posh); decisão sobre taxa é pendência da PartyX.
6. **Evento: estados de tipo honestos e visíveis.** "Esgotado" desabilitado mas listado; "Vendas abrem em 24/10 às 12:00"; "Vendas encerradas". Nunca "últimas unidades" nem contador de pessoas. Lista de espera e "Me avise" não estão no escopo.
7. **Checkout: login no meio do fluxo sem perder a seleção.** Ao clicar em comprar sem sessão, abrir login e voltar ao checkout com a mesma seleção, que o servidor revalida. Passos visíveis: Ingressos, Pagamento, Confirmação (DICE com poucas telas; Posh com login na compra).
8. **Checkout: prazo de reserva real, mostrado com calma.** Exibir "Ingressos reservados até 21:47" a partir da expiração vinda do servidor; contagem regressiva só nos últimos minutos e sem modal. O cronômetro artificial é o padrão citado em ação judicial contra outra bilheteria.
9. **Checkout Pix: QR e "copia e cola" lado a lado.** Mostrar valor, validade do código e botão "Copiar código" com retorno "Código copiado". Status "Aguardando confirmação do banco" atualizado sozinho (consulta ao servidor); a tela nunca aprova o pagamento. Se expirar, explicar e oferecer gerar nova reserva.
10. **Checkout: erro de estoque na linha certa.** Quando a revalidação reduzir a disponibilidade, mostrar no próprio tipo ("Restam 2 disponíveis para este tipo, ajustamos sua seleção") e pedir confirmação antes de seguir; erro de cartão com texto acionável, sem apagar o formulário.
11. **Confirmação: o ingresso é a celebração.** Ícone de confirmação estático, resumo do pedido e atalho "Ver meus ingressos"; transição curta do card para a carteira, respeitando `prefers-reduced-motion`. Sem confete (Shotgun mostra o QR já na confirmação; aqui, um atalho direto).
12. **Carteira: Próximos e Passados, um cartão por unidade.** Agrupar por evento e mostrar "Ingresso 2 de 4" com navegação lateral entre unidades; cada unidade tem seu próprio QR (diferente do QR único por pedido da Posh). Data, hora e local sempre junto do QR (DICE).
13. **Carteira: QR em tela cheia, preto sobre branco, com margem de silêncio.** Fundo branco mesmo no tema escuro, código curto legível abaixo para busca manual e dica "Aumente o brilho da tela para agilizar a entrada" (dica é proposta nossa; não verificada nos produtos). Sem CPF no ingresso.
14. **Carteira: estados inequívocos.** "Utilizado em 25/10 às 23:42" com QR oculto; "Cancelado" com QR oculto e texto explicando que o estorno, se houver, é tratado pelo pagamento. Evitar rótulo ambíguo como o "Esgotado" que reaparece da Shotgun.
15. **Portaria e admin: resposta instantânea e números reais.** Leitura com retorno em tela cheia por cor e texto ("Entrada liberada", "Já utilizado às 23:42", "Ingresso inválido"), com vibração quando houver; busca manual com CPF mascarado; uma leitura por unidade, sem lista de pedido para marcar um a um (contra o fluxo da Posh). No admin, vendidos, reservas válidas e capacidade por tipo, e vendas por código de promoter só como atribuição.

## Fontes

- **DICE**: https://ixd.prattsi.org/2026/02/design-critique-dice-ios-app/; https://ixd.prattsi.org/2025/02/design-critique-dice/; https://www.ticketnews.com/2019/09/mobile-ticketing-app-dice-puts-fans-first-with-transparency-waiting-lists/; https://dice.fm/blog/identify-fan-demand-with-the-waiting-list; https://dice.fm/blog/dices-big-fat-2021-product-round-up; https://dice.fm/event/pyp26w-wet-leg-10th-jul-alexandra-palace-london-tickets (via resultado de busca; leitura direta bloqueada); https://en.wikipedia.org/wiki/Dice_(ticketing_company); https://edmidentity.com/2023/04/01/dice-event-ticketing-fan-first/
- **Shotgun**: https://support.shotgun.live/hc/en-us/articles/16394907410706--I-can-t-find-my-ticket; https://support-pro.shotgun.live/hc/en-us/articles/17500892760978-Charge-Now-and-The-Waiting-List; https://support-pro.shotgun.live/hc/en-us/articles/37061441170450-Tips-to-get-your-event-recommended-by-Shotgun-s-smart-feed; https://pro.shotgun.live/en/blog/xpress-door-checkout; https://apps.apple.com/app/id760028892; https://shotgun.live/pt-br/events/trophy-de-6-anos-halloween-zig-studio (via resultado de busca)
- **Resident Advisor**: https://support.ra.co/article/65-faqs-i-have-already-ordered-tickets; https://support.ra.co/article/67-i-want-to-use-the-resale-service; https://support.ra.co/article/93-resale; https://ra.co/ra-guide; https://ra.co/news/74129; https://read.cv/jamesnorton/ra (via resultado de busca); https://apps.apple.com/app/id981952703
- **Posh**: https://posh.vip/; https://support.posh.vip/en/articles/10723764-accessing-your-event-tickets; https://support.posh.vip/en/articles/10723762-how-to-purchase-tickets-with-posh; https://support.posh.vip/en/articles/15089963-creating-customizing-and-managing-your-posh-events-the-complete-guide; https://support.posh.vip/en/articles/10723760-start-earning-with-posh-kickback-program
- **Fever**: https://feverup.com/en/sao-paulo; https://feverup.com/m/341883; https://feverup.com/m/105658; https://support.feverup.com/hc/en-us/articles/38499271754388-How-do-I-purchase-a-ticket (via resultado de busca); https://support.feverup.com/hc/en-us/articles/38499246796308-How-do-I-use-my-ticket (via resultado de busca); https://www.onclarity.com/leaderboard/insight/fever
- **Sympla**: https://www.sympla.com.br/eventos/sao-paulo-sp; https://www.sympla.com.br/evento/pre-feriado-na-lab/3604709; https://apps.apple.com/us/app/-/id1136318924; https://canaltech.com.br/apps/como-pedir-reembolso-na-sympla/; https://www.itatiaia.com.br/brasil/sudeste/mg/sympla-e-multada-por-pratica-abusiva-nas-relacoes-de-consumo-em-vendas-de-ingressos-online/; https://communities.apple.com/pt/thread/256099976
- **Ingresse**: https://apps.apple.com/BR/app/id815359760
- **Padrões gerais (escassez e cronômetro artificiais)**: https://www.goodwinlaw.com/en/insights/blogs/2024/08/online-ticket-exchange-sued-for-alleged-drip-pricing-and-hidden-fees; https://advertisinglaw.fkks.com/post/102jf6g/d-c-attorney-general-sues-stubhub-over-pricing-practices
