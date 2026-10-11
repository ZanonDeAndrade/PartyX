# Runbook: incidente de segurança ou de dados pessoais

A CONTRATADA é **operadora**; a PartyX é **controladora** e decide sobre comunicar à ANPD e aos titulares (Cl. 15.4). Detalhes e inventário em `../../lgpd.md` e `../../seguranca.md`.

1. **Identificar:** o que aconteceu, quando, o que foi afetado (dados pessoais? quais? quantos titulares?). Preservar evidência (logs, horários); não apagar nada.
2. **Conter:** trocar segredos expostos (Secret Manager, nova revisão), revogar sessões (`update sessions set revoked_at = now()` por procedimento aprovado, ou desativar o usuário), bloquear o vetor, tirar do ar se necessário.
3. **Avaliar:** extensão, dados envolvidos (CPF, nome, e-mail, telefone; **senha e cartão não estão no sistema em texto**: hash forte; cartão nunca passa pelo servidor), risco aos titulares.
4. **Avisar a PartyX sem demora indevida**, por escrito, com as informações disponíveis (o que se sabe e o que não). Não aguardar a investigação terminar para avisar.
5. **Corrigir** a causa, testar e publicar. **Registrar** linha do tempo, decisões e quem decidiu.
6. A comunicação à ANPD e aos titulares é da PartyX. Prazos e bases legais são dela; a CONTRATADA não inventa prazo.
