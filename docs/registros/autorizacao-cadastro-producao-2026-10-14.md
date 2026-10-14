# Autorização para abrir o cadastro em produção (14/10/2026)

| Campo | Registro |
|---|---|
| Quem autorizou | Bernardo (PartyX) e Arthur (responsável da contratada) |
| Data e hora | Bernardo: 14/10/2026 às 10:00 (horário informado por Arthur; fuso presumido de Brasília). Arthur: 14/10/2026, na mesma mensagem que pediu a abertura |
| Canal | Bernardo: WhatsApp. Arthur: pedido escrito nesta sessão de trabalho |
| Como chegou a este registro | Informado por Arthur em 14/10/2026. A captura da conversa do WhatsApp fica com o responsável, fora deste repositório, porque contém número de telefone. Local de guarda: a informar pelo responsável |
| O que foi autorizado, conforme informado | Abrir a **criação de conta** de compradores em produção (`SIGNUP_OPEN=true`) |
| O que **não** está coberto | Abertura de vendas: `SALES_OPEN` continua `false` |

## Situação em 14/10/2026 às 14:18 (Brasília), 17:18 UTC

**Não executado.** A conferência prévia (bloco 1, só leitura) parou no item dos textos legais:

- Em produção, Termos de Uso, Política de Privacidade e Política de Cancelamento estão como **pendente**: sem texto, sem versão e sem data de vigência. Conferido em `https://partyx.com.br/api/legal/versions` (`ready: false`) e em `/api/public/legal/<documento>` (`status: pendente`), tanto na revisão no ar (`partyx-00003-xeq`) quanto na candidata (`partyx-00007-gol`, pela Vercel).
- A pasta `conteudo-legal/` não existe na máquina de publicação, e o `infra/producao/env.prod.yaml` não tem `TERMS_*`, `PRIVACY_*` nem `CANCELLATION_*`.
- Com isso, o `deploy.sh` recusa `SIGNUP_OPEN=true`, e o próprio servidor recusa o cadastro em produção (`cadastro_indisponivel`) enquanto faltar qualquer um dos três textos publicados (RF-03, RF-68, D-11, D-80).

A autorização continua registrada e pode ser usada quando os textos da PartyX chegarem e forem publicados, conforme `checklist-abertura-de-vendas.md`.

## Atualização em 14/10/2026, à tarde

- Termos de Uso 1.0 e Política de Privacidade 1.0 (vigência 14/10/2026) entregues pelo responsável e postos em `conteudo-legal/`, com versões e datas no `env.prod.yaml`.
- Decisão do responsável (D-84, `decisao-cadastro-sem-cancelamento-2026-10-14.md`): o cadastro exige só esses dois; a Política de Cancelamento passa a ser exigida para vender.
- `SIGNUP_OPEN: "true"` e `SALES_OPEN: "false"` no `env.prod.yaml`, ainda **não publicados**: a abertura acontece na virada da candidata, com OK do responsável, e o resultado vai para o registro da publicação.
