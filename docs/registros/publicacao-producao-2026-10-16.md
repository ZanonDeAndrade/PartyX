# Publicação em produção: campos de data no celular e painel sem meia-entrada (16/10/2026)

Pedido do responsável (Arthur): "coloque em produção e faça commit no git", depois da correção dos campos de data e hora no celular (`campos-de-data-no-celular-2026-10-16.md`). Durante a publicação, antes da virada, chegou outro pedido: tirar do painel os textos de ajuda que citam meia-entrada e juntar à próxima publicação. Como a candidata ainda não tinha tráfego, a mudança entrou nesta mesma publicação, com versão nova.

- **Campos de data e hora** (`5b16173`): sem aparência nativa, texto à esquerda, altura e fonte dos campos de texto, ícone onde o aparelho não mostra; "R$" do valor sem quebrar; botão da capa com 44 px.
- **Painel sem meia-entrada** (`d9fc445`): o exemplo do nome do tipo passa a "Pista, Camarote, VIP" e sai a frase "Tipos de meia-entrada podem existir: o documento é conferido na portaria, sem envio de comprovante". Também corrige o e2e do celular, que apontava o cadastro para `/cadastro` (o endereço é `/criar-conta`).

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-16b`, commit `d9fc445`; `env.prod.yaml`, `conteudo-legal/`, `drizzle/` e o servidor iguais aos da `release-2026-10-15j` |
| Migração | nenhuma |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-16b-d9fc445` (Cloud Build `b2240511`, 1 min 51 s) |
| Revisão no ar | `partyx-00037-zap`, 100% |
| Revisão anterior | `partyx-00034-hug` (mantida; referência de retorno) |
| Sem tráfego | `partyx-00036-buy` (candidata da `release-2026-10-16`, `5b16173`, substituída antes da virada; nunca recebeu tráfego) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada** |

## Linha do tempo (UTC, 16/10/2026; 15/10 e 16/10 de madrugada em São Paulo)

| Hora | Passo | Resultado |
|---|---|---|
| 03:12 a 03:14 | `deploy.sh build` da `release-2026-10-16` (`5b16173`) | imagem pronta (Cloud Build `573f18be`) |
| 03:15 | Backup sob demanda | execução `partyx-backup-5lw6t` ok; cópia `partyx-20261016T031502Z.dump` conferida por `check-backup.sh` |
| 03:15 | `deploy.sh candidata` | **recusou**: "o banco apontado NÃO é o de produção", com a mensagem de erro vazia antes (falha de conexão do Node, não marca errada). Conferido só lendo: DNS e conexão TCP com o Neon ok e `db:env check producao` "ok: o banco é de producao". Falha momentânea da rede desta máquina |
| 03:16 | `deploy.sh candidata`, de novo | revisão `partyx-00036-buy` sem tráfego; teste rápido 15 de 15; CSS do site e do painel iguais aos do build local |
| 03:20 a 03:26 | Pedido novo: textos do painel sem meia-entrada | texto trocado; lint, tipos e build ok; `test:db` 1.107 + 4 (uma rodada logo depois do build teve 1 falha intermitente; duas seguintes passaram inteiras); e2e painel no celular 62, documentos 3, textos longos 78; commit `d9fc445`, tag `release-2026-10-16b` |
| 03:27 a 03:29 | `deploy.sh build` da `release-2026-10-16b` | imagem pronta |
| 03:29 | `deploy.sh candidata` (sem backup novo: sem migração, o das 03:15 vale) | revisão `partyx-00037-zap` sem tráfego; teste rápido 15 de 15 |
| 03:29 a 03:30 | Conferência pela candidata (com `X-Forwarded-Host: partyx.com.br`) | 4 de 4 pacotes (JS e CSS do site e do painel) iguais ao build local testado; pacote do painel sem "Meia-entrada" e com "Camarote, VIP"; em `/criar-conta`, data de nascimento preenchida no WebKit com as regras de data do iOS (390 x 844) e no Chrome do Android (360 x 800): sem rolagem lateral, campo dentro da caixa, fonte de 16 px, sem aparência nativa, altura 48 px (48,8 no Chrome, contra 48 do campo de texto), texto à esquerda com ícone |
| 03:30 | `deploy.sh virar` | 100% na `partyx-00037-zap`; teste rápido 15 de 15 |
| 03:31 | Bateria por HTTPS em `partyx.com.br` | 28 de 28 |
| 03:31 | A mesma conferência de `/criar-conta` pelo domínio | igual à da candidata, com o pacote novo (`index-DHUgJuUS.css`) |

Sem mudança na Vercel, nas rotinas, na verificação de saúde e nas permissões da nuvem. Os formulários do painel não foram abertos em produção (sem login de administrador nesta conferência): eles saem do mesmo pacote testado no e2e local.

**A conferir no aparelho:** o estouro da borda no iPhone vem do controle nativo, que só existe no iOS. Abrir o cadastro e a edição de evento num iPhone e ver se as datas e horários ficam dentro da tela e à esquerda.

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00037-zap`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00034-hug ./infra/producao/deploy.sh rollback`.
- A `00034-hug` usa o mesmo banco: voltam os campos de data com a aparência nativa, o "R$" que quebra no celular e os textos de meia-entrada no painel.
