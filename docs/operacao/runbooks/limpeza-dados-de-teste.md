# Runbook: limpar dados de teste em produção

Para tirar de produção eventos de teste **com** pedidos, ingressos ou entradas (compras de teste da equipe). Usado pela primeira vez em
19/10/2026 (eventos "Teste" e "Teste02"; registro `docs/registros/limpeza-dados-de-teste-2026-10-19.md`). Cada passo com OK do
responsável; `CLOUDSDK_CORE_PROJECT=partyx-producao` em todo comando.

## Por que não pelo painel

O botão "Excluir" do painel só apaga evento **sem** pedido (em qualquer situação), ingresso, entrada ou aceite de termo de menor; com
qualquer um deles, recusa e oferece arquivar. O banco confere de novo: `events_delete_only_unused`, `ticket_types_delete_only_unused` e
`forbid_delete` em pedidos, itens, lotes dos itens, ingressos, entradas, avisos do gateway, transferências e aceites; a trilha
(`audit_log`) só aceita inclusão. Arquivar só tira do site: Visão geral, Pedidos, Ingressos, Entradas e o relatório da taxa mensal
continuam contando. Por isso a limpeza é um script, no dono do banco, numa transação.

## Antes

1. **Dinheiro.** Todo pedido com dinheiro precisa de devolução antes:
   - pelo painel do Mercado Pago (caminho do sistema): o webhook do tópico `order` grava "Estornado" e cancela os ingressos válidos;
     o usado fica "Utilizado". Se o aviso se perder, a rotina das 04:00 reconsulta os pagos com mais de 20 h desde a última conferência
     (`gcloud scheduler jobs run partyx-varredura-diaria --location=southamerica-east1` dispara fora de hora, com o mesmo efeito);
     Se o aviso não chegar, reconsultar a order só lendo (`GET /v1/orders/<ORD…>` com `mp-access-token`, imprimindo só situação,
     detalhe e estornos): sem estorno lá, o problema é no Mercado Pago (ex.: devolução não concluída por saldo), não no webhook;
   - ou fora do Mercado Pago (Pix manual): o pedido continua "Pago" aqui e aprovado lá; registrar em `docs/registros/` número, valor,
     forma e data da devolução, para a contabilidade, e usar `--aceitar-pagos` com a lista desses pedidos no script.
2. **Leitura (papel `partyx_backup`, transação `read only`):** ids e slugs dos eventos, todos os pedidos e ingressos deles, entradas
   (inclusive leituras de ingresso de teste gravadas em **outro** evento: a chave estrangeira obriga a apagá-las junto, e isso precisa de
   OK), avisos do gateway, e-mails, contagem por tabela. Modelos: `infra/producao/limpeza/leitura-estado.mjs` e
   `foto-e-contagem-2026-10-19.mjs`, com
   `DB_URL="$(gcloud secrets versions access latest --secret=database-url-backup)" PG_FROM="$PWD/package.json" node <script>`.
3. **Foto do que não pode mudar** (o evento real: evento, tipos, lotes, descontos), gravada em arquivo; o script compara antes e depois.
4. **Invariantes:** `node auditoria/ferramentas/invariantes.mjs "$(gcloud secrets versions access latest --secret=database-url-backup)"`.
5. **Backup sob demanda e conferência:** `gcloud run jobs execute partyx-backup --region=southamerica-east1 --wait`, depois
   `PROJECT=partyx-producao ./infra/operacao/check-backup.sh` e o SHA-256 do `.dump` contra o `.dump.sha256` e o manifesto (contagens
   por tabela). Apagar a cópia local depois de conferir (tem dado pessoal).

## O script

Modelo: `infra/producao/limpeza/limpeza-eventos-teste-2026-10-19.mjs` (ids, slugs, nomes e pedidos devolvidos fixos no topo; copiar e
trocar para uma limpeza nova, nunca reaproveitar com outros ids sem revisar).

- Conexão do dono (`database-url-direct`), porque os gatilhos são dele. Uma transação; `lock_timeout` 5 s.
- Recusa e desfaz se: id, slug ou nome não bater; o evento real estiver na lista; evento não arquivado; pedido pago, pendente,
  contestado ou pago sem estoque (com `--aceitar-pagos`, só os pagos da lista, com o mesmo valor); a foto do evento real mudar; a
  contagem apagada diferir da contada antes; sobrar linha; gatilho ficar desligado; a trilha não crescer exatamente uma linha por evento.
- Desliga os gatilhos de exclusão **só dentro da transação** (`ALTER TABLE ... DISABLE TRIGGER`, transacional; trava escrita nessas
  tabelas por alguns segundos) e religa antes do commit. Os gatilhos da trilha não são tocados.
- Ordem: entradas, aceites de menor da transferência, transferências, e-mails, avisos do gateway, aceites (menor e cancelamento),
  ingressos, lotes dos itens, reservas, itens, pedidos, descontos de promoter, lotes, tipos, eventos.
- Grava na trilha `evento.limpeza_dados_de_teste` por evento, em nome do administrador, com os pedidos, valores, forma da devolução e as
  linhas apagadas.
- **Ensaio primeiro** (padrão, termina em `ROLLBACK`); mostrar o resultado; `--executar` só com OK.

```
DB_URL="$(gcloud secrets versions access latest --secret=database-url-direct)" PG_FROM="$PWD/package.json" \
FOTO_BERNARDO=<foto.json> BACKUP_REF=<execução do backup> ADMIN_EMAIL=<e-mail do administrador> \
node infra/producao/limpeza/limpeza-eventos-teste-2026-10-19.mjs [--aceitar-pagos] [--executar]
```

## Banners

Fora do banco: `gcloud storage ls gs://partyx-producao-banners/events/<id do evento>/` e, com OK, `gcloud storage rm` desse prefixo.

## Depois

- Visão geral (hoje e mês), Pedidos, Ingressos e Entradas sem os dados de teste; relatório da taxa mensal sem os ingressos de teste.
- Invariantes de novo; foto do evento real igual; nenhum gatilho desligado; nenhum alerta.
- A numeração dos pedidos não volta (o próximo segue a sequência).
- Pedidos devolvidos fora do Mercado Pago continuam aprovados lá: a conciliação não os procura mais (o pedido não existe aqui); um aviso
  tardio deles cai como "sem pedido" e não muda nada.
- Registrar em `docs/registros/` e em `../registro-rotinas.md`.
