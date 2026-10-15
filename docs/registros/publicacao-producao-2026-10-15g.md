# Publicação em produção: seletor de cor embutido no painel (15/10/2026)

Pedido do responsável (Arthur): seletor de cor embutido no campo "Cor de destaque" (`seletor-de-cor-2026-10-15.md`), "fluxo de sempre, com meu OK antes da virada". O OK veio às 18:54 UTC: "faça commit e deploy". O commit já estava feito; o fluxo foi direto até a virada.

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-15g`, commit `51d5a9e`; `env.prod.yaml`, `conteudo-legal/` e `drizzle/` iguais aos da `release-2026-10-15f` |
| Migração | nenhuma |
| Dependência nova | `react-colorful` 5.8.1 (versão fixa, inspecionada antes de instalar), só no pacote do painel |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-15g-51d5a9e` (Cloud Build `b6a3385c`, 1 min 52 s) |
| Revisão no ar | `partyx-00028-vax`, 100% |
| Revisão anterior | `partyx-00026-rim` (mantida; referência de retorno) |
| Estado | Igual ao anterior: **cadastro aberto, venda fechada** |

## Linha do tempo (UTC, 15/10/2026)

| Hora | Passo | Resultado |
|---|---|---|
| 18:55 a 18:57 | `deploy.sh build` da `release-2026-10-15g` | imagem pronta |
| 18:58 | Backup sob demanda | execução `partyx-backup-dxz64` ok; cópia `partyx-20261015T185755Z.dump` conferida por `check-backup.sh` |
| 18:58 | `deploy.sh candidata` | revisão `partyx-00028-vax` sem tráfego; teste rápido 14 de 14 |
| 18:58 a 18:59 | Conferência pela candidata | pacotes com os mesmos nomes do build testado no local (`index-B44kowk3.js`, `admin-lcCoPoWe.js`): a biblioteca e os textos do seletor ("Saturação e brilho", "Cores prontas", "Pegar uma cor da tela") só no pacote do painel, nada no do site. No navegador, a 360 e 1280 px: início, lista, página do `teste01-2` (capa nítida) e "Entrar" sem erro e sem rolagem lateral |
| 18:59 | `deploy.sh virar` | 100% na `partyx-00028-vax`; teste rápido 14 de 14 |
| 19:00 | Bateria por HTTPS em `partyx.com.br` | 21 de 21; pelo domínio, o pacote novo e a mesma conferência das páginas públicas |

O seletor em si (no painel, com login) não foi aberto em produção: não há credencial de administrador nesta sessão. Ele foi conferido no local com o mesmo build (`e2e:cor`, 8 de 8) e, em produção, pelo conteúdo do pacote do painel.

Sem mudança na Vercel, nas rotinas, na verificação de saúde e nas permissões da nuvem.

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00028-vax`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00026-rim ./infra/producao/deploy.sh rollback`.
- A `00026-rim` usa o mesmo banco (sem migração): volta o seletor do sistema no campo da cor; cores já salvas continuam valendo.

## Para a PartyX saber

- No cadastro e na edição do evento, a cor de destaque agora se escolhe arrastando no quadrado e na barra de cores, digitando o código ou tocando numa das cores prontas; a prévia mostra o resultado na hora.
- O conta-gotas ("Pegar uma cor da tela") só aparece no Chrome e no Edge do computador.
