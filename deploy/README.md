# Deploying DataGripe

Four ways in, smallest first. All of them run the same image, take the
same environment variables, and are built from the same
[distribution](../scripts/packaging/build.ts) as the npm package.

| | For |
| --- | --- |
| `bunx @datagripe/cli` | One person, one machine, no container runtime |
| `docker run` | One container, no database to operate |
| [compose.yaml](compose.yaml) | A small shared deployment |
| [k8s/](k8s) · [helm/](helm/datagripe) | A cluster |

## bunx / npx

```bash
bunx @datagripe/cli        # or: npx @datagripe/cli
```

DataGripe on <http://localhost:3001>, with its own PostgreSQL under
`~/.local/share/datagripe` and no accounts to create. Nothing to
configure.

## docker run

```bash
docker run -p 3001:3001 -v datagripe:/data \
  ghcr.io/rick-the-alien/datagripe
```

The same thing in a container: embedded PostgreSQL, direct-in, state on
the volume. The volume is not optional — without it a restart loses the
database and the generated key its stored passwords are encrypted with.

Publishing on any port other than 3001 means saying so, because the
WebSocket upgrade checks the browser's origin against `WEB_ORIGIN`:

```bash
docker run -p 8080:3001 -e WEB_ORIGIN=http://localhost:8080 \
  -v datagripe:/data ghcr.io/rick-the-alien/datagripe
```

## compose

```bash
cp deploy/.env.example deploy/.env    # fill in the three secrets
docker compose -f deploy/compose.yaml up -d
```

DataGripe on <http://localhost:3000>, a PostgreSQL beside it, and
accounts switched on — the first person to open it creates the first
one. The migration runs as a one-shot service before the app starts.

See [.env.example](.env.example) for the knobs, and note the two that
travel together: `DATAGRIPE_PORT` and `WEB_ORIGIN`.

## Kubernetes

[k8s/](k8s) is plain manifests you can read top to bottom;
[helm/datagripe](helm/datagripe) is the same deployment parameterised,
with a managed-database option, an embedded-database option, generated
secrets, and a migration hook. Each directory has its own README.

## The two things worth knowing up front

**`WEB_ORIGIN` must be exactly the URL browsers use.** Scheme, host, and
port if it is not the default. DataGripe compares it against the `Origin`
header on every WebSocket upgrade, and everything in the app runs over
that socket — so a mismatch is not a subtle degradation, it is an app
that loads and then does nothing. It is the first thing to check when a
deployment looks broken.

**`CONNECTION_ENCRYPTION_KEY` is not recoverable.** The datasource
passwords in the application database are encrypted with it. A database
backup without the key is a backup of unopenable connections. Store it
somewhere other than beside the backup, and see
[docs/operations.md](../docs/operations.md) for the rest of the
production checklist.

## Building the image yourself

```bash
docker build -t datagripe .          # from the repository root
bun run build:dist                   # just the distribution, into dist/
```

`bun run build:dist` stages the server bundle, its migrations, the built
web app and a launcher into `dist/` — the npm package and the image are
both that directory. `docker build` runs it inside the build stage, so a
checkout is all you need.
