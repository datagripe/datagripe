---
title: Adapters
description: Four engines, and exactly what each one can and cannot do.
group: Product
order: 5
---

DataGripe supports PostgreSQL, MySQL, SQLite and Redis. They are not
equally capable, and the interface says so rather than offering you an
action that fails at runtime.

Every adapter declares a set of capability flags. The UI and the request
dispatcher gate on those flags and never on the adapter's name, which is
the mechanism that makes the honesty structural rather than a matter of
remembering.

## What each one can do

The table below is generated from `ADAPTER_CAPABILITIES` in the
repository — the same constant the application itself gates on, so this
page cannot describe an engine the app does not.

{{adapters}}

`—` means the adapter does not have the capability at all, and the
corresponding control is absent rather than disabled with a tooltip.

## Reading the flags

**Explorer.** `sql` gives the schema → table → column tree. `keyspace`
gives Redis's database → prefix → key browser, split on the `:`
delimiter, with a truncation marker where a level exceeded its scan
bound.

**Execution.** `cursor` is a server-side cursor with batched fetches, so
a large result streams and the first rows arrive immediately. `buffered`
fetches the whole result and truncates it to `QUERY_MAX_ROWS` and
`QUERY_MAX_BYTES`. Where execution is absent, `execution.start` is
rejected server-side *and* the run buttons are disabled client-side —
both, because a client-side check is a convenience and a server-side one
is the rule.

**Cancellation.** True means cancelling interrupts the running statement
on the server, down an administrative control path that is not the one
being blocked. That is the only reason cancel works on a query that is
stuck, which is the only time it matters. SQLite has no driver-level
interrupt; local files make a runaway query cheap to bound by caps
instead.

**Table view.** `readwrite` browses rows and writes single-row edits back
in one transaction. Where it is absent, double-clicking an object opens a
tab that says so rather than rendering an empty grid.

**Column changes.** A list rather than a boolean, and SQLite is the
reason. Its `ALTER TABLE` does add, rename and drop and nothing else, so
the columns tab enables per operation and says why the rest are off. A
type, nullability or default change needs the twelve-step table rebuild,
which is on the [roadmap](/roadmap/).

**Access report.** PostgreSQL only. MySQL's grant model is different
enough — host-qualified grantees, no roles before 8.0 — to be a separate
design rather than a port, and SQLite has no grants at all.

## Per-engine notes

### PostgreSQL

The reference implementation, and the only one with everything. Cursor
streaming, `KILL`-equivalent cancellation from a second connection,
reconstructed DDL, routines and sequences in the object view, the access
report, and the `grant.*` and `routine.*` rules.

It is also the only engine where `CREATE INDEX CONCURRENTLY` exists,
which is why `index.not-concurrent` is gated on the dialect: on MySQL and
SQLite that advice is not merely unhelpful, it is a syntax error.

### MySQL

Introspection through `information_schema`, system schemas excluded.
Timeouts are enforced primarily by `SET SESSION max_execution_time`, with
a client-side watchdog as the deterministic backstop; cancellation is
`KILL QUERY` from a second connection.

One driver quirk is worth knowing because it shaped the design: Bun's
MySQL driver resolves an interrupted statement *cleanly* — `SLEEP`
returns 1, no error, empty `SHOW WARNINGS`. Outcomes are therefore
tracked out of band rather than inferred from the driver's response, or
a cancelled query would report success.

`allowPublicKeyRetrieval` is set only when TLS is disabled, which is the
`caching_sha2_password`-over-plain-TCP case on a trusted local link. TLS
modes never set it.

### SQLite

The `database` field is a **server-side file path**, not a database name,
and host, port, username and TLS are all absent from its dialog. That
means the file has to be reachable from wherever the server runs — which
is your own machine in the personal and desktop shapes, and probably not
what you want in a hosted deployment.

Schemas come from `PRAGMA database_list` (main plus attached), objects
from `sqlite_master`, columns from `PRAGMA table_info`. `readOnly` opens
the file read-only at the driver level rather than filtering statements.

### Redis

A distinct capability rather than a limited SQL engine. The browser is
read-only: `PING` to test, a `SCAN`-bounded keyspace tree at 10,000 keys
per level with a truncation marker, and value fetches for strings,
hashes, lists, sets and sorted sets with a TTL and a 100-entry cap.

There is no query execution, so the run controls are absent. Whether
Redis earns command execution later is an open question, and it would be
a new capability flag rather than pretending it speaks SQL.

## Adding one

An adapter is an implementation and one entry in `ADAPTER_CAPABILITIES`.
There is no third place to update, and nothing in the UI branches on the
adapter's name — which is what lets a new engine appear with its own
honest set of limits instead of a set of runtime surprises.

SQL Server is the one most often asked for. It is on the
[roadmap](/roadmap/) as `unscheduled`, which means nobody is working on
it.

## Related

- [What it can do](/docs/features/) — the surface all four share.
- [The rules](/rules/) — which rules are dialect-gated.
- [`docs/spec/adapters.md`](https://github.com/datagripe/datagripe/blob/main/docs/spec/adapters.md) —
  the specification, in the repository.
