# Contributing

Thanks for helping. Work League is meant to be easy to host and easy to extend.

## Setup

```sh
cp .env.example .env
npm install
npm run db:migrate
npm run seed
npm run dev
```

The default `.env` uses an embedded database in `./.data`, so you don't need a database server.

## Before opening a pull request

```sh
npm run check    # types
npm run lint     # formatting and lint (npm run format fixes formatting)
npm test         # unit and database tests
```

- New games: follow [docs/writing-a-module.md](docs/writing-a-module.md). Keep game rules pure and
  tested.
- Schema changes: edit the schema, run `npm run db:generate`, and commit the migration. Never edit
  a migration that has been released.
- UI changes: check a phone width (360px) and dark mode, and include screenshots in the PR.
- Keep the footer credit and its link.

## Code style

Strict TypeScript, no `any`. Validate everything that comes from a form or the network with
Valibot. Throw `UserError` for problems the user can fix, since its message is shown to them.
Comments explain why, not what.
