---
title: Docker
description: One container, its own database, nothing else to run — and what changes when you publish it somewhere real.
group: Deploy
order: 3
---

The smallest shared deployment is one container and one volume.

```bash
docker run -p 3001:3001 -v datagripe:/data ghcr.io/datagripe/datagripe
```

Zero-config DataGripe: it starts its own PostgreSQL under `/data`,
migrates it, generates its own secrets, and runs with no accounts. Open
<http://localhost:3001>.

## The volume is not optional

Without `-v`, a restart loses two things: the database, and the generated
key the datasource passwords in it were encrypted with. The second is the
one that hurts, because it is not recoverable — see
[configuration](/docs/configuration/).

Anything under `/data` is state. Back it up as a unit, or run an external
PostgreSQL and back that up instead.

## Any other port means saying so

`WEB_ORIGIN` is the exact origin browsers use, and both the HTTP routes
and the WebSocket upgrade compare against it. Publishing on a different
port without setting it is the single most common broken deployment: the
page loads, and then nothing in it works, because the socket everything
runs over was refused.

```bash
docker run -p 8080:3001 -e WEB_ORIGIN=http://localhost:8080 \
  -v datagripe:/data ghcr.io/datagripe/datagripe
```

The same applies behind a proxy or a hostname:

```bash
docker run -p 3001:3001 -e WEB_ORIGIN=https://datagripe.example.com \
  -e NODE_ENV=production -v datagripe:/data ghcr.io/datagripe/datagripe
```

`NODE_ENV=production` adds `Secure` to the session cookie. That is
correct behind TLS and **wrong in front of plain HTTP**, where the
browser will not send the cookie back and sign-in will not stick.

## Turning accounts on

The zero-config shape has no accounts, which is right for one person and
wrong for a team. Accounts come on when you give it a database of its
own:

```bash
docker run -p 3001:3001 \
  -e APP_DATABASE_URL=postgres://user:password@db:5432/datagripe \
  -e CONNECTION_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  -e SESSION_SECRET="$(openssl rand -base64 32)" \
  -e WEB_ORIGIN=https://datagripe.example.com \
  -e NODE_ENV=production \
  ghcr.io/datagripe/datagripe
```

Setting `APP_DATABASE_URL` selects external mode, which turns accounts on
and stops the server migrating itself. The first person to open it
creates the first account; after that signup is closed unless
`ALLOW_SIGNUP=true`.

Generate those two secrets once and keep them. Regenerating
`SESSION_SECRET` only signs everyone out; regenerating
`CONNECTION_ENCRYPTION_KEY` orphans every stored datasource password.

## Migrations

A shared deployment does not migrate itself — that is the embedded
database's job — so the image has a second entry point:

```bash
docker run --rm \
  -e APP_DATABASE_URL=… -e CONNECTION_ENCRYPTION_KEY=… -e SESSION_SECRET=… \
  ghcr.io/datagripe/datagripe migrate
```

Run it before the app starts, on every upgrade. Migrations are
idempotent. [Compose](/docs/compose/) runs this as a one-shot service,
Helm as a pre-install hook, and the plain manifests as an init
container — see [upgrading](/docs/upgrading/).

## Images and tags

The image is `ghcr.io/datagripe/datagripe`. A version tag is a specific
release and is what a deployment should pin; `latest` follows the newest
one, which is fine for trying it and not for a service other people
depend on.

## Related

- [Compose](/docs/compose/) — the same thing with a PostgreSQL beside it.
- [Kubernetes](/docs/kubernetes/) — Helm and plain manifests.
- [Configuration](/docs/configuration/) — every variable, a page per decision.
- [Security](/docs/security/) — what to switch off before it faces anyone.
