# PartyX: resumo da auditoria de entrega (19/10/2026)

Para: Bernardo (PartyX). De: Zanon de Andrade Softwares. Este resumo explica, sem jargão, o que foi conferido na plataforma antes da
entrega, o que está bom, o que precisa de ajuste e em que ordem. O relatório técnico completo fica com a Zanon de Andrade
(`auditoria-entrega.md`).

## O que foi conferido

- **O código e as regras do sistema**: 1.172 testes automáticos rodaram e passaram; a revisão de segurança seguiu o padrão de mercado
  (OWASP) em toda a compra, no pagamento, na portaria e no painel.
- **A plataforma funcionando de ponta a ponta**, num ambiente de teste igual ao de produção, em três navegadores (Chrome, Safari e
  Firefox) e em três tamanhos de tela de celular e computador: cadastro, compra com Pix e cartão, reserva de 30 minutos, menores de
  idade, transferência de ingresso, cancelamento e estorno, portaria (QR válido, repetido, cancelado, transferido, de outro evento,
  adulterado, busca manual, câmera bloqueada, dois validadores ao mesmo tempo), painel inteiro, e-mails e PDFs.
- **Carga**: um evento de 500 ingressos com 300 pessoas entrando ao mesmo tempo na abertura, 60 pedidos por minuto, 500 avisos do
  Mercado Pago em 5 minutos e 500 leituras na portaria; depois, o triplo disso.
- **Operação**: restauração do backup de produção numa cópia local, ensaio de volta à versão anterior, os 17 alertas, a LGPD, os
  manuais e as pendências.

## O que está bom

- **Nunca vende acima da capacidade**, nem com duas pessoas disputando o último ingresso ao mesmo tempo; cada ingresso tem um QR
  Code único e assinado; a portaria registra uma entrada só, mesmo com dois validadores lendo o mesmo ingresso no mesmo instante.
- **O pagamento só vale depois de o servidor conferir com o Mercado Pago**: aviso repetido, atrasado ou falsificado não cria ingresso.
- **Pagamento que chega depois de a reserva vencer** é tratado: se ainda houver ingresso, confirma; se não houver, você é avisado por
  e-mail e o caso aparece em "Exceções" para estornar.
- **Dados pessoais protegidos**: CPF mascarado na portaria, nos relatórios e nas planilhas; senhas guardadas de forma irreversível;
  backup diário guardado por 35 dias e testado.
- **Desempenho**: na simulação de abertura de vendas o servidor respondeu em menos de 0,05 segundo em todas as telas e usou um
  quinto de um processador; o triplo da carga também coube na configuração atual (detalhes na tabela do relatório técnico).

## O que precisa de ajuste antes do primeiro evento grande

1. **Endereço do site.** Hoje o `partyx.com.br` passa por um serviço gratuito de ponte (Vercel) cujas regras não permitem uso
   comercial; ele pode ser pausado sem aviso, inclusive em dia de evento. Precisamos de uma decisão sua: pagar o plano profissional
   da ponte (cerca de US$ 20 por mês, temporário) ou criar o registro que falta no Registro.br para o endereço definitivo.
2. **Safari.** Nos nossos testes, o motor do Safari fechou a página do evento em duas das três larguras de tela. Pode ser só do
   simulador; vamos conferir num iPhone e num Mac reais e, se acontecer, ajustar o efeito de desfoque da capa.
3. **Proteção contra robôs.** A verificação "não sou um robô" está desligada por decisão de 06/10. Sem ela, um script consegue
   testar senhas e descobrir quais CPFs e e-mails têm conta. Recomendamos religar a verificação ou aplicar o ajuste técnico
   equivalente.
4. **Bloqueio de conta.** Hoje, 5 senhas erradas seguidas bloqueiam a conta por 15 minutos, mesmo para o dono com a senha certa. Isso
   permitiria tirar um validador da portaria durante o evento. Vamos propor bloqueio por e-mail e aparelho juntos.
5. **Avisos automáticos.** Faltam dois alarmes: um para quando o Mercado Pago parar de avisar os pagamentos e outro para quando a
   fila de e-mails parar. Hoje isso só apareceria em até 24 horas.
6. **Prazo do Pix.** Quem gera o Pix no último minuto da reserva pode pagar depois que a reserva venceu e o ingresso já foi para outra
   pessoa; o dinheiro fica retido até você estornar. Proposta: a reserva passa a valer até o vencimento do Pix.
7. **Manual do painel e roteiros do dia do evento**, em linguagem simples, com as capturas de tela desta auditoria.
8. **Pequenos ajustes técnicos** de segurança e de buscadores (Google), sem efeito visível para você, listados no relatório técnico.
9. **Homologação.** O ambiente de testes antigo continua ligado e gerando custo; vamos desligar com o seu de acordo.
10. **Guardar o código**: enviar ao repositório as últimas versões e a taxa de serviço, que hoje estão só no computador da
    contratada.

## O que pode ficar para depois

- Tela no painel para atender pedidos de cópia ou exclusão de dados (LGPD); hoje isso é feito pela contratada a seu pedido.
- Lista pronta de pedidos a estornar quando um evento for cancelado (hoje o estorno é pedido a pedido no Mercado Pago).
- Página de Ajuda com perguntas frequentes e link para o mapa do local na página do evento.
- Melhorias de velocidade no 4G (a página do evento abre em 2,7 segundos; a meta do Google é 2,5), de acessibilidade (contraste de
  alguns textos cinza, foco visível na busca) e de compartilhamento (imagem padrão quando o evento não tem capa).
- Confirmação do e-mail no cadastro e proteção contra cadastro de CPF alheio (decisão de produto).

## Decisões suas que a auditoria registrou (não são defeitos)

- Não há meia-entrada.
- Não há reembolso por desistência; o comprador pode transferir o ingresso até 2 horas antes do evento.
- A taxa de serviço (5%) e o desconto por código de promoter ainda vão ser publicados.
- O estorno de pagamento é feito por você no painel do Mercado Pago; a plataforma cancela os ingressos sozinha quando o estorno chega.

## Pendências que dependem de você

- **Domínio**: o site está no ar por uma ponte temporária (Vercel); para passar ao endereço definitivo (Firebase) é preciso criar um
  registro no Registro.br que a Zanon de Andrade vai indicar.
- **Documentos e dados**: razão social e CNPJ que devem aparecer no site e nos e-mails (hoje, o seu MEI).
- **Ajuda ao comprador**: definir as respostas das perguntas frequentes (como recebo o ingresso, não recebi o e-mail, transferir,
  menores, entrada) para a página de Ajuda sugerida.
