# Writing a game module

A game module is one folder that tells Work League how a game is played and who won. The shell
does the rest: rankings, history, player profiles, head-to-heads, the championship, theming and
the database.

Pool (`src/lib/modules/pool`) is the smallest example. Ping pong and darts show live scorers.

## 1. Create the folder

```text
src/lib/modules/foosball/
├── index.ts        the module definition
├── rules.ts        pure game logic (keep it framework-free so it is easy to test)
├── rules.test.ts   Vitest tests
└── Record.svelte   the screen for playing or recording a match
```

## 2. Define the module

```ts
// src/lib/modules/foosball/index.ts
import * as v from 'valibot';
import { UserError } from '$lib/core/errors';
import { defaultKFactor, DEFAULT_START_RATING } from '$lib/core/rating/elo';
import { defineModule } from '../types';

export interface FoosballDetails {
	goals: [number, number];
}

export default defineModule<FoosballDetails>({
	id: 'foosball', // URL and database key. Never change it once matches exist.
	name: 'Foosball',
	description: 'First to ten goals.',
	accent: '#7e57c2', // harmonised with the league's brand colour automatically
	icon: 'M4 12h16M12 4v16', // 24×24 stroke path
	format: { sides: { min: 2, max: 2 }, playersPerSide: { min: 1, max: 2 } },
	rating: {
		start: DEFAULT_START_RATING,
		kFactor: defaultKFactor
	},
	// Validates what the browser sends. Never trust it further than this.
	details: v.object({
		goals: v.tuple([
			v.pipe(v.number(), v.integer(), v.minValue(0)),
			v.pipe(v.number(), v.integer(), v.minValue(0))
		])
	}),
	// Runs on the server before anything is saved: return each side's placement (1 = winner).
	resolve({ goals: [a, b] }) {
		if (Math.max(a, b) !== 10 || a === b) throw new UserError('First to ten wins');
		return a > b ? [1, 2] : [2, 1];
	},
	summarize: ({ goals }) => `${goals[0]}–${goals[1]}`,
	playerStats: (matches) => [
		{ label: 'Goals per match', value: '…' } // computed from matches
	],
	Record: () => import('./Record.svelte')
});
```

### The contract

| Field         | Purpose                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| `format`      | Allowed number of sides and players per side. The server enforces it.                                   |
| `rating`      | Starting rating, K schedule and tier names. The shared ELO engine does the maths.                       |
| `details`     | A Valibot schema for the data your screen submits. Stored as JSON on the match.                         |
| `resolve`     | Turns details into placements. Throw `UserError` for anything impossible. The message reaches the user. |
| `summarize`   | Optional one-liner for history rows and profiles.                                                       |
| `playerStats` | Optional extra numbers for a player's profile, computed from their stored matches.                      |
| `Record`      | Lazily loaded screen, so its code only downloads when someone opens it.                                 |

## 3. Build the screen

`Record.svelte` receives `RecordProps`: the active `players` with their rating in this game, the
`rating` config, and a `submit({ sides, details, note })` function that resolves `true` once
saved. Useful building blocks:

- `$lib/components/SidePicker.svelte`: pick players onto sides, with a live preview of each
  player's rating change. Supports teams and free-for-all.
- `$lib/live/live-match.svelte.ts`: `LiveMatch` keeps a live game (setup and event list) on the
  device with undo, and `keepAwake` stops the screen sleeping. Store the event list in `details`
  and replay it in `resolve`, so the server checks the same events the screen showed.

Use the theme's CSS variables and never hardcode colours: `--surface`, `--text`, `--muted`,
`--accent`, `--side-0` … `--side-7` with `--on-side-N`, and your game's own `--game-<id>`,
`--game-<id>-container` and `--game-<id>-on-container`.

## 4. Register it

```ts
// src/lib/modules/registry.ts
import foosball from './foosball';

export const installedModules: readonly GameModule[] = [
	pool,
	pingpong,
	darts,
	foosball as GameModule
];
```

That's it: `/foosball`, `/foosball/play` and `/foosball/history` exist, the launcher shows a
card, profiles get a tab, and the championship gets a column. Admins can switch it off in `/admin`.

## Module-specific tables

Most games fit in `details`. If yours needs its own tables, put them in
`src/lib/modules/<id>/server/schema.ts` with Drizzle's `sqlite-core`, prefix table names with the
module id, and run `npm run db:generate` to create a migration. The same migration runs on
Cloudflare D1 and on local SQLite files. D1 has no interactive transactions: group writes that
belong together in `db.batch([...])`.

## Checklist

- [ ] `rules.ts` is pure and covered by tests (`npm test`)
- [ ] `resolve` rejects every impossible or unfinished result
- [ ] The screen works at 360px wide and in dark mode
- [ ] `npm run check` and `npm run lint` pass
