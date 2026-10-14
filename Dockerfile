# Imagem única: a API (Hono) serve o build do front-end (Vite) e as rotas /api.
# Nenhum segredo entra na imagem: variáveis vêm do Cloud Run e do Secret Manager.

FROM node:24-slim AS build
ARG APP_ENV=producao
ARG ENABLE_PROTOTYPE=false
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Textos legais da PartyX (docs/visual-e-legal.md): pasta `conteudo-legal/`, versionada no Git e vinda da tag publicada. Ausente, vira
# pasta vazia e o site mostra "documento pendente" (em produção o cadastro e a venda ficam bloqueados).
RUN mkdir -p conteudo-legal && APP_ENV="$APP_ENV" ENABLE_PROTOTYPE="$ENABLE_PROTOTYPE" npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Migrações: aplicar com `node dist-server/migrate.js` usando DATABASE_URL_DIRECT (job de deploy, não na partida do servidor).
COPY --from=build /app/drizzle ./drizzle
# Texto e versão andam juntos: a imagem leva os arquivos, o deploy leva versão e data (LEGAL_CONTENT_DIR=/app/legal). Rollback volta os dois.
COPY --from=build /app/conteudo-legal ./legal
USER node
EXPOSE 8080
CMD ["node", "dist-server/index.js"]
