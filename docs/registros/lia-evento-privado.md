# Avaliação de legítimo interesse: lista de autorizados de evento privado (D-92)

**Controladora:** 58.471.403 BERNARDO PEIXOTO FORTES BITTENCOURT (PartyX), CNPJ 58.471.403/0001-07. **Encarregado:** Bernardo Peixoto
Fortes Bittencourt. **Operadora:** Zanon de Andrade Softwares. **Data:** 20/10/2026. **Referências:** LGPD, arts. 7º, IX, e 10;
Política de Privacidade 1.3, seções 2, 3, 6 e 7; `evento-privado.md`.

**Alcance.** Vale só para quando a PartyX **inclui uma pessoa na lista** pelo painel. Quando a própria pessoa solicita acesso pela página
do evento, a base é a execução de contrato e de procedimentos preliminares a pedido do titular (art. 7º, V), e esta avaliação não se
aplica.

## 1. Finalidade

Controlar quem pode comprar e receber por transferência os ingressos de um evento que a PartyX decidiu tornar privado. A PartyX organiza
os próprios eventos e tem interesse legítimo, concreto e atual em escolher o público deles. A lista não serve para nenhum outro fim:
nada de publicidade, perfil, contato comercial ou uso em outro evento.

## 2. Necessidade

Sem identificar a pessoa, o sistema não consegue reconhecê-la no cadastro ou no login, nem conferir a compra e a transferência no
servidor. Esperar que cada convidado solicite acesso pela página resolve parte dos casos, mas não aquele em que a PartyX já sabe quem
quer autorizar. Não há meio menos invasivo que cumpra a finalidade: a lista existe só no evento em que a chave está ligada.

## 3. Dados mínimos

E-mail **ou** CPF (um basta), nome opcional, situação (autorizada, pendente ou recusada), datas, quem decidiu e uma observação opcional.
Não há telefone, endereço, data de nascimento, foto nem dado sensível. A pessoa não recebe e-mail por ter sido cadastrada.

## 4. Retenção

6 meses depois do fim do evento (ou do início, se não houver fim). A limpeza diária automática apaga as linhas, sem depender de ação
manual. A trilha de auditoria continua, com o e-mail e o CPF parcialmente ocultos.

## 5. Salvaguardas

- **Lista nunca exposta:** a página do evento e a API pública informam a cada conta só a própria situação; nenhuma resposta diz se outra
  pessoa está na lista. A busca do painel vai no corpo da requisição, nunca no endereço.
- **CPF mascarado** nas telas, na planilha (CSV) e na trilha. Só administradores veem a lista; validadores da portaria não veem.
- **Exclusão com a conta:** a exclusão dos dados do titular apaga as linhas da conta, do e-mail e do CPF dele. A pessoa também pode pedir
  só a retirada da lista, e o administrador remove a linha.
- **Acesso aos dados:** a cópia dos dados do titular traz as linhas dele, com a situação, as datas e a observação.
- **Observação:** o painel avisa que ela fica na trilha e pode ser pedida pela pessoa, e que não se escrevem motivos pessoais.
- **Limites** de 10 solicitações por conta e 30 por endereço de rede por hora, contra abuso.

## 6. Balanço com os direitos do titular

**Expectativa:** quem é chamado para um evento privado espera que o organizador saiba quem chamou; o uso é o esperado e é descrito na
Política de Privacidade. **Impacto:** baixo; o tratamento só libera uma compra, não restringe nada que a pessoa teria fora da lista e
não gera decisão automatizada. **Risco residual:** quem já sabe o e-mail ou o CPF de alguém e tenta transferir um ingresso para ele fica
sabendo que aquela conta não está autorizada; risco aceito pelo responsável (premissa 5), sem dado novo revelado. **Ponto de atenção:** a
pessoa cadastrada antes de ter conta ainda não leu a Política; por isso **a PartyX só cadastra quem pediu acesso ou concordou em
participar**. **Direitos:** acesso, correção, eliminação e oposição pelo e-mail partyx992@gmail.com, em até 15 dias; a oposição é atendida
retirando a pessoa da lista.

**Conclusão:** com as salvaguardas acima e a regra de cadastrar só quem pediu, o interesse da PartyX não se sobrepõe aos direitos e às
liberdades do titular, e o tratamento pode se basear no legítimo interesse (art. 7º, IX). Revisar se a finalidade ou os dados mudarem.

Assinatura do encarregado: ______________________________ Data: ____/____/______
