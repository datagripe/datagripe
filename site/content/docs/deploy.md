---
title: Deploying
description: Four shapes, all running the same image — and the two settings that decide whether any of them works.
group: Deploy
order: 2
---

Four shapes, smallest first. All of them run the same server, take the
same [configuration](/docs/configuration/), and are built from the same
release.

| | State lives in | Accounts | |
| --- | --- | --- | --- |
| `bunx @datagripe/cli personal` | an embedded cluster under the data dir | off | [Getting started](/docs/getting-started/) |
| `docker run … -v datagripe:/data` | the same, on a volume | off | [Docker](/docs/docker/) |
| compose | a PostgreSQL container beside it | on | [Compose](/docs/compose/) |
| Kubernetes, Helm | a StatefulSet or a managed database | on | [Kubernetes](/docs/kubernetes/) |

Picking one is mostly a question of who else uses it. One person: the
CLI or the desktop app. A team on one machine: compose. A team on a
cluster: Helm.

## Read this first

Two settings decide whether a deployment works, and neither has a default
that can be right everywhere. Everything else has a sensible default and
these two cannot.

**`WEB_ORIGIN` must be exactly the URL browsers use** — scheme, host, and
port if it is not the default. Both the HTTP routes and the WebSocket
upgrade compare against it, and everything in the app runs over that
socket. A mismatch is not a degradation, it is an app that loads and then
does nothing. It is the first thing to check, every time.

**`CONNECTION_ENCRYPTION_KEY` is not recoverable.** Datasource passwords
in the application database are encrypted with it. A database backup
without the key is a backup of connections nobody can open. Store it
somewhere other than beside the backup.

There is a third, narrower one worth knowing before it costs you an
afternoon: `NODE_ENV=production` adds `Secure` to the session cookie,
which is correct behind TLS and **wrong in front of plain HTTP**, where
the browser will not send the cookie back and sign-in will not stick.

## The quickest real one

```bash
docker run -p 3001:3001 -v datagripe:/data ghcr.io/datagripe/datagripe
```

Its own PostgreSQL under `/data`, no accounts, nothing to configure. The
volume is not optional — without it a restart loses the database and the
generated key its stored passwords are encrypted with.
[More](/docs/docker/).

## Turning accounts on

Accounts come on when DataGripe stops running its own database. Setting
`APP_DATABASE_URL` selects external mode, which turns accounts on and
stops the server migrating itself; the first person to open it creates
the first account, and after that signup is closed until you say
otherwise.

That is what [compose](/docs/compose/) and [Kubernetes](/docs/kubernetes/)
both are, with the database supplied differently.

## Migrations

The app applies pending migrations at startup in every deployment, before
serving requests. The image also has a migration-only entry point for
operators who want to apply changes before rollout:

```bash
docker run --rm -e APP_DATABASE_URL=… -e CONNECTION_ENCRYPTION_KEY=… \
  -e SESSION_SECRET=… ghcr.io/datagripe/datagripe migrate
```

Compose runs it as a one-shot service, Helm as a pre-install hook, the
plain manifests as an init container. See [upgrading](/docs/upgrading/).

## Related

- [Configuration](/docs/configuration/) — every environment variable, a page per decision.
- [Security](/docs/security/) — what to switch off before it faces
  anybody.
- [Upgrading](/docs/upgrading/) — backups, migrations, key rotation.
- [`docs/operations.md`](https://github.com/datagripe/datagripe/blob/main/docs/operations.md) —
  backups, the audit log, and the full production checklist.
