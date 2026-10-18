# Checklist de abertura de cadastro e vendas (produção)

Preparado em 14/10/2026. **Nada aqui foi executado.** A publicação de 13/10 deixou cadastro e vendas fechados (`publicacao-producao-2026-10-13.md`). Abrir exige todos os itens abaixo marcados, com data e quem conferiu. Item da PartyX sem resposta escrita não se marca por suposição.

## 1. Depende da PartyX

| # | Item | Como se comprova | Feito em | Por quem |
|---|---|---|---|---|
| 1.1 | Termos de Uso, Política de Privacidade e Política de Cancelamento fornecidos (D-11) | Arquivos em `conteudo-legal/`, com versão e data de cada um | **Feito em 15/10/2026:** Termos 1.2, Privacidade 1.2 e Política de Cancelamento, Troca e Reembolso 1.0 publicados (`release-2026-10-15h`, `partyx-00030-jos`), com o OK do Bernardo informado por Arthur. A Política deixou de ser pendência para vender. Antes: 14/10/2026, só Termos 1.0 e Privacidade 1.0 (bastam para o cadastro, D-84) | Arthur (responsável); OK do Bernardo |
| 1.2 | Dados da PartyX para o rodapé e os e-mails (razão social, CNPJ, contato) | Variáveis `PARTYX_*` e `EMAIL_REPLY_TO` preenchidas | 14/10/2026: `PARTYX_*` no `env.prod.yaml`; `EMAIL_REPLY_TO` vazio de propósito (cai no e-mail de atendimento) | Arthur (responsável) |
| 1.3 | Identidade visual aprovada por escrito (CA-33) | Registro em `aprovacao-visual.md` |  18/10/2026: o Bernardo aprovou o visual por escrito pelo WhatsApp (print guardado pelo responsável fora do repositório; `aprovacao-visual.md`) | Arthur (informou) |
| 1.4 | Gateway de produção confirmado por escrito (D-01) | Registro em `decisoes-pendentes.md` | | |
| 1.5 | Evento real cadastrado, com tipos, preços e capacidade conferidos pela PartyX | Tela do admin conferida pelo Bernardo |  18/10/2026: "PARTY X ESTÁ VOLTANDO!" cadastrado pelo próprio Bernardo; tipos, preços e capacidade são os dele (Pista Masculino R$ 30 e Pista Feminino R$ 25, 10 de cada) | Arthur (informou) |
| 1.6 | Autorização escrita para abrir, com a data | Registro novo em `docs/registros/` | 14/10/2026, **só o cadastro** (vendas não): `autorizacao-cadastro-producao-2026-10-14.md`. Textos do cadastro prontos no mesmo dia; abertura depende da candidata e da virada | Bernardo (WhatsApp, 10:00) e Arthur, informado por Arthur |

### Regras de menores (D-85, preparado em 14/10/2026)

| # | Item | Como se comprova | Feito em | Por quem |
|---|---|---|---|---|
| 1.7 | Termos 1.1, Privacidade 1.1, Termo de Ciência 1.0 e texto da autorização 1.0 confirmados por escrito pela PartyX | Registro em `docs/registros/` | 14/10/2026, aprovação do Bernardo informada por Arthur (`aprovacao-menores-e-contatos-2026-10-14.md`); prova fora do repositório | Bernardo, informado por Arthur |
| 1.8 | Migração 0009 aplicada em produção, com backup do dia conferido | Job `migrate` e `check:migrations` | 14/10/2026 19:03 UTC: backup `partyx-backup-gmhk6` conferido, `partyx-migrate-67cxn` ok; revisão `partyx-00010-ced` no ar às 19:05 (`publicacao-producao-2026-10-14d.md`) | Arthur (pedido), Claude (execução) |
| 1.9 | Evento real que permite menores: horário de fim informado e PDF da autorização conferido (sem autorização judicial desde 14/10/2026) | Painel e PDF baixado | | |

## 2. Domínio e e-mail

