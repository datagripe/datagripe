---
title: Compose
description: The app, a PostgreSQL beside it, accounts on — four commands and one file to edit.
group: Deploy
order: 4
---

Compose is the shape for a team on one machine: DataGripe, a PostgreSQL
it owns, accounts switched on, and a migration that runs before the app
starts.

```bash
curl -O https://raw.githubusercontent.com/datagripe/datagripe/main/deploy/compose.yaml
curl -o .env https://raw.githubusercontent.com/datagripe/datagripe/main/deploy/.env.example
$EDITOR .env
docker compose up -d
```

DataGripe on <http://localhost:3000>. The first person to open it creates
the first account; after that signup is closed unless `ALLOW_SIGNUP` says
otherwise.

The compose file is written to work on its own, downloaded next to a
`.env` and nothing else. There is no `build:` in it.

> Not to be confused with the `compose.yaml` at the repository root,
> which starts a PostgreSQL for the test suite and nothing else.

## The three secrets

`.env.example` generates all three with the right shape. If you would
rather write them yourself, the shapes matter:

| | |
| --- | --- |
| `POSTGRES_PASSWORD` | **Hex, not base64.** It is interpolated into a connection URL, so a `/` or a `+` ends the password early and the app cannot connect. `openssl rand -hex 32`. |
| `CONNECTION_ENCRYPTION_KEY` | Encrypts datasource passwords at rest. Not recoverable — losing it orphans every stored password. At least 32 characters. |
| `SESSION_SECRET` | Signs session cookies. Regenerating it only signs everyone out. |

That first row is a real failure and not a theoretical one. It looks
exactly like a wrong password, which is the wrong place to go looking.

## Ports and origins

`WEB_ORIGIN` must be the exact origin browsers use, and the published
port has to agree with it. They are set in the same file for that reason;
change them together.

```bash
WEB_ORIGIN=http://localhost:3000        # matches the published port
```

Behind a proxy that terminates TLS:

```bash
WEB_ORIGIN=https://datagripe.example.com
NODE_ENV=production
```

`NODE_ENV=production` adds `Secure` to the session cookie. Set it only
once `WEB_ORIGIN` is `https://` — on plain HTTP it does not harden the
deployment, it breaks sign-in, because the browser will not send the
cookie back.

## The migration service

The stack runs the image's `migrate` entry point as a one-shot service
before the app, so an upgrade applies its migrations automatically on
`docker compose up -d`. The app also checks and applies pending migrations
at startup before serving requests — see [upgrading](/docs/upgrading/).

## The database is not published

Deliberately. DataGripe is the only thing that needs it and reaches it on
the compose network. If you want to point `psql` at it, do that through
`docker compose exec` rather than opening a port.

## Backups

The durable state is the PostgreSQL volume: accounts, sessions,
workspaces, datasource metadata and encrypted secrets, documents,
layouts, query history. Target databases are never backed up by
DataGripe.

```bash
docker compose exec -T postgres \
  pg_dump --format=custom -U datagripe datagripe > datagripe-$(date +%Y%m%d).dump
```

Store `CONNECTION_ENCRYPTION_KEY` with the same care as the dump, and
**not in the same place**. A backup without the key restores everything
except access to any datasource.

## Related

- [Docker](/docs/docker/) — one container, no compose.
- [Kubernetes](/docs/kubernetes/) — Helm and plain manifests.
- [Upgrading](/docs/upgrading/) — what to run, in what order.
- [Configuration](/docs/configuration/) — every variable, a page per decision.
