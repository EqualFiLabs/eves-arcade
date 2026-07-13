# Rug Pull Rumble Arcade

Rug Pull Rumble is the first game in a Phaser 4 arcade platform. The workspace
contains a DOM arcade shell, a deterministic TypeScript combat simulation, game
content, shared controls/protocol packages, and a replay-verifying API.

## Local development

Install dependencies with `pnpm install`, then start ranked development with:

```sh
pnpm dev:ranked
```

The web app runs at `http://localhost:5173`. Vite forwards its same-origin
`/api/*` requests to the API at `http://127.0.0.1:3000` and removes the `/api`
prefix. A production deployment must provide the same routing contract.

`pnpm dev` starts only the web app. If the API cannot be reached, session
acquisition deliberately falls back to a fully playable unranked session.
Server validation rejections do not fall back silently: the shell displays the
configuration or request error.

## Validation

```sh
pnpm typecheck
pnpm lint
pnpm test:sim
pnpm build
pnpm test:e2e
```

The Playwright configuration starts both services and exercises ranked and
offline/unranked browser flows.
