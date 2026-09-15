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
| Kubernetes or Helm | Roll the Deployment. With `imagePullPolicy: Always`, **restarting is the whole upgrade** — and the account menu offers an owner a button that does exactly that. |
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

### Restarting into a pulled image

With `imagePullPolicy: Always` on a tag that moved, a pod that restarts
comes back on the new image — the pull is the start-up, so ending the
process is the entire upgrade. That is why the account menu offers a
workspace owner a **restart to apply** button in Kubernetes and nowhere
else: it is the one shape where something is guaranteed to start
DataGripe again.

It is off elsewhere because a container run without a restart policy
that exits is a DataGripe nobody is running. A compose stack or a
systemd unit that does restart can turn it on with
`RESTART_TO_UPDATE=true` — see [updates](/docs/updates/).

A restart does not run a migration. In the shared shapes that is a
separate step and stays one; restart to pick up an image whose
migrations have already been applied.

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