| # | Item | Como se comprova | Feito em | Por quem |
|---|---|---|---|---|
| 2.1 | `partyx.com.br` e `www` ativos no Firebase, com HTTPS | API `customDomains`: `HOST_ACTIVE` e `CERT_ACTIVE` | Pendente no Firebase. Desde 14/10/2026 o domínio está no ar pela Vercel (ponte temporária, `docs/operacao/vercel.md`), com HTTPS | |
| 2.2 | `PUBLIC_BASE_URL=https://partyx.com.br` publicado (candidata, teste rápido, virada) | Revisão nova; `run.app` direto 403 | 14/10/2026, revisão `partyx-00008-gaz` (`publicacao-producao-2026-10-14.md`) | Claude, com OK de Arthur |
| 2.3 | Rotina diária e verificação de saúde refeitas com o domínio | Execução manual 200; verificação apontando para `partyx.com.br` | 14/10/2026: rotina diária e limpeza com 200; `partyx-saude-dominio` criada e a do `web.app` apagada | Claude, com OK de Arthur |
| 2.4 | Domínio verificado no Resend; `smtp-url` de produção com chave só de envio; `EMAIL_FROM` de produção | `scripts/resend-chave-envio.sh producao` ok | 16/10/2026: DKIM duplicado apagado, domínio verificado, script ok (`smtp-url` v1, chave `partyx-producao-envio` só de envio, restrita a `partyx.com.br`); `EMAIL_FROM` `PartyX <ingressos@partyx.com.br>` no `env.prod.yaml` desde 14/10; Reply-To pelo atendimento (`partyx992@gmail.com`). O SMTP vale na revisão que montar o segredo (candidata `partyx-00039-faz` em 17/10) | Arthur (Resend e script); Claude (conferência) |
| 2.5 | Entrega real de e-mail conferida, inclusive fora do spam | E-mail de teste recebido na caixa de entrada | 17/10/2026 00:31 UTC: recuperação de senha de `zanondea@gmail.com` pela candidata `partyx-00039-faz`, enviada na 1ª tentativa (`email_log` `enviado` às 00:31:29), sem aviso nos logs; recebida na caixa de entrada com SPF, DKIM e DMARC em PASS | Claude (envio e conferência); Arthur (caixa de entrada) |
| 2.6 | Chave de acesso total do Resend revogada | Painel do Resend | 16/10/2026 | Arthur |
| 2.7 | DMARC de `p=none` para `p=quarantine`, depois dos envios passando | `dig TXT _dmarc.partyx.com.br` | | |

## 3. Técnica

| # | Item | Como se comprova | Feito em | Por quem |
|---|---|---|---|---|
| 3.1 | Banco de produção sem dados de teste | Contagem das tabelas | | |
| 3.2 | Usuários reais da equipe criados, com senha temporária e troca obrigatória | Lista do responsável; primeiro acesso de cada um | | |
| 3.3 | `sslmode=verify-full` nas URLs do banco | Versão nova dos segredos; saúde 200 | | |
| 3.4 | Limites de cadastro revistos (hoje 1.000 por hora no total e 10 por hora por IP) | `env.prod.yaml` |  18/10/2026: 50 por hora por IP (antes 10), por causa do IP compartilhado das operadoras de celular; 1.000 por hora no total mantido | Arthur (decisão) |
| 3.5 | Backup do dia restaurado em banco isolado | `restore.sh` com as verificações ok | | |
| 3.6 | Os 16 alertas ativos e o e-mail da operação recebendo | Lista de políticas; último teste em 14/10/2026 |  18/10/2026: 17 políticas ativas, com o alerta de 5xx novo ("PartyX: respostas 5xx (partyx)") | Claude, com OK de Arthur |

## 4. Compra real de baixo valor (antes de abrir ao público)

Feita pelo Bernardo, com o cadastro e a venda abertos só pelo tempo do teste, em evento de valor baixo.

| # | Item | Como se comprova | Feito em | Por quem |
|---|---|---|---|---|
| 4.1 | Assinatura secreta do webhook no painel do Mercado Pago igual à versão vigente de `mp-webhook-secret` | Conferência do responsável no painel |  18/10/2026: o script de comparação do SHA-256 respondeu "igual" | Arthur |
| 4.2 | Compra com Pix aprovada e ingresso emitido | Pedido pago; ingresso com QR no e-mail e na conta | | |
| 4.3 | **Webhook real com assinatura válida**, conferido no log | Linha de log do webhook aceito, do pagamento do teste | | |
| 4.4 | Estorno feito no Mercado Pago e refletido no sistema | Pedido estornado; ingresso cancelado | | |
| 4.5 | Nenhum alerta inesperado no período | Lista de incidentes | | |

## 5. Abertura

| # | Item | Como se comprova | Feito em | Por quem |
|---|---|---|---|---|
| 5.1 | `SIGNUP_OPEN=true`, `SALES_OPEN=true`, `VISUAL_APPROVED=true`, versões e datas dos textos legais no `env.prod.yaml` | Diff revisado pelo responsável |  18/10/2026: `SALES_OPEN=true`, `VISUAL_APPROVED=true`, textos 1.2/1.2/1.0 e de menores 1.0 no `env.prod.yaml` da `release-2026-10-18` | Claude, por ordem de Arthur |
| 5.2 | Publicação com `GO_LIVE_CONFIRMED=sim-aceite-e-autorizacao-registrados` (o `deploy.sh` recusa sem os itens 1.1, 1.3 e este) | Candidata, teste rápido e virada | | |
| 5.3 | Rollback pronto, com a revisão anterior anotada | Comando registrado | | |
| 5.4 | Comunicação escrita à PartyX com a data e a hora da abertura | Mensagem enviada pelo responsável | | |
| 5.5 | Registro da abertura em `docs/registros/` | Arquivo novo | | |
| 5.6 | Instância mínima **não** é ligada na abertura das vendas (decisão do responsável, 18/10/2026): a verificação de saúde `partyx-saude-dominio` chama o site a cada 5 minutos, de 3 regiões, e mantém o servidor acordado. Se um dia precisar: README-DEPLOY, seção 7 (`deploy.sh evento-on`/`evento-off`) | `deploy.sh status`: `MIN_SERVICO` vazio | Não se aplica | Arthur (decisão) |
