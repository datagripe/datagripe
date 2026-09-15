# Datagripe

> A database IDE for PostgreSQL, MySQL, SQLite and Redis that reads your
> queries and your schema back to you and says what is wrong with them.
> Free and open source, MIT.

This is the landing page as Markdown. It is written rather than
converted: what the page has that this does not is a particle animation
making fun of particle animations, and a transcript of that would help
nobody. Everything load-bearing is below.

## What it is

Datagripe is a database IDE. It has the parts you expect — an editor with
tabs and splits, query execution with streamed results, a data grid you
can edit, an object browser, four engines — and one part you do not: it
reads your SQL as you write it and tells you what is wrong with it,
before you press run.

It runs three ways, all the same server:

```bash
bunx @datagripe/cli personal          # your machine. no account, no config
docker run -p 3001:3001 -v datagripe:/data ghcr.io/datagripe/datagripe
helm install datagripe oci://ghcr.io/datagripe/charts/datagripe
```

There is also a desktop build for Linux, macOS and Windows, and the web
app installs as a PWA.

## The complaining part

<!--dg:ruleCountWordCap--> rules, and none of them are about formatting. A rule earns
its place by knowing something the query text does not say, or by being
about damage rather than tidiness — style filler is a formatter's job and
the fastest way to get the whole thing switched off.

Three properties matter more than the list:

- **A rule that cannot tell says nothing.** No hedging, no "this might be
  slow, maybe". If the schema is not cached, the rule that needs it stays
  silent rather than guessing.
- **Findings are analysis; wording is presentation.** The same finding is
  re-worded at four levels — `notice`, `warning`, `fatal`, `panic` —
  and the level is applied when the sentence is shown, so turning the
  dial never re-runs the analysis and cannot change what was found.
- **Everything is dismissable**, for that occurrence, that object, or the
  whole project, and the app always tells you it is hiding something.

`panic` is a joke and is opt-in; `fatal` swears; `notice` is dry and
still critical. See [gripe levels](/docs/gripe-levels.md).

## The rest of it

- **Editor** — movable tabs and splits, one model per document, drafts
  and layout recovered across reloads, Markdown documents beside SQL.
- **Query execution** — run the selection, the statement at the cursor,
  or the whole file. Streamed results, cancellation that works on a
  query that is stuck, CSV and JSON out.
- **Table view** — sort, filter, page, edit cells, insert and delete
  rows, with a panel for the JSON column that is unreadable in a grid.
- **Object view** — columns, indexes, constraints, triggers, grants,
  statistics and DDL from one catalog call. Column edits show the SQL
  before running it.
- **Four engines, honestly** — each adapter declares what it can do, so
  SQLite's narrow `ALTER` is reflected in the interface rather than
  failing at runtime.
- **Multiplayer** — workspace files, presence, follow mode, and queries
  other people ran, each under their own identity with an audit trail.
- **Domains, access reports, git datasources, MCP** — see
  [what it can do](/docs/features.md).

## For agents

Every page on this site is also Markdown at the same path with `.md`
instead of the trailing slash. `/llms.txt` indexes all of them;
`/llms-full.txt` is all of them in one request.

Datagripe itself speaks MCP. A project can expose an endpoint an agent
connects to; it is off until an owner turns it on, read-only until they
say otherwise, and every call lands in the query history under the
token's name.

## Where to go next

- [Getting started](/docs/getting-started.md) — running it, and the
  first five minutes after that.
- [All <!--dg:ruleCount--> rules](/rules.md) — what it complains about.
- [Gripe levels](/docs/gripe-levels.md) — the four-level dial.
- [What it can do](/docs/features.md) — the whole surface.
- [Deploying](/docs/deploy.md) — Docker, compose, Kubernetes, Helm.
- [Configuration](/docs/configuration.md) — every environment variable,
  a page per decision.
- [Roadmap](/roadmap.md) — the gripes it has about itself.
- [All documentation](/docs.md)

## Licence and boundary

MIT. An independent parody: not affiliated with, endorsed by, or
connected to any other software vendor.
