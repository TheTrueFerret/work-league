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
	DATABASE_URL=file:/data/league.db
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.ts ./scripts/migrate.ts
# The SQLite database lives here. A named
# volume mounted here inherits this ownership, so the node user can write to it.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
USER node
# Bring the database schema up to date, then serve.
CMD ["sh", "-c", "node scripts/migrate.ts && node build"]
