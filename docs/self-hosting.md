# Self-hosting Work League

Work League runs on Cloudflare Workers with D1, or anywhere Node runs with a SQLite file. Pick the
setup that fits your office.

- [Cloudflare Workers](#cloudflare-workers): free tier friendly, nothing else to sign up for.
- [Docker, one container](#docker-one-container): the easiest on your own server.
- [Docker Compose](#docker-compose): the same, as a Compose file.
- [Any Node host](#any-node-host): a VM, Fly.io, Railway, Render, …

After any of them, do the [first-run setup](#first-run-setup). Coming from PostgreSQL? See
[moving from PostgreSQL](#moving-from-postgresql).

## Cloudflare Workers

The data lives in [D1](https://developers.cloudflare.com/d1/), Cloudflare's SQLite database. The
`DB` binding in `wrangler.jsonc` names it `work-league`.

```sh
npx wrangler login
npx wrangler d1 create work-league         # once; answer "no" if it offers to edit wrangler.jsonc
npx wrangler secret put ADMIN_PASSWORD
npm run deploy                             # build, migrate D1, deploy
```

`npm run deploy` applies any new migrations to D1 before it deploys, so updates are one command.
Rename the Worker by changing `name` in `wrangler.jsonc`, and the database with `database_name`.

To try the Workers build locally on a local D1 database: `npm run preview`.

`wrangler.jsonc` keeps variables you set in the dashboard (`keep_vars`), so deploys don't wipe
them.

### Deploying from GitHub Actions

Keep your own copy of the repository and add a workflow that runs `npm run deploy` on every push
to `main`, with two repository secrets:

- `CLOUDFLARE_API_TOKEN`: a [custom API token](https://dash.cloudflare.com/profile/api-tokens) with
  **Workers Scripts: Edit** and **D1: Edit** for your account.
- `CLOUDFLARE_ACCOUNT_ID`: shown by `npx wrangler whoami`.

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

The data is a SQLite file in the `work-league-data` volume, migrated on every start. Set `ORIGIN`
to the address people actually open, such as `https://league.example.com` behind a reverse proxy.
Without it, saving forms fails.

Behind a proxy that sets `X-Forwarded-For`, also set `ADDRESS_HEADER=X-Forwarded-For` so the
passphrase lockout counts attempts per person, not per proxy.

## Docker Compose

```sh
ADMIN_PASSWORD='pick-a-strong-one' ORIGIN='https://league.example.com' docker compose up -d
```

`docker-compose.yml` builds the image and keeps the SQLite file in the `league` volume.

## Any Node host

```sh
npm ci
npm run build:node
DATABASE_URL='file:/var/lib/work-league/league.db' ADMIN_PASSWORD='…' ORIGIN='https://…' PORT=3000 npm start
```

A `file:` database is created and migrated when the app starts. `DATABASE_URL` can also be a
hosted libSQL database such as [Turso](https://turso.tech) (`libsql://…?authToken=…`); run
`npm run db:migrate` against it before starting.

## First-run setup

1. Tap **Admin** in the top bar (or open `/admin`) and sign in with `ADMIN_PASSWORD`. Anyone you
   give it to is an admin too.
2. **Branding:** set the league name and tagline, upload a square logo and pick a colour, or tap
   one of the colours taken from your logo. The preview shows light and dark. The admin screen
   also draws the picture chat apps show when someone pastes a league link (Slack, Teams,
   WhatsApp, Discord): your logo, name and tagline on your colour, signed Work League. It
   redraws by itself whenever you save the branding or logo.
3. **Games:** switch off any games your office doesn't play.
4. **Access:** set the office passphrase and share it with colleagues. Until you set one, anyone
   with the link can record results. Turn on **public rankings** if you want a read-only view for
   a screen in the office.
5. Add people at `/players`. Only an admin can add, rename or remove people; colleagues with the
   passphrase record results.

Changing the passphrase signs everyone out. Admin sessions last twelve hours.

## Updating

Pull the latest version and redeploy. On Cloudflare, `npm run deploy` migrates D1 first; Docker
images and `file:` databases migrate on start. Back up first:

```sh
npx wrangler d1 export work-league --remote --output=work-league-$(date +%F).sql   # D1
cp /var/lib/work-league/league.db work-league-$(date +%F).db                      # SQLite file, app stopped
```

D1 also keeps 30 days of point-in-time recovery: `npx wrangler d1 time-travel`.

## Moving from PostgreSQL

Work League 0.1 and the original pool ladder (Open Pottr) stored their data in PostgreSQL.
`npm run import:postgres` reads either and writes the SQL to recreate the league:

```sh
npm run import:postgres -- 'postgres://…'     # writes work-league-import.sql
npm run deploy                                # creates and migrates the D1 database
npx wrangler d1 execute DB --remote --file=work-league-import.sql
```

People, matches, ratings and settings come across exactly; nothing is recalculated. The import
refuses to run on a league that already has people in it. Logos are not copied, so upload yours
again at `/admin`. For a local SQLite file instead, run the import with `--apply` and
`DATABASE_URL=file:…` set.

## Keeping your changes

Settings, branding and logos live in the database, so they survive updates and never conflict with
upstream code. Custom game modules live in their own folders under `src/lib/modules/`, which keeps
merges painless.
