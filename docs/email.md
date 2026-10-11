# E-mails transacionais

Implementado em 01/10/2026 (Prompt 14): RF-36, RF-67 (parte) e a entrega do CA-01 e do RF-05. Código em `server/src/mail/` (`outbox.ts`, `templates.ts`), `server/src/providers/email.ts`, `server/src/auth/reset.ts` e `server/src/api/emailAdmin.ts`. **Sem migração**: a fila usa a tabela `email_log`.

> **O que NÃO está provado:** entrega real. Não há provedor, domínio nem remetente definidos pelo cliente (D-09, insumos 4 e 18). Tudo foi provado com um **servidor SMTP de teste** local e com a captura fictícia. SPF, DKIM e DMARC não existem ainda (nenhum domínio).

## Modelos

| | Quando | Conteúdo |
|---|---|---|
| E01 Cadastro | Ao criar a conta | "Sua conta foi criada". Não exige confirmar o e-mail (a conta já funciona). Botão para os eventos |
| E02 Recuperação | Ao pedir nova senha | Link de uso único, válido por 1 hora |
| E03 Compra confirmada | Pagamento confirmado | Evento, data, horário, local, pedido e ingressos por tipo. Botão para **Meus ingressos** |
| Pagamento recebido sem ingresso disponível (interno, 10/10/2026) | Pagamento aprovado depois da reserva, sem estoque; um item por **administrador ativo** | Pedido, evento, comprador (nome e e-mail, sem CPF), valor, data da aprovação, referência no gateway e a orientação de estorno pela PartyX no gateway. Botão para **Exceções** no painel. Procedimento provisório até D-13 (`webhook-e-conciliacao.md`) |

- **Sem QR e sem anexo.** O QR de um ingresso é credencial: o e-mail leva só ao Meus ingressos, onde é preciso entrar na conta (testado: nenhum código, QR ou imagem no corpo).
- HTML com tabela e estilos em linha (compatível com clientes de e-mail), sempre com a versão em texto e pré-cabeçalho. Tudo que vem do banco é escapado no HTML e limpo de quebras de linha no assunto (**injeção de cabeçalho** testada, inclusive ponta a ponta no SMTP).
- Fora de produção: assunto com `[HOMOLOGAÇÃO]` ou `[LOCAL]` e aviso no corpo ("e-mail de teste, identidade visual provisória"). Em produção, sem prefixo.
- **Identidade visual provisória** (cores do protótipo, rodapé "a fornecer"). O logotipo já é o original: imagem pública `/brand/partyx-logo-email.png` em URL absoluta, igual para todos (nada do destinatário na URL), com o fundo da marca embutido e texto alternativo "PartyX". É a única imagem permitida no corpo (testado). A identidade final é do Prompt 19, depois da aprovação do cliente.

## Fila (outbox) — falha de e-mail nunca desfaz nada

1. O item é gravado **na mesma transação** do fato: o e-mail de compra é enfileirado junto com a confirmação do pedido (existe se, e somente se, o pedido foi confirmado). Cadastro e recuperação são enfileirados logo depois de criados.
2. A entrega é feita **depois**, fora de qualquer transação: logo em seguida (esperando no máximo 3 s, sem segurar webhook nem cadastro) e, o que ficar, pela rotina do Scheduler (a cada 2 min, a mesma da conciliação de pagamentos).
3. **Idempotente:** chave única (`compra:<pedido>`, `cadastro:<usuário>`, `reset:<id>`). Notificação repetida do gateway, 4 confirmações simultâneas: um e-mail.
4. **Tentativas (mudou em 06/10/2026):** 4 no total: a primeira logo depois do fato e **3 retentativas agendadas no Cloud Tasks para +2, +10 e +30 minutos** depois de cada falha (antes eram 8, com espera de 1 a 720 min, retomadas só pela rotina periódica). A 4ª falha marca **revisão manual** (`falhou`, trilha `email.revisao_manual`, alerta `email_falhou`); a varredura diária é só rede de segurança. Fila fora do ar: alerta `fila_email_falhou`. Cada item é "reservado" por 5 min por execução (`FOR UPDATE SKIP LOCKED`): duas execuções nunca pegam o mesmo item (testado, inclusive com linhas trancadas por outra execução).
5. **Estado:** `pendente` (aguardando ou tentando de novo), `enviado`, `falhou` (esgotou). Só o **nome** do erro é guardado: nunca o texto (que pode ter endereço), o token ou a resposta do provedor.
6. **Alerta:** ao esgotar, log com `alert=email_falhou` (para um alerta do Cloud Monitoring, D-47). `GET /api/admin/emails?status=falhou` lista; `POST /api/admin/emails/:id/retry` reabre (auditado).
7. **Pelo menos uma entrega:** uma queda entre o envio e o registro pode repetir o envio. O `Message-ID` é derivado da chave e **igual em todas as tentativas**, então o provedor e o cliente de e-mail reconhecem a duplicata.
8. **O e-mail deixa de se aplicar** (não é erro nem alerta): usuário desativado, pedido que foi estornado antes de o e-mail sair (diria o contrário da verdade). Fica `falhou` com `nao_aplicavel:<motivo>` e não pode ser reaberto.

