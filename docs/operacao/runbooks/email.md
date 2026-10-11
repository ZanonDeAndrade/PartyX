# Runbook: e-mail

O e-mail **nunca** reverte pagamento: o pedido já está pago e o ingresso existe em Meus ingressos. Falha de e-mail é atraso, não perda.

1. `npm run ops:weekly`: e-mails na fila e com falha. Alerta: `email_falhou`.
2. `GET /api/admin/emails` (administrador) lista com situação e último erro (sem dado pessoal). Reenviar: `POST /api/admin/emails/:id/retry`.
3. Falha de **todos**: provedor (SMTP) fora, credencial vencida ou domínio sem autenticação. Confira `SMTP_URL` (segredo), limite do plano e o painel do provedor.
4. Cai no **spam**: rode `DOMAIN=<domínio> DKIM_SELECTOR=<seletor> infra/email-dns-check.sh` (SPF, DKIM, DMARC; ainda não executado contra o domínio real). DNS mudou? Corrigir com a PartyX (ela controla o domínio, D-08).
5. Comprador diz que não recebeu: peça para olhar o spam e oriente a abrir **Meus ingressos** pelo site (o ingresso não depende do e-mail). Atendimento ao comprador é da PartyX.
6. Recuperação de senha sem e-mail: o comprador pede de novo (link vale 1 hora e é de uso único).
