# Publicação em produção: abertura em toda carga de página e e-mail ligado (18/10/2026)

Pedido do responsável (Arthur): a abertura em vídeo aparece sempre que a pessoa abre o site (`abertura-sempre-2026-10-16.md`), no próximo candidato, junto com o e-mail de produção, que ele ligou em 16/10 (domínio verificado no Resend, `scripts/resend-chave-envio.sh producao`, chave de acesso total revogada). OK da virada: "OK para a virada da partyx-00040-dow".

- **Abertura** (`9130662` e `9a1cd31`): em toda carga de página, na volta pelo Voltar restaurada do cache e na volta para a aba depois de 1 minuto; nunca nas rotas de tarefa; plano B em CSS; no máximo 4 s na tela, contados desde que a camada aparece; script e vídeo em `/assets` com hash no nome, cache imutável e guardados na Vercel.
- **E-mail:** a revisão monta o segredo `smtp-url` (versão 1, chave só de envio, restrita a `partyx.com.br`). `EMAIL_FROM` `PartyX <ingressos@partyx.com.br>`; Reply-To pelo e-mail de atendimento (`partyx992@gmail.com`).

| Campo | Registro |
|---|---|
| Versão | tag local `release-2026-10-16d`, commit `9a1cd31`; `env.prod.yaml`, `conteudo-legal/` e `drizzle/` iguais aos da `release-2026-10-16b`; servidor igual (só um comentário e um teste) |
| Migração | nenhuma |
| Imagem | `southamerica-east1-docker.pkg.dev/partyx-producao/partyx/partyx-api:release-2026-10-16d-9a1cd31` (Cloud Build `30a41554`, 1 min 47 s; digest `sha256:0936b065…`) |
| Revisão no ar | `partyx-00040-dow`, 100% |
| Revisão anterior | `partyx-00037-zap` (mantida; referência de retorno, sem SMTP) |
| Sem tráfego | `partyx-00039-faz` (candidata da `release-2026-10-16c`, `9130662`, montada em 17/10 para o e-mail de teste; não foi virada e perdeu a tag "candidata" sozinha) |
| Estado | **cadastro aberto, venda fechada**; e-mail ligado |

## Linha do tempo (UTC)

| Hora | Passo | Resultado |
|---|---|---|
| 17/10 00:26 a 00:28 | `deploy.sh build` da `release-2026-10-16c` | imagem pronta (Cloud Build `1ced2053`) |
| 17/10 00:28 | Backup sob demanda | `partyx-backup-lkzjk`; cópia `partyx-20261017T002819Z.dump` conferida |
| 17/10 00:30 | `deploy.sh candidata` | `partyx-00039-faz` sem tráfego; teste rápido 15 de 15; `SMTP_URL` montado do `smtp-url:latest` |
| 17/10 00:31 | E-mail de teste pela candidata (recuperação de senha de `zanondea@gmail.com`; o Turnstile está desligado em produção) | 202; `email_log` "enviado" na 1ª tentativa às 00:31:29, sem aviso nos logs; recebido na caixa de entrada com SPF, DKIM e DMARC em PASS (conferido pelo responsável). A 1ª tentativa sai na própria requisição; só as novas tentativas e a varredura diária vão pela URL principal |
| 17/10 | Medição da abertura pela candidata | o vídeo não tocou em nenhum aparelho (o prazo de 1 s contava do clique); decisão: contar desde a camada, arquivos com hash |
| 18/10 20:05 a 20:07 | `deploy.sh build` da `release-2026-10-16d` | imagem pronta |
| 18/10 20:07 | Backup sob demanda | `partyx-backup-jsg9j`; cópia `partyx-20261018T200723Z.dump` conferida |
| 18/10 20:09 | `deploy.sh candidata` | `partyx-00040-dow` sem tráfego; teste rápido 15 de 15; imagem, `SALES_OPEN=false`, `EMAIL_FROM` e `SMTP_URL` conferidos |
| 18/10 20:10 a 20:18 | Conferência pela candidata | script e vídeo com hash, cache de 1 ano imutável, vídeo em pedaços (206); vídeo em 21 de 24 primeiras visitas, máximo 3,67 s na tela (`abertura-sempre-2026-10-16.md`). A Vercel não guarda HTML (`MISS`), então `/intro` não precisou ficar no ar |
| 18/10 20:20 | `deploy.sh virar` | 100% na `partyx-00040-dow`; teste rápido 15 de 15 |
| 18/10 20:21 | Bateria por HTTPS em `partyx.com.br` | 28 de 28 |
| 18/10 20:22 | Cache da Vercel nos arquivos novos | script `HIT`; vídeo `MISS` no primeiro pedido e `HIT` depois (0,20 a 0,25 s), também em pedaços |
| 18/10 20:23 a 20:31 | Medição da abertura pelo domínio | abaixo |

Sem mudança na Vercel, nas rotinas, na verificação de saúde e nas permissões da nuvem.

## Medição pelo domínio, depois da virada

8 primeiras visitas por aparelho, cada uma num navegador novo, e 3 voltas com recarregar:

| Aparelho | 1ª visita com vídeo | Mais tempo na tela | Volta (recarregar) |
|---|---|---|---|
| Chromium, computador 1280 | 7 de 8 (6 inteiros; 1 começou com 680 ms e foi cortado no limite de 4 s) | 4,0 s | 3 de 3 com vídeo |
| Chrome do Android 360 | 5 de 8, todos inteiros | 3,77 s | 2 de 3 com vídeo |
| WebKit, viewport de iPhone 390 | 8 de 8, todos inteiros | 3,80 s | 2 de 3 com vídeo |

As outras visitas mostraram o logo animado em CSS. Sem rolagem lateral, sem erro de página, `/entrar` sem abertura. A rede desta máquina estava instável (DNS, conexão e TLS até a Vercel de 0,1 a 1,8 s; algumas páginas levaram de 4 a 15 s para chegar), e uma medição do Android parou por espera de 30 s e foi repetida; no servidor, o pedido mais lento desde a virada levou 0,10 s, sem nenhum 5xx. Os avisos do log são os 401 de `/api/auth/me` de quem visita sem login.

## E-mail

- Novos cadastros e pedidos de recuperação de senha passam a receber e-mail.
- Os 15 e-mails de cadastro que falharam de 14/10 16:11 a 16/10 06:51 (horário de São Paulo, sem SMTP) ficam como estão, por decisão do responsável. Nenhuma rotina os envia: o envio só pega e-mails `pendente`; reabrir só existe em `POST /api/admin/emails/:id/retry`, à mão, sem tela no painel. A fila do Cloud Tasks estava vazia.

## Voltar atrás

- **Referência de retorno a partir daqui: `partyx-00040-dow`.** Para desfazer esta publicação: `PROJECT=partyx-producao REVISAO=partyx-00037-zap ./infra/producao/deploy.sh rollback`.
- A `00037-zap` usa o mesmo banco, mas não monta o `smtp-url`: os e-mails voltariam a falhar (e iriam para revisão manual depois de 4 tentativas). Volta também a abertura antiga.
