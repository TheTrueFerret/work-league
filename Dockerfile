# Work League for any Docker host. Build: docker build -t work-league .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build:node && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000 \
	DATABASE_URL=pglite:/data/league
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.ts ./scripts/migrate.ts
# Used by the embedded database when DATABASE_URL is a pglite: path.
VOLUME /data
EXPOSE 3000
USER node
# Bring the database schema up to date, then serve.
CMD ["sh", "-c", "node scripts/migrate.ts && node build"]
