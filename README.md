# Work League

A self-hosted league for friendly competition at work. Play **pool**, **ping pong** and **darts**
(or add your own game), keep a proper ELO ranking per game, and crown an **office champion**
across all of them.

Made by [TheTrueFerret](https://github.com/TheTrueFerret). Open source under the MIT licence:
clone it, host it for your office, make it yours.

<p>
  <img src="docs/screenshots/home.png" width="200" alt="The league home screen with pool, ping pong and darts">
  <img src="docs/screenshots/darts-scorer.png" width="200" alt="The darts scorer suggesting a checkout">
  <img src="docs/screenshots/pingpong-scorer.png" width="200" alt="The ping pong point-by-point scorer">
  <img src="docs/screenshots/rebranded.png" width="200" alt="The same league rebranded in blue">
</p>

## What you get

- **Game modules.** Each game is one folder with its own rules and its own match screen. Pool
  records teams of any size, ping pong has a point-by-point scorer, and darts has a full X01
  calculator with checkout hints. Admins switch games on and off without redeploying.
- **ELO for every game.** One shared engine handles singles, teams and free-for-alls. Upsets pay,
  newcomers find their level fast, veterans settle down, and you see what you stand to win or lose
  before you play. Deleting an old result replays everything after it.
- **Office championship.** Everyone is on the table from day one. Your score is your average
  rating across every game, with games you haven't played counted at the starting rating.
- **Your brand.** Upload a logo and pick one colour (or take it from the logo), and the whole UI
  builds its light and dark palette from it, the way Android's Material You does.
- **Simple access.** One office passphrase keeps outsiders out, and a separate admin password
  protects settings and deletions. Optionally, anyone can view the rankings read-only.
- **Phone first.** Installable as an app, works with the screen on the table, keeps a live game
  safe on the device if the connection drops.
- **Hosts anywhere.** Cloudflare Workers with any PostgreSQL, a single Docker container with an
  embedded database, or Docker Compose with PostgreSQL.

## Quick start (local)

Needs Node 22.18 or newer. No database server required: development uses an embedded
PostgreSQL ([PGlite](https://pglite.dev)) stored in `./.data`.

```sh
cp .env.example .env      # set ADMIN_PASSWORD
npm install
npm run db:migrate
npm run seed              # optional: demo players and matches for every game
npm run dev
```

Open http://localhost:5173, sign in at `/admin` with your `ADMIN_PASSWORD`, then set your name,
logo, colour and office passphrase.

## Hosting

See [docs/self-hosting.md](docs/self-hosting.md) for the full guide. Summary:

| Where                 | Database                                  | How                                                                                                       |
| --------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Docker, one container | Embedded, in a volume                     | `docker run -p 3000:3000 -v league:/data -e ADMIN_PASSWORD=… -e ORIGIN=http://localhost:3000 work-league` |
| Docker Compose        | PostgreSQL 17 container                   | `ADMIN_PASSWORD=… docker compose up -d`                                                                   |
| Cloudflare Workers    | Any hosted PostgreSQL (Supabase, Neon, …) | `wrangler secret put DATABASE_URL`, `… ADMIN_PASSWORD`, `npm run deploy`                                  |
| Any Node host         | Embedded or PostgreSQL                    | `npm run build:node && npm run db:migrate && npm start`                                                   |

### Configuration

Only a few things come from the environment. Everything else is set in the app at `/admin`.

| Variable         | Required  | Purpose                                                                                 |
| ---------------- | --------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | yes       | `postgres://…` for PostgreSQL, or `pglite:./path` for the embedded database (Node only) |
| `ADMIN_PASSWORD` | for admin | Unlocks `/admin`. Without it, admin features stay off                                   |
| `SESSION_SECRET` | no        | Signs cookies. If unset, a random one is generated and stored in the database           |
| `ORIGIN`         | Node only | The public URL, e.g. `https://league.example.com`, so form submissions are accepted     |

### Upgrading from the pool ladder (Open Pottr)

Back up first (`pg_dump`), then run `npm run db:migrate`. Migration `0001_game_modules` moves
every existing match and rating into the new tables as pool matches. Nothing is recalculated, and a
test proves a full replay gives the same ratings.

## How ratings work

Every player starts at 1000 in each game. After a match, each player is compared with every
opposing side's average rating:

```text
expected = 1 / (1 + 10 ^ ((opponentAverage - rating) / 400))
change   = K × Σ(result - expected) / (sides - 1)
```

`result` is 1 for finishing ahead of that side, 0.5 for a tie, and 0 for finishing behind. `K` is 40 for
a player's first 10 games, 28 up to 30 games, and 20 after that. With two sides this is classic team
ELO; in a darts free-for-all a match still moves a player by at most one K.

## Adding a game

A game is a folder in `src/lib/modules/<id>/` that exports a `GameModule`: its rules, rating
settings and a screen for recording a match. Register it in `src/lib/modules/registry.ts`, and it
gets rankings, history, profiles, championship points and theming automatically. See
[docs/writing-a-module.md](docs/writing-a-module.md).

## Development

```sh
npm run dev          # local development
npm run check        # TypeScript and Svelte diagnostics
npm run lint         # Prettier and ESLint
npm test             # unit and database tests (in-memory PGlite)
npm run test:e2e     # browser smoke tests (Playwright)
npm run build        # Cloudflare build; build:node for Node and Docker
npm run db:generate  # write a migration after changing a schema file
npm run db:migrate   # apply migrations
npm run seed         # demo data in an empty database
```

Stack: SvelteKit 2, Svelte 5, strict TypeScript, Drizzle ORM, PostgreSQL or PGlite, Valibot, and
Material Color Utilities.

```text
src/lib/
├── core/            pure logic: ELO engine, standings, championship, formatting
├── modules/         game modules (pool, pingpong, darts) and the registry
├── components/      shared UI: side picker, icons, rating curve
├── live/            live-match state shared by the scorers
├── theme/           palette generation and logo processing
└── server/          database, repositories, auth, settings
src/routes/
├── [game=game]/     rankings, play and history for every game
├── players/         people and profiles
├── championship/    the office table
├── admin/           branding, games, access
└── unlock/          the office passphrase screen
```

## Credit

Work League is made by [TheTrueFerret](https://github.com/TheTrueFerret). The footer credit and
its link are part of the app, not a setting. The MIT licence lets you change anything, but if you
run a copy, please keep the credit. It's how other offices find the project.

## Licence

[MIT](LICENSE)