Provado: falha de e-mail com o pagamento já processado (pedido pago, ingressos emitidos, gateway recebe 200, e-mail sai depois pela rotina); SMTP que **nunca responde** não prende o webhook (limite de 3 s); cadastro continua 201 com e-mail falhando.

## Recuperação de senha (D-45)

A fila **não guarda token**. O link é criado **no momento do envio**; se o envio falhar e repetir, o link da tentativa anterior deixa de valer. Só o hash do token vai ao banco. Limite de 3 pedidos por hora, contado na fila; resposta igual exista o e-mail ou não. Telas novas: `/recuperar-senha` e `/redefinir-senha` (o token sai do endereço visível assim que é lido). Verificado no navegador: pedir, abrir o link do e-mail, senha fraca recusada, trocar, o mesmo link recusado ("já foi utilizado"), entrar com a nova senha.

## Entrega

`providers/email.ts`: `EmailSender` com **SMTP** (`SMTP_URL`, ex.: `smtps://usuario:senha@host:465`, segredo no Secret Manager), captura local e em memória para teste. SMTP é aceito por todo provedor comum, então o adaptador **não escolhe o provedor pelo cliente** (D-46). Variáveis: `SMTP_URL`, `EMAIL_FROM` (`PartyX <ingressos@dominio>`; obrigatório com SMTP_URL, validado contra injeção de linha) e `EMAIL_REPLY_TO`.

- **Local, sem SMTP:** captura em `.data/emails/` (HTML e texto) e `GET /api/dev/emails` (só local). **Fictício**; nada é enviado a ninguém.
- **Homologação e produção, sem SMTP:** o envio **falha de forma explícita**; o item fica na fila e o alerta dispara. Nunca consta como enviado.
- Cabeçalhos: `Message-ID` estável, `Auto-Submitted: auto-generated`, `Reply-To` opcional.

## SPF, DKIM e DMARC (a fazer quando houver domínio)

Quando o cliente definir o domínio remetente (D-08, D-09), o provedor escolhido informa os registros. Em linhas gerais:

| Registro | Onde | Exemplo | Observação |
|---|---|---|---|
| SPF | TXT na raiz do domínio | `v=spf1 include:<provedor> -all` | Um só registro `v=spf1` por domínio |
| DKIM | TXT ou CNAME em `<seletor>._domainkey.<domínio>` | informado pelo provedor | Chave de 2048 bits |
| DMARC | TXT em `_dmarc.<domínio>` | `v=DMARC1; p=none; rua=mailto:...` | Começar com `p=none`, ler os relatórios e subir para `quarantine` e `reject` |

`infra/email-dns-check.sh` (somente leitura, **não executado contra o domínio do cliente**) confere os três: `DOMAIN=... DKIM_SELECTOR=... ./infra/email-dns-check.sh`. **Passar o script não prova entrega**: falta enviar de verdade para caixas reais (Gmail, Outlook) e conferir "SPF/DKIM/DMARC: pass" no cabeçalho e a pasta de destino.

## O que foi verificado

- 37 testes novos (464 passam, contra PostgreSQL real): modelos (escape, injeção, prefixo de ambiente, sem QR), fila (idempotência, concorrência, `SKIP LOCKED`, espera crescente, `Message-ID` estável, esgotar e reabrir, perfil de administrador), compra (mesma transação do pagamento, dados e link, sem QR, repetida, falha sem desfazer pagamento, SMTP pendurado, estornado antes de sair), cadastro, recuperação (link válido uma vez, novo a cada tentativa, 1 hora, nada em texto no banco, limite e resposta igual, nada no log), ambiente, e **entrega real por SMTP** contra um servidor SMTP de teste (texto e HTML, remetente, resposta, acentos, sem anexo, injeção de cabeçalho, recusa 451 e conexão recusada tratadas como falha com nova tentativa). **Mutações:** sem checar "pedido pago" 1 teste falha; sem a idempotência da fila 1; sem `SKIP LOCKED` 2 (depois de acrescentar um teste que prende linhas, porque a primeira versão do teste de concorrência **não** pegava a falha).
- **Navegador real:** cadastro, "esqueci minha senha", e-mail capturado, link, nova senha, link reutilizado recusado, login. E-mail renderizado e conferido a 480 px.

## O que **não** foi verificado

- **Entrega real, reputação e caixa de spam**: nenhum e-mail saiu para um provedor ou caixa de verdade.
- **SPF, DKIM e DMARC**: sem domínio, nada foi configurado nem testado em produção.
- Renderização em **clientes de e-mail reais** (Outlook, Gmail, Apple Mail, modo escuro). Foi conferido só em navegador.
- Limites e latência de um provedor específico; envio em volume (abertura de vendas).
- Alerta no Cloud Monitoring (D-47) e o canal de aviso.
- Texto final dos e-mails e identidade visual (Prompt 19, com a aprovação do cliente).

## Decisões abertas

D-08 e D-09 (domínio e remetente, do cliente), D-45, D-46 e D-47.
