# Riscos aceitos

## 10/10/2026 — acesso direto ao Cloud Run e `X-Forwarded-Host`

**Decisão.** Manter Firebase Hosting na frente do Cloud Run sem adicionar load balancer agora. Em produção, a aplicação aceita o domínio configurado diretamente ou `Host=*.run.app` com `X-Forwarded-Host` igual ao domínio configurado. Sem esse cabeçalho, o `run.app` recebe 403, exceto nos health checks.

**Evidência.** A sonda real executada na homologação em 05/10/2026 registrou `Host=<serviço>.run.app`, `X-Forwarded-Host=partyx-hml.web.app`, `Via=1.1 Firebase Hosting` e `X-Forwarded-For=<cliente>,<proxy Google>`; veja `README-DEPLOY.md`. A [documentação oficial do Firebase Hosting](https://firebase.google.com/docs/hosting/full-config) confirma que rewrites podem encaminhar requisições ao Cloud Run, mas não define qual cabeçalho preserva o host original. Por isso, o comportamento do cabeçalho é sustentado pela medição, não por um contrato documentado do Firebase.

**Risco residual aceito.** `X-Forwarded-Host` pode ser forjado por quem chama o `run.app` diretamente. A regra reduz o acesso casual, mas não é um controle forte de origem. O impacto residual se limita a contornar os limites por IP: continuam valendo os limites por e-mail, os tetos globais no banco, a autenticação e as permissões. `TRUSTED_PROXY_HOPS=2` permanece correto atrás do Hosting porque a mudança não altera `X-Forwarded-For`; uma chamada direta que forje a cadeia pode, por definição, enganar apenas o filtro por IP.

**Evolução.** Se houver abuso real ou aumento de tráfego, avaliar HTTPS load balancer e Cloud Run com ingress restrito a `internal-and-cloud-load-balancing`. Essa opção tem custo e exige aprovação antes da implementação. Ao mudar a entrada, medir novamente `TRUSTED_PROXY_HOPS`.

## 10/10/2026 — avisos moderados do `npm audit`

**Decisão.** Não fazer upgrade major antes de 20/10/2026. `npm audit fix` sem `--force` não encontrou correção patch/minor segura. Reavaliar em 20/10/2026 ou antes se surgir versão patch/minor compatível.

**`esbuild`.** O pacote afetado é `esbuild@0.18.20`, transitivo de `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils`. Toda essa cadeia está em `devDependencies`; `npm audit --omit=dev` não a inclui e a imagem de runtime instala com `npm ci --omit=dev`. O aviso [GHSA-67mh-4wv8-2f99](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99) afeta o servidor de desenvolvimento do esbuild. A produção serve a aplicação pelo Hono e não inicia esse servidor.

**`uuid`.** `uuid@9.0.1` é transitivo de `gaxios@6.7.1`, usado por `@google-cloud/storage` e `google-auth-library`, portanto aparece em `npm audit --omit=dev`. O aviso [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) afeta `v3`, `v5` e `v6` quando o chamador fornece buffer e deslocamento sem limite. O código instalado do `gaxios` usa somente `uuid.v4()` para criar o delimitador aleatório de multipart; o PartyX não importa o pacote `uuid` diretamente. A função vulnerável não é usada no caminho de produção identificado.

**Exposição aceita.** O `npm audit` registra seis avisos moderados no total e dois ao omitir dependências de desenvolvimento. Não foi identificada exposição real em produção nas condições descritas acima. A correção sugerida para a cadeia do esbuild troca a linha principal do `drizzle-kit`; ela fica adiada para a reavaliação controlada.
