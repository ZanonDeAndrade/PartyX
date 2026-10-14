# Regras para menores de idade (16 e 17 anos) na compra e na entrada (14/10/2026, D-85)

| Campo | Registro |
|---|---|
| Quem decidiu | Arthur (responsável da contratada), com os textos e o modelo de autorização que ele forneceu |
| Data | 14/10/2026 |
| Canal | Pedido escrito nesta sessão de trabalho; plano e migração 0009 aprovados ("OK para o plano e a migração 0009, com as recomendações A a G e 1 a 6") |
| Insumos | Termos de Uso 1.1, Política de Privacidade 1.1, Termo de Ciência para Menores 1.0 (`conteudo-legal/termo-menor.txt`), texto da autorização 1.0 (`conteudo-legal/autorizacao-menor.txt`) e o modelo visual `autorizacao-menor-modelo.pdf` (anexo do responsável, fora do repositório) |
| O que NÃO foi usado | O PDF antigo `docs/termo_responsabilidade_partyx_corrigido_com_linha_evento.pdf`: a cláusula 5 de lá (exoneração de "qualquer responsabilidade") foi retirada de propósito, e a idade é 16, não 14 |

## Regras

1. **Cadastro:** data de nascimento obrigatória; recusa quem tem menos de 16 anos hoje. Depois de gravada, só a PartyX corrige (como o CPF), com motivo e trilha (sem a data na trilha). Conta antiga sem data informa a data no próximo checkout, uma vez.
2. **Idade que vale:** anos completos na **data de início do evento, no fuso de São Paulo** (recomendação 1). Aniversário conta no próprio dia; 29/02 completa em 01/03 nos anos não bissextos.
3. **Evento:** "permite menores de 16 e 17" (sim ou não), horário de início e fim e número da autorização judicial. Permitir menores exige fim, autorização e classificação abaixo de 18 (recomendação 4). Eventos existentes ficam "não permite".
4. **Compra:** menos de 16 na data do evento não compra; menos de 18 em evento sem menores não compra; 16 ou 17 compra com o Termo de Ciência aceito (caixa não marcada), gravado com o pedido (versão, idade, data, IP, navegador).
5. **Autorização em PDF:** gerada pelo servidor no visual do modelo, com os dados do evento e, se o comprador for menor, com o nome e a data de nascimento dele. Download no fim da compra, em Meus ingressos, pelo link do e-mail de confirmação (página que exige entrar na conta) e em branco na página do evento.
6. **Portaria:** em pedido de comprador menor, o aviso é "Pedido de comprador menor: conferir a idade de cada pessoa; quem tiver 16 ou 17 anos entrega a autorização" (ajuste do responsável à recomendação 2). O ingresso não é consumido até o validador escolher: "Menor: autorização recebida" (grava `true` na leitura) ou "Tem 18 anos ou mais" (grava `false`). A confirmação só é pedida quando a pessoa é menor. "Recusar" vai para a trilha e o ingresso continua válido (recomendação 3). A busca e a lista de contingência marcam MENOR.
7. **Textos:** Termos e Privacidade 1.1, Termo de Ciência 1.0 e texto da autorização 1.0 em `conteudo-legal/` (no Git). Vigência = data da publicação. Quem aceitou a 1.0 aceita a 1.1 no próximo login ou checkout; o checkout recusa até aceitar; só comprador (recomendação 5). O termo de menor também tem página pública, `/termo-menor` (recomendação 6).

## Ajustes do modelo visual (A a G)

O texto do modelo anexo já traz A (16 anos), B (assinatura à mão, com local e data), C (bloco do menor), D (autorização judicial), E (título "Termo de Autorização e Responsabilidade"), F (cópia do documento do responsável) e G (horário do evento). O gerador segue o leiaute do anexo, sem logo, e lê o texto do arquivo versionado.

## Revisão de 14/10/2026 (noite): sem autorização judicial e novo cabeçalho do termo

Pedido do responsável (Arthur), com o modelo revisto `docs/ui/autorizacao-menor-modelo-2026-10-14.pdf`:

- **A autorização judicial saiu do sistema todo** (escolha do responsável entre "só do PDF" e "sistema todo"): o campo "Autorização judicial (portaria ou alvará) nº" sai do termo, do formulário do evento no painel, da validação do servidor e da exportação de fechamento. Evento que permite menores passa a exigir só o horário de fim (e classificação abaixo de 18). Migração `drizzle/0010_sem_autorizacao_judicial.sql`: troca a regra `events_minors_need_authorization` por `events_minors_need_end`; a coluna `events.judicial_authorization` fica, sem uso, para não apagar dado e para a reversão ser simples (a reversão recusa se já houver evento com menores sem o número).
- **Cabeçalho do termo:** logo da PartyX à esquerda (o mesmo desenho do site, em `public/brand/partyx-logo-print-dark.png`, 652 x 360, versão escura do arquivo de impressão) e "CNPJ 58.471.403/0001-07" à direita, com uma linha fina embaixo. Sem o nome empresarial e sem endereço no termo (continuam nos Termos, na Privacidade e nos e-mails).
- **Rodapé:** "Atendimento PartyX: e-mail · WhatsApp · horário", montado das variáveis `PARTYX_SUPPORT_*`. Abaixo, discreta, a versão do texto ("Termo versão 1.0, vigente desde 14/10/2026."): o modelo não a trazia; o responsável escolheu mantê-la, porque o papel fica retido na portaria e a versão mostra qual texto foi assinado.
- **Uma página sempre**, inclusive com nome do evento, local e nome do menor no limite (teste em `server/src/minors/authorizationPdf.test.ts`).
- Premissa a confirmar com a PartyX: a dispensa da autorização judicial é decisão de negócio e jurídica da PartyX; aqui ela foi aplicada a pedido do responsável da contratada.

## Onde está

Migração `drizzle/0009_menores_de_idade.sql` (com reversão que recusa se houver prova); `server/src/domain/age.ts`; `server/src/orders/buyer.ts`; `server/src/auth/consent.ts`; `server/src/minors/`; portaria em `server/src/gate/service.ts`; telas em `src/site/`. Testes: `server/src/domain/age.test.ts`, `server/src/api/minors.integration.test.ts`, `server/src/minors/authorizationPdf.test.ts` e os de esquema e operação.

## Pendente

- Publicação (migração, candidata, virada), com OK do responsável em cada passo de nuvem.
- Confirmação escrita da PartyX sobre os textos 1.1, o Termo de Ciência e o termo de autorização, a arquivar.
- Guarda do termo em papel por 6 meses e destruição depois (Política 1.1): procedimento da PartyX na portaria.
