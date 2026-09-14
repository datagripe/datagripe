---
title: Upgrading
description: Migrations first, in every shape, and the two things that make an upgrade unrecoverable rather than annoying.
group: Deploy
order: 7
---

An upgrade is: new image, migrations applied, server started. What
differs between shapes is only who runs the migration.

While the version is `0.0.x`, nothing in the application is promised to
stay put. Read the [release notes](/docs/release-notes/) before upgrading
a deployment other people use.

## Back up first

Two things make an upgrade unrecoverable rather than annoying, and both
are cheap to avoid.

**The database.** The durable state is the application PostgreSQL:
accounts, sessions, workspaces, datasource metadata and encrypted
secrets, documents, layouts, query history.

```bash
pg_dump --format=custom --file=datagripe-$(date +%Y%m%d-%H%M).dump "$APP_DATABASE_URL"
```

**`CONNECTION_ENCRYPTION_KEY`.** The datasource passwords in that dump
are encrypted with it. A backup without the key restores everything
except the ability to open any datasource. Store the key with the same
care as the backup and **not in the same place**.

## Embedded shapes

The personal CLI, the desktop app and the zero-config container migrate
themselves on start. Upgrading is replacing the binary or pulling the
image.

```bash
bunx @datagripe/cli@latest personal
docker pull ghcr.io/datagripe/datagripe && docker restart datagripe
```

The data directory is untouched. It is the thing worth backing up.

## Shared shapes

A shared deployment does **not** migrate itself. That is deliberate: a
server that migrates on start is a server that migrates twice when two
replicas start, and the second one loses. The image has a second entry
point instead.

```bash
docker run --rm \
  -e APP_DATABASE_URL=… -e CONNECTION_ENCRYPTION_KEY=… -e SESSION_SECRET=… \
  ghcr.io/datagripe/datagripe migrate
```

| Shape | Runs the migration as |
| --- | --- |
| [Compose](/docs/compose/) | a one-shot service, before the app |
| [Helm](/docs/kubernetes/) | a `pre-install,pre-upgrade` hook Job |
| [Plain manifests](/docs/kubernetes/) | an init container |
| By hand | `bunx @datagripe/cli migrate` |

So in practice: `docker compose pull && docker compose up -d`, or
`helm upgrade datagripe oci://ghcr.io/datagripe/charts/datagripe`, and
the migration is already in the path.

Migrations are idempotent. Running one twice is a no-op, which is what
makes the init-container race untidy rather than harmful.

## Pin the version

The chart's version is the app's version, and the image's tag should be
too. `latest` is fine for trying it and wrong for a service other people
depend on — an upgrade should be a thing you did, not a thing that
happened.

```bash
helm upgrade datagripe oci://ghcr.io/datagripe/charts/datagripe --version <!--dg:version-->
```

## Restoring

```bash
createdb datagripe_restore
pg_restore --dbname=datagripe_restore datagripe-YYYYMMDD-HHMM.dump
APP_DATABASE_URL=postgres://…/datagripe_restore bun run db:migrate
```

Run the migration after every restore: it is idempotent, and it brings an
older dump up to the current schema before the server starts.

Sessions survive a restore. They only become invalid if you also rotate
`SESSION_SECRET`, and the two can coexist safely.

Worth doing quarterly into a scratch database rather than discovering the
procedure during an incident. Compare
`select count(*) from users` and `select count(*) from connections`
between the two databases.

## Rotating the encryption key

Add the new key as version 2 in the keyring, restart, and re-save
connections opportunistically. Old key versions keep decrypting, so there
is no flag day and no window where a datasource cannot be opened.

## Related

- [Release notes](/docs/release-notes/) — what changed.
- [Configuration](/docs/configuration/) — every variable.
- [`docs/operations.md`](https://github.com/datagripe/datagripe/blob/main/docs/operations.md) —
  backups, the audit log, and the full production checklist.
