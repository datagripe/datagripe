---
title: Upgrading
description: Migrations first, in every shape, and the two things that make an upgrade unrecoverable rather than annoying.
group: Deploy
order: 7
---

An upgrade is: new image, migrations applied, server ready. The app
checks and applies pending migrations on every startup, before serving
requests, whether its PostgreSQL is embedded or external.

While the version is `0.0.x`, nothing in the application is promised to
stay put. Read the [release notes](/docs/release-notes/) before upgrading
a deployment other people use.

## The short version, per shape

The account menu — the avatar in the top right — shows the version you
are running and checks for a newer one when you press the button. What
it tells you to do about it is one of these.

| You run | Upgrading is |
| --- | --- |
| The desktop app | **Nothing.** It updates itself: it offers the new version and installs it when you accept. |
| `bunx @datagripe/cli personal` | `bunx @datagripe/cli@latest personal`. The data directory is untouched. |
| One container | `docker pull … && docker restart datagripe`. It migrates itself on start. |
| Compose | `docker compose pull && docker compose up -d`. The migration service runs first. |
| Kubernetes or Helm | Upgrade the image or chart, then restart. The app checks migrations before serving; existing hooks and init containers may still pre-apply them. Image tags and pull policy determine which version starts. |
| A checkout | `git pull && bun install && bun run db:migrate`. |

The rest of this page is what those commands are doing, and the two
things worth doing before any of them.

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

The **desktop app** is the one shape that needs nothing from you: it
checks its own release feed, offers the new version, and replaces itself
when you accept. Declining asks again next time it starts.

```bash
bunx @datagripe/cli@latest personal
docker pull ghcr.io/datagripe/datagripe && docker restart datagripe
```

The data directory is untouched. It is the thing worth backing up.

## Shared shapes

The app checks `schema_migrations` on every startup, in embedded and
external database modes, and applies missing files before accepting HTTP
or WebSocket connections. Each migration and its history row commit
together. A PostgreSQL advisory lock serializes concurrent app starts and
manual runners; a failed migration rolls back and stops startup. The app
database account must have permission to apply the schema changes.

The image also has a migration-only entry point for an explicit pre-rollout step:

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

Already-recorded migrations are skipped. Concurrent runners wait on the
same advisory lock and recheck history before executing each file.

### Restarting into a pulled image

With `imagePullPolicy: Always` on a tag that moved, an app-container
restart may pull the new image. Completed init containers do not rerun,
but the app itself checks migration history before serving. The
**restart server** button therefore includes the schema check in both
database modes. A pinned image still needs its tag updated to get a
new release.

The button requires a supervisor that will restart the process. Kubernetes
enables it by default; other supervised shapes can set
`RESTART_TO_UPDATE=true` — see [updates](/docs/updates/).

## MCP missing after a 0.0.13 upgrade

Version 0.0.13 silently hid the MCP sidebar header when its status request
failed. One cause is a shared app database missing migration 0027: the
status query attempted to read the new functionality columns. Apply the
pending migrations using the upgraded image or CLI, then reload the app.
This does not revoke tokens or reset the project's MCP setting.

The corrected client keeps the launcher visible on status failures and
shows **status unknown** with a retry action. Its management tab reports
missing migrations explicitly. If migration 0027 is already applied,
check the server log for the failed `mcp.status` action; a missing header
alone does not prove the server is off.

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
- [Configuration](/docs/configuration/) — every variable, a page per decision.
- [Updates](/docs/updates/) — the version check and the restart button.
- [`docs/operations.md`](https://github.com/datagripe/datagripe/blob/main/docs/operations.md) —
  backups, the audit log, and the full production checklist.
