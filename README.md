# 🎱 Pottr

A self-hosted pool ladder. Record who won, see who's actually any good.

- **Any team size.** 1v1, 2v2, 4v4 — whatever you're playing.
- **Upsets pay.** Beat someone well above you and you take a big chunk of their
  rating. Beat someone far below you and you'll barely notice.
- **Installable.** Add it to your phone's home screen and it opens like an app.
- **Light and dark**, following whatever your phone is set to.

SvelteKit + Drizzle + Supabase Postgres, running on Cloudflare Workers.

## Setup

**1. Create a Supabase project**, then grab the connection string from
*Project Settings → Database → Connection string → URI*. Either pooler works;
the transaction pooler (port 6543) is the usual choice.

```sh
cp .env.example .env      # paste your connection string into DATABASE_URL
npm install
npm run db:migrate        # creates the four tables
```

If you'd rather not run migrations locally, paste `drizzle/0000_init.sql`
straight into the Supabase SQL editor instead.

**2. Run it locally.**

```sh
npm run dev               # http://localhost:5173
```

**3. Deploy to Cloudflare.**

```sh
npx wrangler secret put DATABASE_URL   # paste the same connection string
npm run deploy
```

`npm run preview` runs the built Worker in Cloudflare's own runtime before you
ship it, reading its secrets from a local `.dev.vars` file:

```sh
echo 'DATABASE_URL=postgres://...' > .dev.vars   # git-ignored
npm run preview
```

Then open **Players**, add everyone, and start recording matches.

### Configuration

| Where              | Name           | How to set it                             |
| ------------------ | -------------- | ----------------------------------------- |
| Cloudflare         | `DATABASE_URL` | `npx wrangler secret put DATABASE_URL`    |
| `npm run dev`      | `DATABASE_URL` | `.env`                                    |
| `npm run preview`  | `DATABASE_URL` | `.dev.vars`                               |
| migrations / seed  | `DATABASE_URL` | `.env`                                    |

The Worker's name and compatibility flags live in `wrangler.jsonc`. Rename
`pottr` there if you want a different `*.workers.dev` subdomain, or add a
[custom domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

`nodejs_compat` is required — postgres.js needs `node:net`, `node:tls` and
`AsyncLocalStorage`.

### Install it on your phone

Open the site and choose **Add to Home Screen** (iOS: Share → Add to Home
Screen; Android: menu → Install app). It runs full-screen with no browser
chrome, and the app shell is cached so it opens instantly.

> **Pottr has no login.** Anyone who can reach it can record matches and edit
> players. A `*.workers.dev` URL is public, so put
> [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)
> in front of it if you don't want strangers editing your ladder.

## How the rating works

Everyone starts at **1000**.

Each player is scored against the **average rating of the opposing team**, so in
a 4v4 the weakest player on the winning side gains the most and the strongest
gains the least. After every match:

```
expected = 1 / (1 + 10 ^ ((opponentAverage - yourRating) / 400))
change   = K × (1 if you won else 0 − expected)
```

`K` is how much a single match can move you: **40** for your first 10 games,
**28** up to 30 games, then **20**. New players find their level quickly and
established ratings stay stable.

What that means at the table:

| Match                        | Winner gets | Loser drops |
| ---------------------------- | ----------- | ----------- |
| 900 beats 1400 (big upset)   | **+19**     | −19         |
| 1200 beats 1200 (coin flip)  | **+10**     | −10         |
| 1400 beats 900 (as expected) | **+1**      | −1          |

The match screen shows every player's potential gain and loss *before* you pick
a winner, so nobody's surprised.

## Fixing mistakes

Recorded the wrong result? Delete the match from **History**.

Ratings are path-dependent, so removing an old match invalidates every rating
that came after it. Rather than trying to unpick the arithmetic, Pottr replays
the whole history from scratch whenever a match is deleted — every rating ends
up exactly as if the mistake never happened. Recording a *new* match is always
the most recent event, so that path updates in place instead.

Players who've played matches can't be deleted, only **archived** — that hides
them from match entry while keeping everyone else's history intact.

## Notes on running in a Worker

Two Cloudflare constraints shaped the database layer:

- **A socket may not outlive its request.** Workers throw *"Cannot perform I/O
  on behalf of a different request"* if a later request touches a connection
  opened by an earlier one, which showed up as intermittent 500s. Each request
  now gets its own connection via `AsyncLocalStorage`, closed on the way out
  with `waitUntil`. Under Node the old shared pool is still used.
- **There is no `process.env`.** Secrets arrive on the request, so
  `hooks.server.js` hands the connection string to the pool per request.

Connections are opened with `fetch_types: false` to save a round trip, and
`prepare: false` because Supabase's transaction pooler can't reuse prepared
statements.

## Development

```sh
npm run dev          # dev server with hot reload
npm test             # rating engine checks — pure maths, no database
npm run test:db      # database checks (see below)
npm run seed         # fill an empty database with a demo pool night
npm run db:studio    # browse the data in Drizzle Studio
```

`npm run test:db` **deletes every row**, so it refuses to use `DATABASE_URL` and
insists on a separate `TEST_DATABASE_URL`:

```sh
docker run -d --name pottr-pg -p 5433:5432 -e POSTGRES_PASSWORD=pottr postgres:16
TEST_DATABASE_URL=postgres://postgres:pottr@localhost:5433/postgres npm run test:db
```

### Changing the schema

Edit `src/lib/server/schema.js`, then:

```sh
npm run db:generate  # writes a new migration into drizzle/
npm run db:migrate   # applies it
```

| Path                      | What's in it                                    |
| ------------------------- | ----------------------------------------------- |
| `src/lib/elo.js`          | The rating maths. Shared by server and browser.  |
| `src/lib/server/schema.js`| Drizzle table definitions.                       |
| `src/lib/server/db.js`    | Queries, transactions, and the history replay.   |
| `src/hooks.server.js`     | Per-request database wiring for Cloudflare.      |
| `src/routes/app.css`      | Colour tokens for both light and dark.           |
| `drizzle/`                | Generated SQL migrations.                        |
| `wrangler.jsonc`          | Worker name, flags and static-asset binding.     |
