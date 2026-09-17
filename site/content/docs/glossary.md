---
title: Glossary
description: The words this project uses in a particular way, and what each one means here.
group: Learn
order: 5
---

Most of these are ordinary words doing a specific job. Where DataGripe
uses a term differently from the rest of the industry, that is said.

## Gripes

**Gripe** — one finding, rendered. What you see in the gutter or the
panel.

**Finding** — the analysis behind a gripe: a rule id, a severity, a
location, and a set of facts. Carries no prose. A finding is produced
once; the sentence is chosen when it is shown.

**Rule** — a pure function that declares what inputs it needs and returns
findings, or nothing. `<subject>.<problem>`, lower-kebab:
`join.no-condition`. The id is a public contract and does not get
renamed.

**Severity** — how bad the finding is. `blocker`, `warning`, `style`.
Comes from the rule.

**Attitude** — how rudely the finding is phrased. `notice`, `warning`,
`fatal`, `panic`. Comes from your setting. Independent of severity, and
[deliberately so](/docs/gripe-levels/).

**Facts** — the named values a rule emits for the wording to interpolate.
`{ column: "status" }`, never a pre-formatted sentence.

**Dismissal** — hiding a finding at occurrence, target or project scope.
Never silent; the panel always says what is hidden. See
[dismissing gripes](/docs/dismissing-gripes/).

**Barred terms** — the list of words the gripe wording will not use at
any level, enforced by a test. It grows with the wording rather than
gating it.

## The workspace

**Workspace** — a project. Everything is scoped to one: documents,
datasources, domains, members, dismissals. Switching workspaces rebinds
the socket and rescopes the whole app.

**Datasource** — a configured database connection. Its password is
encrypted at rest with a key the deployment holds and never comes back
to the browser.

**Document** — a file in the editor. A **scratchpad** is local to your
browser (IndexedDB); a **workspace file** is shared with the workspace
and broadcast as it changes.

**Predefined connection** — a read-only datasource declared in
`connections.json`, with secrets resolved from the environment at boot
and held only in memory. Never touches the application database.

**Project class** — production, staging, local, analytics. Colour is the
safety mechanism: production magenta is the only permanent magenta in the
interface, so peripheral vision learns it.

## Engines

**Adapter** — the implementation for one engine: PostgreSQL, MySQL,
SQLite, Redis.

**Capability** — what an adapter declares it can actually do. The
interface gates on capabilities and never on adapter ids, which is what
makes SQLite's limits visible in the UI instead of arriving as a runtime
error. The matrix is on [adapters](/docs/adapters/).

**Dialect** — the SQL an adapter speaks, for the tokenizer and the
statement splitter. Declared separately from the adapter id because Redis
is an adapter with no dialect at all.

**Introspection** — reading the catalog. `sql` gives the
schema/table/column tree; `keyspace` gives Redis's key browser.

## Surfaces

**Object view** — the tabbed structure of one object: columns,
arguments, indexes, constraints, triggers, grants, statistics, DDL. One
catalog call fills all of them.

**Danger zone** — the part of the object view that states what truncate
and drop would do. It currently does not execute, on purpose, and is on
the [roadmap](/roadmap/).

**Table view** — the editable grid over a table's rows. Sort, filter,
page, edit cells, insert and delete rows.

**Annotation rail** — the marks beside the scrollbar showing where
findings are in the whole document, not just the visible window. Capped
at forty, worst first, because a rail with two hundred marks is a
gradient rather than a map.

**Domain** — a named group of objects, by what they are for: billing,
identity, the reporting tables nobody owns. `information_schema` cannot
tell you which tables are billing; a domain can, and it exports to a
directory or a git repository.

**Access report** — who can read or write what, across a schema or a
domain. Everything in it is *effective* access, with `has_*_privilege`
already resolved through PUBLIC, inheritance and superuser.

**Untrusted role** — a role you have marked as one, typically the
anonymous role behind an API. The `grant.*` rules stay silent until at
least one role is marked, because guessing which one it is would be
worse than saying nothing.

**Repo commands** — commands a repository's own `.datagripe/run.yaml`
declares. Has its own switch, separate from the rest of git, because
every other git feature reads and writes files and this one executes a
program somebody else wrote. The approval is the security boundary;
there is no sandbox.

## Deployment

**Embedded mode** — DataGripe runs its own PostgreSQL for its own state,
generates its own secrets, and has no accounts. The personal and desktop
shapes, and the zero-config container.

**External mode** — you supply `APP_DATABASE_URL`. Accounts on,
the app applies pending migrations at startup. Selected by setting that variable, or forced
with `DATABASE_MODE`.

**`WEB_ORIGIN`** — the exact origin browsers use. Both the HTTP routes
and the WebSocket upgrade compare against it. The single most common
reason a deployment loads and then does nothing.

**`CONNECTION_ENCRYPTION_KEY`** — encrypts datasource passwords at rest.
Not recoverable. Losing it does not sign anyone out; it orphans every
stored password.
