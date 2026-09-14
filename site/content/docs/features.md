---
title: What it can do
description: The whole surface, including the parts that are not obvious.
group: Product
order: 1
---

Nearly everything here has a keyboard path and a menu; some of it has
neither a button nor a banner, which is what this page is for. The
[keyboard reference](/docs/keyboard/) is the short version.

## Gripes

DataGripe reads your SQL back to you and says what is wrong with it.
None of the rules are about formatting — a rule earns its place by
knowing something the query text does not say, or by being about damage
rather than tidiness. [The rules page](/rules/) is the whole catalogue,
rendered from the code, so it is never a count somebody forgot to
update.

- **Statements**: a join with no condition, `NOT IN` against a subquery
  that can yield `NULL`, a write with no `WHERE`, an inequality against a
  nullable column.
- **Schema**: a table with no primary key, a view built on `SELECT *`, a
  duplicate index, a non-concurrent index build, a `SECURITY DEFINER`
  routine with no `search_path`, and a routine declared volatile that
  only reads.
- **Grants**: a routine PUBLIC can execute, an untrusted role that can
  write, row security switched on with no policy behind it, a view that
  reads its base tables as its owner. These stay silent until a role is
  marked untrusted — guessing which role is the anonymous one would be
  worse than saying nothing.

**The volume is yours.** The same finding is re-worded at four levels —
notice, warning, fatal and panic — and the wording is chosen when it is
shown, so turning the dial never re-runs the analysis. `panic` is a joke
and is opt-in; `fatal` swears.

**Anything you disagree with is dismissable** for that one occurrence,
that table, or the whole project — and the app always tells you it is
hiding something rather than quietly showing you less.

## Editor and documents

- Movable tabs, horizontal and vertical splits, and one editor model per
  document so a split never desynchronises from itself.
- Drafts and layout survive a reload, stored in the browser.
- **Markdown documents** render beside SQL — a runbook lives in the
  project with the queries it describes, and a SQL fence inside it runs
  and formats like SQL.
- **Reformatting** on `Ctrl+Alt+L` for SQL, JSON and Markdown.

## Running queries

- Run the selection, the statement at the cursor, or the whole document.
  You do not have to select a statement to run it.
- Results stream in batches, and cancellation goes down a control path
  that is not the one being blocked — so cancel works on a query that is
  stuck, which is the only time it matters.
- Row, byte, timeout and concurrency limits are enforced by the server,
  not asked of the client.
- CSV and JSON out.

## Browsing and editing

- **Explorer** with lazy schema, table and column introspection and a
  short-lived cache.
- **Table view**: sort, filter, page, edit cells, insert and delete rows,
  with a side panel for the JSON column that is unreadable in a grid.
- **Object view**: columns, arguments, indexes, constraints, triggers,
  grants, statistics and DDL from one catalog call. Column edits show you
  the SQL before they run it.
- **Four engines, honestly.** Each adapter declares what it can actually
  do, so SQLite's narrow `ALTER` is reflected in the interface rather
  than failing at runtime.

## Organising a database

- **Domains** group objects by what they are for — billing, identity,
  the reporting tables nobody owns — because `information_schema` cannot
  tell you which tables are billing. Domains export to a directory or a
  git repository, and import somewhere else.
- **Access report** answers "who can read this" across a schema or a
  domain, and refuses above a cell count rather than timing out.
- **Datasource paths** let a datasource point at a directory on the host
  that the sidebar then browses.

## Working with other people

- Workspace files, presence, and follow mode.
- Queries other people ran, each under their own identity, with an audit
  trail.
- Roles per workspace — owner, editor, viewer — checked on every action
  rather than at the door.

## Git

Off by default, and enabled per deployment.

- **Git datasources**: clone a repository and treat its SQL and
  documentation as part of the project.
- **Commit controls** on the domain export, so a schema snapshot lands
  in version control as a reviewable change.
- **Repo commands**: a repository's own `.datagripe/run.yaml` can declare
  commands DataGripe may run. This has a separate switch from the rest of
  git on purpose — every other git feature reads and writes files, and
  this one executes a program somebody else wrote. Nothing runs until a
  person approves the list, and any change to it needs a fresh approval.

## MCP

Every project can expose an endpoint an AI agent connects to, so the
agent reads the project's own documentation and queries its datasources
under the same rules a person gets. Off per project until an owner turns
it on, and read-only until they say otherwise — a read-only project
cannot change a row no matter what it is asked to run. An MCP query is
an execution like any other: it appears in history, with the token's
name beside it.

## Getting in

- **No accounts at all** for the personal and desktop shapes.
- **Accounts** for a shared deployment, with a
  [security key](/docs/configuration/) as an alternative to a password —
  sign-in is usernameless, so there is no email to type and none to leak
  by asking about.
- Signup closes after the first account unless you say otherwise.
