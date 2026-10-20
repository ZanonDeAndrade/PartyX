# Evento privado (D-92): textos legais propostos e resumo diário

**Situação: PROPOSTA, não publicada.** Nada aqui está em `conteudo-legal/` nem em `infra/producao/env.prod.yaml`. Os textos vão ao
Bernardo pelo responsável; só depois da aprovação escrita eles entram no repositório, com versão e data novas e novo aceite. Os números
de versão abaixo são sugestão (hoje: Termos de Uso 1.5, Política de Privacidade 1.2).

A trava do `deploy.sh conferir` (`infra/producao/textos-privado.py`) recusa publicar uma release com a migração 0019 enquanto os dois
textos não estiverem no repositório com o conteúdo do evento privado.

## 1. Política de Privacidade (proposta de versão 1.3)

### Na seção 2, "Dados que coletamos", depois de "Transferências"

> Eventos privados: quando um Evento é privado, a lista de pessoas autorizadas a comprar, com o e-mail ou o CPF e, se informado, o nome
> de cada pessoa; as solicitações de acesso feitas pela sua conta; a situação de cada pessoa (autorizada, pendente ou recusada), as
> datas, a observação da PartyX sobre a decisão e quem decidiu.

### Na seção 3, "Para que usamos e com qual base legal", depois do parágrafo dos e-mails

> Controlar quem pode comprar e receber ingressos de um Evento privado, analisar e responder às solicitações de acesso e avisar por
> e-mail que a sua solicitação foi recebida e que o acesso foi liberado. Base legal: execução de contrato e de procedimentos
> preliminares a pedido do titular (LGPD, art. 7º, V), quando você solicita acesso; e legítimo interesse da PartyX, como organizadora,
> de controlar a entrada nos próprios Eventos (LGPD, art. 7º, IX), quando a PartyX inclui uma pessoa na lista, sempre limitado a esse
> controle. A lista não é mostrada a outras pessoas: a página do Evento informa a cada conta apenas a própria situação.

### Na seção 6, "Por quanto tempo guardamos e como protegemos", depois de "Termo de Autorização e Responsabilidade em papel"

> Lista de autorizados e solicitações de acesso de Eventos privados: 6 meses após o Evento, e depois apagadas automaticamente. Os
> registros de auditoria dessas decisões guardam o e-mail e o CPF apenas parcialmente ocultos.

### Na seção 7, "Seus direitos e como exercê-los" (se a PartyX quiser deixar explícito)

> A exclusão dos seus dados também retira você das listas de autorizados e das solicitações de acesso de Eventos privados.

### Pontos para o Bernardo decidir

1. **Base legal.** A proposta usa execução de contrato para quem solicita e legítimo interesse para quem a PartyX cadastra. O legítimo
   interesse pede que a PartyX registre por que o uso é necessário e proporcional (avaliação de legítimo interesse). Confirmar com quem
   assessora a PartyX.
2. **Pessoa cadastrada antes de ter conta.** A PartyX passa a guardar o e-mail ou o CPF de alguém que ainda não aceitou a Política.
   Recomendação: cadastrar só quem pediu para participar ou concordou com isso, e não usar a lista para nenhum outro fim.
3. **Prazo de 6 meses depois do Evento.** Decidido pelo responsável no pedido da D-92; a limpeza diária já aplica.

## 2. Termos de Uso (proposta de versão 1.6)

### Na seção 4, "Compra de ingressos", depois de "Disponibilidade"

> Evento privado: a PartyX pode tornar um Evento privado. Ele continua aparecendo na Plataforma, com o selo "Evento privado", mas só
> compram ingressos as contas autorizadas pela PartyX para aquele Evento. Quem não está autorizado pode solicitar acesso pela página do
> Evento. A autorização é decisão exclusiva da PartyX, como organizadora: ela não é obrigada a aprovar a solicitação nem a explicar a
> recusa, e não há prazo garantido para a resposta. A solicitação e a autorização não reservam ingressos: a compra continua sujeita às
> vendas, aos lotes, à disponibilidade, à classificação etária e às demais regras do Evento. A autorização vale só para a conta
> autorizada. Tornar um Evento privado depois de iniciadas as vendas não cancela ingressos já comprados.

### Na seção 5, "Ingresso digital e acesso ao evento", no parágrafo "Titularidade", depois da frase da transferência

> Em Evento privado, a transferência só pode ser feita para uma conta autorizada pela PartyX para aquele Evento.

### Ponto para o Bernardo decidir

A Política de Cancelamento, Troca e Reembolso 1.1 (seção 2) descreve a transferência sem essa condição. Os Termos têm precedência e a
regra está no sistema; se a PartyX quiser a frase também na Política, é uma versão 1.2 dela, com o mesmo texto acima.

## 3. Resumo diário de solicitações (proposta, não aplicada)

O pedido da D-92 é não mandar e-mail ao Bernardo a cada solicitação. Proposta opcional:

- Um e-mail por dia, às 8h (America/Sao_Paulo), **só quando houver solicitação pendente**, com o número de pendentes por Evento e o
  link para a página "Solicitações" do painel.
- Sem nome, e-mail ou CPF de ninguém no corpo do e-mail (quem decide abre o painel).
- Destinatários: os administradores ativos (como o aviso de pagamento sem estoque) ou um endereço definido em variável.
- Implementação: um modelo novo no `email_log` (valor novo no tipo de e-mail, migração só de expansão) e uma rotina interna
  autenticada como as demais, com chave de idempotência por dia. Cerca de 2 a 3 horas, com testes.
- Agenda: ou aproveita a rotina diária das 04:00 que já existe (sem custo, mas o e-mail chega de madrugada), ou ganha uma agenda nova
  no Cloud Scheduler às 8h. Já há três agendas no projeto (rotina diária, limpeza de retenção e backup), então a nova provavelmente
  passa da cota gratuita do Scheduler; conferir o valor na página de preços do Google antes de decidir (é um recurso com custo e
  precisa de autorização).
