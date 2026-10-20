# Manual do painel da PartyX

Guia para quem administra a PartyX pelo painel (`/admin`). **Em construção:** por enquanto este manual só tem a seção do evento
privado. O manual completo, com as capturas da auditoria, é o item O-03 de `relatorios/auditoria-entrega.md`.

## Evento privado: quem pode comprar

Num evento privado, só compra quem você autorizar. O evento continua aparecendo no site, com o selo "Evento privado", e quem não está
na lista pode pedir acesso pela página dele. Quem está na lista paga o ingresso normalmente: a lista não é cortesia nem lista de
portaria, e a entrada continua só pelo ingresso.

### Ligar e desligar

1. Em **Eventos**, abra o evento e clique em **Editar informações**.
2. Em "Quem pode comprar", ligue a chave **Evento privado** e salve.

Ligar no meio das vendas não cancela nada: quem já comprou continua com os ingressos. Desligar libera a compra para todos e guarda a
lista, para quando você ligar de novo.

### Montar a lista (aba Acesso)

- **Adicionar pessoa:** informe o e-mail ou o CPF (um basta) e, se quiser, o nome. A pessoa pode ainda não ter conta: ela é reconhecida
  quando criar a conta ou entrar com aquele e-mail ou CPF.
- **Colar uma lista:** uma pessoa por linha, até 1.000, com e-mail, CPF e nome separados por vírgula, ponto e vírgula ou tabulação. As
  linhas com erro ou repetidas aparecem com o número da linha.
- **Buscar, filtrar por situação, remover e Exportar CSV:** o CPF aparece sempre mascarado.

**Cadastre só quem pediu acesso ou concordou em participar.** A pessoa cadastrada antes de ter conta ainda não leu a Política de
Privacidade, e a lista serve só para controlar a compra daquele evento.

### Solicitações

Quando alguém pede acesso, o menu **Solicitações** mostra um contador e a Visão geral mostra um card. Marque uma ou várias pessoas e
clique em **Aprovar** ou **Recusar**. Aprovar envia o e-mail "Acesso liberado", com o link do evento. Recusar não envia nada, e a pessoa
vê "Solicitação não aprovada" na página do evento.

### Observação da decisão

O campo de observação é opcional. **Ela fica na trilha de auditoria e a pessoa pode pedir uma cópia** (é um direito dela pela LGPD).
Por isso **não escreva motivos pessoais** nem opiniões sobre a pessoa. Prefira algo neutro, como "Lista fechada" ou "Convidada pela
produção", ou deixe em branco.

### Por quanto tempo a lista fica

A lista e as solicitações são apagadas sozinhas 6 meses depois do evento. Se uma pessoa pedir para sair da lista, remova a linha dela.
Se ela pedir a exclusão dos dados, a exclusão também a retira de todas as listas.
