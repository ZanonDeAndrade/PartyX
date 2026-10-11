# Imagem única: a API (Hono) serve o build do front-end (Vite) e as rotas /api.
# Nenhum segredo entra na imagem: variáveis vêm do Cloud Run e do Secret Manager.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# Migrações: aplicar com `node dist-server/migrate.js` usando DATABASE_URL_DIRECT (job de deploy, não na partida do servidor).
COPY --from=build /app/drizzle ./drizzle
USER node
EXPOSE 8080
CMD ["node", "dist-server/index.js"]
