---
title: Database and storage
description: Embedded or external PostgreSQL, where the data directory is, and the secrets that go with each mode.
group: Configuration
order: 3
---

DataGripe keeps its own state — accounts, projects, documents, domains,
history — in PostgreSQL. That is separate from the datasources you
connect to, which it never writes into unless you ask it to.

One variable decides the shape.

| | Default | |
| --- | --- | --- |
| `APP_DATABASE_URL` | — | A PostgreSQL for DataGripe's own state. Setting it selects **external** mode: accounts on, and the app applies pending migrations at startup. |
| `DATABASE_MODE` | derived | `embedded` or `external`, forced. Without it, external when `APP_DATABASE_URL` is set and embedded otherwise. Set it to run embedded while a stray `APP_DATABASE_URL` is still in the environment. |

## Embedded mode

No database to install: the server starts and manages a PostgreSQL
cluster of its own, migrates it at startup, and generates the secrets
once beside the data directory. There is nothing to configure at all.

| | Default | |
| --- | --- | --- |
| `EMBEDDED_PG_DATA_DIR` | `./data/pg` | Where the cluster lives. |
| `EMBEDDED_PG_PORT` | `0` | The port it listens on. `0` picks a free one at startup, which is what you want unless something else has to reach it. |
| `DATAGRIPE_DATA_DIR` | per-OS | Read by the packaged launcher and the container image, not from a checkout: it puts the cluster, the git checkouts and the generated secrets under one path. `~/.local/share/datagripe` by default, `/data` in the image. |

## External mode

A PostgreSQL you run. Both secrets are required, because there is no
data directory the server owns to generate them into.

| | Default | |
| --- | --- | --- |
| `CONNECTION_ENCRYPTION_KEY` | — | Encrypts datasource passwords at rest. Losing it orphans every stored password — see [Configuration](/docs/configuration/). |
| `SESSION_SECRET` | — | Signs session cookies. Regenerating it signs everyone out and does nothing worse. |
| `MIGRATIONS_DIR` | the checkout's | Directory of migration `.sql` files. A packaged build ships them beside the bundled server and points here; from a checkout you should not need to set it. |

The app checks `schema_migrations` on every startup, in embedded and
external database modes, and applies missing files before accepting HTTP
or WebSocket connections. Each migration and its history row commit
together. A PostgreSQL advisory lock serializes concurrent app starts and
manual runners; a failed migration rolls back and stops startup. The app
database account must have permission to apply the schema changes. See
[upgrading](/docs/upgrading/).
