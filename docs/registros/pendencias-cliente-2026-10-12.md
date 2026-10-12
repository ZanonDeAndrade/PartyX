# Minuta de pendências para Bernardo (não enviada)

Data-base: 12/10/2026. Substitui a minuta de 10/10/2026 (`pendencias-cliente-2026-10-10.md`), que fica como histórico. **Minuta para revisão e autorização antes de qualquer envio.** Nada foi enviado ao cliente. Não anexar nem pedir credenciais ou senhas por mensagem aberta; combinar canal seguro. Fontes: `decisoes-pendentes.md`, `insumos-etapa-0.md`, `../operacao/email.md` e `../visual-e-legal.md`.

Desde a minuta anterior: o Mercado Pago foi adotado como gateway (D-01, escolha informada pelo responsável, ainda sem confirmação escrita da PartyX) e as credenciais de produção estão no Secret Manager; não existe `docs/insumos/`, então nenhum texto legal, dado cadastral, contato, domínio ou provedor de e-mail da PartyX foi recebido.

## Mensagem consolidada

> Olá, Bernardo. Para liberarmos o cadastro e a venda reais, precisamos das respostas abaixo, por escrito, em ordem de urgência. Cada linha diz o que fica parado enquanto o ponto estiver em aberto. Onde já existe uma proposta nossa, ela está aplicada de forma provisória e pode ser trocada sem perda; só precisamos do seu "de acordo" ou da alteração.
>
> 1. **Textos legais com versão e data de vigência (D-11):** Termos de Uso, Política de Privacidade e Política de Cancelamento/Troca/Reembolso. Bloqueia: o cadastro real de compradores e a venda em produção (os dois ficam travados até os três textos estarem publicados com versão e data). Nós não redigimos esses textos.
> 2. **Domínio e acesso ao DNS (D-08):** qual endereço usar e quem cria os registros. Bloqueia: o endereço definitivo do site, os links dos e-mails e a autenticação SPF, DKIM e DMARC (sem ela os e-mails tendem a cair no spam).
> 3. **Provedor e remetente de e-mail (D-09):** qual serviço de envio a PartyX contrata e o endereço remetente (ex.: ingressos@seudominio). Bloqueia: e-mail de confirmação de cadastro, recuperação de senha e confirmação de compra reais. Hoje nenhum e-mail sai em produção.
> 4. **Dados e contatos públicos da PartyX (D-16):** razão social, CNPJ, endereço, e-mail e WhatsApp de atendimento ao comprador e horário de atendimento. Bloqueia: rodapé do site, rodapé dos e-mails, página de manutenção e as orientações "fale com a PartyX". Sem eles, o site em produção não mostra nenhum canal de atendimento.
> 5. **Aprovação escrita da proposta visual (CA-33, D-10):** a proposta em PDF já preparada. Bloqueia: a venda real em produção (fica travada sem a aprovação) e a troca do tema provisório pelo definitivo.
> 6. **Reserva de 30 minutos (D-03):** confirmar por escrito. Escolhemos 30 minutos porque o Pix do Mercado Pago vence em no mínimo 30 minutos e o QR precisa valer até o fim da reserva. Bloqueia: nada hoje (já aplicado), mas um carrinho abandonado segura o ingresso por até 30 minutos; sem a confirmação, a regra segue provisória.
> 7. **Gateway Mercado Pago (D-01):** confirmar por escrito que o Mercado Pago (Pix e cartão) é o gateway único da PartyX. Bloqueia: nada técnico hoje (integração pronta e testada no ambiente de teste), mas a venda real depende dessa confirmação registrada.
> 8. **Pagamento aprovado depois de a reserva vencer, sem ingresso disponível (D-13):** quem da PartyX trata, por qual canal e em que prazo faz o estorno no Mercado Pago. Bloqueia: a definição de responsável para esses casos. Hoje o painel mostra o caso em "Exceções" e avisa por e-mail todos os administradores; a plataforma não estorna sozinha.
> 9. **Cobrança em dobro de um mesmo pedido (D-83):** confirmar o procedimento. Bloqueia: a definição de quem estorna. Hoje o caso aparece em "Exceções" com a cobrança a estornar; a PartyX estorna no Mercado Pago e marca como tratado com o motivo.
> 10. **Estorno parcial (D-82):** proposta: nenhum ingresso é cancelado automaticamente; o alerta orienta o administrador a cancelar manualmente, no detalhe do ingresso, a unidade correspondente ao valor devolvido. Bloqueia: a regra de qual ingresso deixa de valer. Sem a ação do administrador, o ingresso cujo valor foi devolvido continua entrando na portaria.
> 11. **Janela da portaria para evento encerrado (D-79):** confirmar 12 horas antes e 24 horas depois do início. Bloqueia: a regra final de validação em festas que passam da meia-noite; se a janela for curta demais, ingresso válido não entra.
> 12. **Reposição de estoque após cancelamento de ingresso (D-14):** o ingresso cancelado volta à venda ou continua contado como vendido? Bloqueia: a regra de capacidade e de nova venda depois de cancelamentos. Nenhuma das duas foi implementada; hoje não volta.
> 13. **Taxa mensal no pagamento aprovado sem ingresso (D-54):** proposta: não conta (não houve ingresso emitido) e aparece como exceção para análise no relatório. Bloqueia: o fechamento definitivo do relatório mensal da taxa.
> 14. **Parcelamento no cartão (D-02):** a PartyX quer oferecer parcelas? Se sim, quantas e quem paga os juros (definir com o Mercado Pago). Bloqueia: só o parcelamento; hoje o cartão é à vista.
> 15. **Alerta de e-mail não entregue (D-47):** quem da PartyX recebe e por qual canal. Bloqueia: o aviso em produção quando um e-mail esgota as tentativas.
> 16. **Publicação dos textos e abertura do cadastro (D-80):** confirmar que cada nova versão de texto é publicada por nós junto com a versão e a data, e que o cadastro só abre com os três textos no ar. Bloqueia: nada hoje; formaliza o procedimento.
> 17. **Página de manutenção (D-81):** confirmar que, quando ligada, ela fecha o site inteiro, inclusive painel e portaria (nesse caso a portaria usa a lista impressa), mostrando o contato da PartyX sem prometer prazo. Bloqueia: nada hoje; formaliza o uso.
>
> Pela Cl. 4.2, atraso de insumos e decisões do cliente pode suspender o prazo de entrega; a suspensão e a nova data precisam ser comunicadas e registradas por escrito. Esta mensagem não declara suspensão nem fixa nova data. Por favor, indique também quem pode aprovar as respostas e o canal de registro.

## Conferência

- Itens pedidos para esta minuta: D-01 (acrescentada em 12/10 por estar registrada sem confirmação escrita), D-03, D-08, D-09, D-11, D-16, D-02, D-13, D-14, D-47, D-54, D-79, D-80, D-81, D-82, D-83 e CA-33. Todos aparecem acima, uma linha cada, com o que bloqueiam.
- Ficam fora desta mensagem, mas seguem abertos no `decisoes-pendentes.md` e na minuta de 10/10: contrato e anexos (insumo 1), D-05, D-06, D-07, D-12, D-15 e as demais decisões da contratada marcadas para confirmação.
