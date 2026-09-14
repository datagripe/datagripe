# DataGripe

A web-based database IDE inspired by DataGrip. Bun + React 19 + TypeScript.

[datagripe.com](https://datagripe.com) ·
[downloads](https://github.com/datagripe/datagripe/releases/latest) ·
[changelog](CHANGELOG.md)

## Quickstart

No install at all:

```bash
bunx @datagripe/cli personal     # or: npx @datagripe/cli personal
```

DataGripe on <http://localhost:3001>, with its own PostgreSQL under
`~/.local/share/datagripe`, no accounts to create, and loopback only.
`personal` pins that shape rather than defaulting to it — without the
word, an `APP_DATABASE_URL` already in your shell is taken as an
instruction to run a shared deployment instead.

From a checkout — same thing, with the web app on Vite:

```bash
bun install
bun run dev                     # web on :5173, api on :3001
```

The server starts its own embedded PostgreSQL cluster (data in
`./data/pg`), migrates it automatically, and runs direct-in without
login. Open http://localhost:5173 and you're in.

Shared/external PostgreSQL (e.g. the compose setup):

```bash
bun install
docker compose up -d postgres   # or any local Postgres; see .env.example
cp .env.example .env            # sets APP_DATABASE_URL + the two secrets
bun run db:migrate
bun run dev                     # web on :5173, api on :3001, login enabled
```

Setting `APP_DATABASE_URL` selects external mode: account auth is on and
`CONNECTION_ENCRYPTION_KEY`/`SESSION_SECRET` are required. See
[.env.example](.env.example) for every knob (`DATABASE_MODE`,
`AUTH_DISABLED`, `EMBEDDED_PG_*`, `WEB_STATIC_DIR`).

Requires Bun 1.4 (`packageManager` is pinned). External mode expects
PostgreSQL 17.

## Deploying it

```bash
docker run -p 3001:3001 -v datagripe:/data \
  ghcr.io/datagripe/datagripe
```

The same zero-config DataGripe in a container. For a shared deployment —
a real PostgreSQL, accounts, a hostname — [deploy/](deploy) has a
compose stack, plain Kubernetes manifests, and a Helm chart, all running
that image.

The one setting no default can guess is `WEB_ORIGIN`: the exact origin
browsers use. DataGripe compares it against the `Origin` header on every
WebSocket upgrade, and everything in the app runs over that socket.

The image and the npm package are both built from `bun run build:dist`,
which stages the bundled server, its migrations and the built web app
into `dist/` — see [scripts/packaging/build.ts](scripts/packaging/build.ts).

## Desktop app

An Electrobun shell lives in [apps/desktop](apps/desktop): it spawns the
server in embedded, direct-in mode (data under the OS app-data dir) and
loads it in a frameless window — the web app's header is the drag region.

```bash
bun run --cwd apps/web build    # the dev shell serves apps/web/dist
cd apps/desktop
hutch electrobun dev            # dev build, runs the server from the checkout
bun run build                   # packaged build under build/
```

A dev build runs the server straight out of the checkout. A packaged one
has no checkout to run, so `bun run build` first stages the backend —
the bundled server, its migrations, the built web app and the PostgreSQL
binaries — into `apps/desktop/staged/`, which Electrobun copies into the
app. Running `electrobun build` on its own skips that step and produces
an app that cannot start.

The web app is also an installable PWA (`bun run --cwd apps/web build` +
any static host, or `WEB_STATIC_DIR` on the server): frameless via
`window-controls-overlay`, with an update-available refresh button in the
status bar.

Pushing a `v*` tag publishes everything: `@datagripe/cli` to npm, the
container image and the Helm chart to GHCR, and the web bundle and
desktop builds to a GitHub release. See
[docs/releasing.md](docs/releasing.md) for the steps and the one-time
registry setup.

## Documentation

- [brand/](brand) — the shipped brand assets (app icon, mascot), copied
  into `apps/` and `site/` by `bun run sync:brand`
- [site/](site) — datagripe.com: the landing page and the user
  documentation, rendered from markdown and deployed to GitHub Pages.
  User-facing; `docs/` below is for people building DataGripe
- [deploy/](deploy) — compose, Kubernetes manifests, Helm chart
- [roadmap.md](roadmap.md) — phases, progress, scheduling
- [docs/initial_idea.md](docs/initial_idea.md) — original engineering handoff
- [docs/adr/](docs/adr/) — architecture decision records
- [docs/moving-a-datasource.md](docs/moving-a-datasource.md) — export a
  datasource to git and import it elsewhere, without a password in the repo
- [docs/operations.md](docs/operations.md) — backups, the audit log, the
  production checklist
- [docs/releasing.md](docs/releasing.md) — how a tag becomes a release
- [docs/spec/](docs/spec/) — feature/subsystem specifications
- [docs/rfc/](docs/rfc/) — proposals under discussion

Documentation is updated in the same change as the behavior it describes;
see [docs/README.md](docs/README.md) for conventions.
