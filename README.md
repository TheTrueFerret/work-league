# Work League

A modular, self-hosted home for friendly competition at work. Work League owns the app shell and module discovery; each game owns its rules, screens, navigation, and data access.

The first installed module is **Pool ladder**, migrated from the original Open Pottr app. It supports any team size, live ELO previews, automatic team balancing, player profiles, match history, and rating replay after a deletion.

## Stack

- SvelteKit 5 and TypeScript
- Drizzle ORM and PostgreSQL
- Cloudflare Workers
- Installable PWA with light and dark themes

## Setup

```sh
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Put a PostgreSQL connection string in `DATABASE_URL`. For Cloudflare, store it as a secret:

```sh
npx wrangler secret put DATABASE_URL
npm run deploy
```

## Module architecture

```text
src/lib/modules/
├── types.ts                 shared module contract
├── index.ts                 installed-module registry
└── pool/
    ├── index.ts             descriptor and navigation
    ├── rating.ts            pool rating rules
    └── server/repository.ts pool persistence

src/routes/
├── +page.svelte             module launcher
├── pool/                    pool module screens
└── players/                 shared people screens
```

The shell reads `leagueModules` from `src/lib/modules/index.ts`. To add darts, table football, or another game:

1. Create a folder under `src/lib/modules/<id>`.
2. Export a descriptor satisfying `LeagueModule`.
3. Put the module's rules and server repository inside that folder.
4. Add its screens under `src/routes/<id>`.
5. Register its descriptor in the module registry.

Keeping the descriptor typed means the launcher and navigation update without adding module-specific conditions to the shell.

## Commands

```sh
npm run dev        # local development
npm run check      # TypeScript and Svelte diagnostics
npm test           # pool rating engine tests
npm run build      # production Cloudflare build
npm run seed       # demo pool data
npm run db:studio  # inspect the database
```

`npm run test:db` clears every row, so it only accepts `TEST_DATABASE_URL`; never point it at production.

## Rating model

Pool players start at 1000. Each player is rated against the opposing team's average:

```text
expected = 1 / (1 + 10 ^ ((opponentAverage - rating) / 400))
change   = K × (result - expected)
```

`K` is 40 for the first 10 games, 28 through 30 games, and 20 thereafter. Deleting an older result replays the complete match history so current standings remain deterministic.

Work League currently has no authentication. Protect public deployments with Cloudflare Access or another access layer.
