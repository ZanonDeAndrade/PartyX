# Correções dos achados solicitados da seção 6

Data: 10/10/2026. Escopo: sete pontos indicados pelo responsável; sem deploy, push ou criação de recursos.

| Ponto | Correção e prova |
|---|---|
| RF-09, CA-05 | Hono lê a sessão antes do shell de `/admin/*`, `/portaria/*` e `/primeiro-acesso`. Visitante recebe 302 com `voltar`; perfil errado recebe 403 com página G04 e link para a área autorizada. Cliente e servidor mantêm a checagem. Integração: `server/src/api/security.integration.test.ts`. |
| CSRF sem sessão | Em produção, mutação aceita `Origin` exatamente igual à origem de `PUBLIC_BASE_URL`; sem Origin exige `Sec-Fetch-Site: same-origin`. Origem divergente recebe 403. Integração: `server/src/api/security.integration.test.ts`. |
| Host direto | Em produção, aceita o domínio de `PUBLIC_BASE_URL` ou `Host=*.run.app` com `X-Forwarded-Host` igual ao domínio. A combinação foi medida na homologação em 05/10/2026; sem o cabeçalho, o acesso direto recebe 403, exceto health. Integração: `server/src/api/security.integration.test.ts`. |
| Portaria | A memória continua como primeiro filtro por usuário (300 leituras/min, 40 buscas/min). O banco agora impõe teto agregado de 3000 leituras/min e 400 buscas/min com `global_limit_counters`; valores ajustáveis. Integração com duas instâncias: `server/src/api/gate.integration.test.ts`. |
| Cadastro | `SIGNUPS_PER_IP_PER_HOUR=100` por instância e `GLOBAL_SIGNUPS_PER_HOUR=1000` no banco. 100/IP/h tolera rede compartilhada melhor que 10; 1000/h permite centenas de compradores na abertura sem o bloqueio do antigo teto de 30/h. São premissas operacionais, não capacidade medida; revisar com dados de carga da homologação. Integração: `server/src/api/auth.integration.test.ts`. |
| Protótipo e docs | Rotas só servem em homologação com `ENABLE_PROTOTYPE=true`. O build de homologação cria chunk dinâmico; produção exclui o código. Integração de rotas: `server/src/api/security.integration.test.ts`; build Vite conferido nos dois modos. |
| Dependências | `npm audit fix` sem `--force` não encontrou atualização patch/minor que elimine os avisos. Nenhuma alteração de versão foi mantida. Restam seis avisos moderados no total e dois com `--omit=dev`. O `esbuild@0.18.20` existe apenas na cadeia de desenvolvimento do `drizzle-kit`; o `uuid@9.0.1` está no runtime via `gaxios`, mas essa dependência chama somente `v4()`, fora das funções afetadas `v3/v5/v6`. Risco aceito até nova avaliação em 20/10/2026. |

## Bundle

Antes: `dist/assets/index-CF4aFyS3.js`, 989.412 bytes, com protótipo e docs no arquivo principal. Depois, produção: `dist/assets/index-BoNy-H3M.js`, 521.792 bytes; sem chunk de protótipo. Redução do JS principal: 467.620 bytes (47,3%). Homologação com a flag: entrada 523.436 bytes, chunk dinâmico `prototypeEntry-rABTAIXV.js` de 467.480 bytes e CSS próprio de 137 bytes, carregados só nas rotas permitidas. O CSS principal ficou em 53.212 bytes nos dois modos. Hashes variam entre builds.

## Roteamento de produção

O encaminhamento real medido na homologação em 05/10/2026 chega ao Cloud Run com `Host=*.run.app` e o domínio público em `X-Forwarded-Host` (registro em `README-DEPLOY.md`). A documentação oficial do Firebase confirma o rewrite para Cloud Run, mas não especifica esse cabeçalho; a implementação se apoia na medição. O script de deploy foi liberado e nenhuma publicação foi executada.

`TRUSTED_PROXY_HOPS=2` continua correto: o Hosting medido produz `X-Forwarded-For=<cliente>,<proxy Google>`, e a nova regra não muda essa cadeia. Cloud Tasks e Scheduler enviam `X-Forwarded-Host` explicitamente ao chamar o `run.app` com OIDC.

O risco aceito do cabeçalho forjável, a exposição residual do `npm audit` e a alternativa de load balancer estão detalhados em `docs/registros/riscos-aceitos.md`.

## Validação final

Executada em 10/10/2026, sem deploy:

| Comando | Resultado |
|---|---|
| `npm run lint` | aprovado, sem erros; 24 avisos preexistentes fora do escopo |
| `npm run typecheck` | aprovado |
| `npm run test:db` | 46 arquivos e 748 testes na suíte principal, mais 1 arquivo e 4 testes de papéis; 752 aprovados no total |
| `npm run build` | aprovado; cliente de produção sem chunk do protótipo e servidor gerado |
| `bash -n infra/producao/deploy.sh` | aprovado; script liberado, não executado |

O teste de integração de Host comprova domínio direto com 200, `run.app` com `X-Forwarded-Host` do domínio com 200, `run.app` sem o cabeçalho com 403 e health check com 200. O teste unitário de proxy confirma que a cadeia medida `<cliente>,<proxy Google>` extrai o cliente com `TRUSTED_PROXY_HOPS=2`.
