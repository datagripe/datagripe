# Testing

`bun test` runs everything, from the repository root, in about forty
seconds. What that hides is worth knowing before you trust a green run.

## The one that catches people

**Database-backed server tests skip silently without a local
PostgreSQL.** Each of them probes
`postgres://datagripe:datagripe@localhost:5432/postgres`, creates a
scratch database of its own (`datagripe_<area>_test`), migrates it, and
degrades to `test.skip` when the probe fails:

```ts
const reachable = await probe();
const pgTest = reachable ? test : test.skip;
```

A run with no database is still green — it just says `31 skip` instead
of `0 skip`. **Read the skip count**, especially after writing a service
test, because "my new test passed" and "my new test did not run" look
identical otherwise.

```bash
docker compose up -d postgres     # or any local PostgreSQL 17
bun test
```

Files that need it: everything under `apps/server/src/{auth,http,
workspaces,documents,connections,files,gripes,execution}`.

## Where a test goes

| Kind | Where | Example |
| --- | --- | --- |
| Pure logic | `.test.ts` beside the module | `gridStats.test.ts`, `documents.test.ts` (contracts) |
| A service against the real schema | beside the service, DB-backed | `workspaces/service.test.ts` |
| A client store | `apps/web/src/stores/*.test.ts` | `documents.test.ts` |
| Something git does | `apps/server/src/git/*.test.ts`, against real repositories in `mkdtemp` | `repo.test.ts` |

**There are no React component tests, and no testing-library.** The
convention instead is to keep the logic out of the component: a
rectangle of cells is `gridSelection.ts`, what it adds up to is
`gridStats.ts`, and `SelectionBar.tsx` is the thirty lines that render
them. If something in a component feels worth testing, that is the
signal to move it out, not to add a renderer.

Web store tests run against `fake-indexeddb`, preloaded for every test
file by `bunfig.toml` (`[test].preload`) because Dexie captures the
`indexedDB` global at module evaluation time. Clear the tables in
`beforeEach`; the fake is shared across a file.

Git tests skip when `git` is absent the same way the database ones do
(`gitAvailable()`), and build their fixtures — including a bare remote
and two clones, for anything about fetching — rather than mocking git.

## What CI runs

```bash
bun run typecheck
bun run lint
bun run check:brand
bun test
bun run build:site          # the only thing that catches a broken site link
bun run --cwd apps/web build
```

CI also runs `bun install --frozen-lockfile`, so a `package.json`
version changed without `bun install` fails the install rather than the
tests.

## Running the app instead

A test is not a screenshot. For anything whose answer is "does this
actually work in the interface", `bun run dev` (embedded PostgreSQL,
direct-in, no login) is the fastest loop; an external database with
accounts is `.env` plus `bun run db:migrate` — see the README.

Direct-in mode has exactly one workspace, resolved at boot, so anything
about switching, deleting or sharing projects has to be tried with
accounts enabled.
