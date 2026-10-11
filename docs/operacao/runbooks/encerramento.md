# Runbook: encerramento do contrato

Sem novo contrato, a PartyX pode **exportar os dados**; a exportação fica disponível por **30 dias** depois do encerramento (Anexo II, 5). **Não se entrega código-fonte** (Cl. 9.4).

1. **Aos 11 meses:** lembrar a PartyX por escrito de que a renovação exige manifestação com 30 dias de antecedência (Cl. 19.3).
2. **No encerramento:** registrar a data e avisar, por escrito, a janela de 30 dias e o fim dela.
3. **Gerar a exportação:** `DATABASE_URL=<leitura> npm run ops:export-closure -- <pasta-nova>` (recusa sobrescrever; arquivos com permissão restrita). Gera CSV de eventos, tipos, promoters, usuários, aceites, pedidos, itens, ingressos, entradas na portaria e trilha de auditoria, mais `LEIA-ME.txt`. **Não** leva hash de senha, código secreto dos ingressos, conteúdo do QR, sessões, segredos nem o corpo das notificações do gateway.
4. **Entregar** por canal seguro (o arquivo tem dados pessoais) e **apagar as cópias locais** depois da entrega confirmada. Registrar a entrega.
5. **Banners e demais arquivos** do bucket: oferecer cópia junto.
6. **Depois dos 30 dias:** excluir os dados (banco, buckets, segredos, projeto), **respeitando a rotação dos backups** (a cópia mais antiga some pela retenção do bucket) e **eventual obrigação legal de retenção** informada pela PartyX. Registrar o que foi excluído e quando; não inventar prazo legal.
7. Registrar tudo em `../registro-rotinas.md`.
