# Self-hosting Work League

Work League runs anywhere Node runs, or on Cloudflare Workers. Pick the setup that fits your office.

- [Docker, one container](#docker-one-container): the easiest. The database lives in a volume.
- [Docker Compose with PostgreSQL](#docker-compose-with-postgresql): for a server you already run.
- [Cloudflare Workers](#cloudflare-workers): free tier friendly, with a hosted PostgreSQL.
- [Any Node host](#any-node-host): a VM, Fly.io, Railway, Render, …

After any of them, do the [first-run setup](#first-run-setup).

## Docker, one container

```sh
git clone https://github.com/TheTrueFerret/work-league.git
cd work-league
docker build -t work-league .
docker run -d --name work-league --restart unless-stopped \
  -p 3000:3000 \
  -v work-league-data:/data \
  -e ADMIN_PASSWORD='pick-a-strong-one' \
  -e ORIGIN='http://localhost:3000' \
  work-league
```

The container uses an embedded PostgreSQL (PGlite) in the `work-league-data` volume and applies
migrations on every start. Set `ORIGIN` to the address people actually open, such as
`https://league.example.com` behind a reverse proxy. Without it, saving forms fails.

Behind a proxy that sets `X-Forwarded-For`, also set `ADDRESS_HEADER=X-Forwarded-For` so the
passphrase lockout counts attempts per person, not per proxy.

## Docker Compose with PostgreSQL

```sh
ADMIN_PASSWORD='pick-a-strong-one' ORIGIN='https://league.example.com' docker compose up -d
```

`docker-compose.yml` starts PostgreSQL 17 and the app, which migrates the database on start-up. Set
`POSTGRES_PASSWORD` too if the database port is reachable from anywhere but the app.

## Cloudflare Workers

Workers can't run the embedded database, so you need a hosted PostgreSQL. Supabase and Neon both
have free tiers.

1. Create a database and copy its connection string. For Supabase, use the **transaction pooler**
   URI (port 6543).
2. Apply the schema from your machine:
   ```sh
   DATABASE_URL='postgres://…' npm run db:migrate
   ```
3. Give the Worker its secrets and deploy:
   ```sh
   npx wrangler secret put DATABASE_URL
   npx wrangler secret put ADMIN_PASSWORD
   npm run deploy
   ```

`wrangler.jsonc` keeps variables you set in the dashboard (`keep_vars`), so deploys don't wipe
them. Rename the Worker by changing `name` there.

## Any Node host

```sh
npm ci
npm run build:node
DATABASE_URL='…' npm run db:migrate
DATABASE_URL='…' ADMIN_PASSWORD='…' ORIGIN='https://…' PORT=3000 npm start
```

`DATABASE_URL` can be `postgres://…` or `pglite:/var/lib/work-league` for the embedded database.

## First-run setup

1. Open `/admin` and sign in with `ADMIN_PASSWORD`.
2. **Branding:** set the league name and tagline, upload a square logo and pick a colour, or tap
   one of the colours taken from your logo. The preview shows light and dark.
3. **Games:** switch off any games your office doesn't play.
4. **Access:** set the office passphrase and share it with colleagues. Until you set one, anyone
   with the link can record results. Turn on **public rankings** if you want a read-only view for
   a screen in the office.
5. Add people at `/players`, or let colleagues add themselves.

Changing the passphrase signs everyone out. Admin sessions last twelve hours.

## Updating

Pull the latest version, rebuild, and restart. Docker images migrate on start. On Cloudflare, run
`npm run db:migrate` against your database before `npm run deploy`. Always back up first:

```sh
pg_dump "$DATABASE_URL" > work-league-$(date +%F).sql
```

For the embedded database, copy the volume or folder while the app is stopped.

## Keeping your changes

Settings, branding and logos live in the database, so they survive updates and never conflict with
upstream code. Custom game modules live in their own folders under `src/lib/modules/`, which keeps
merges painless.
