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

## Projects

A project holds datasources, shared files, domains, members and roles.
The switcher is the prompt in the header — `>Datagripe:<project>_` —
and *New project…* is the last item in it.

- **Rename** it in project settings, if your role can manage the
  project.
- **Delete** it from the danger zone of the same panel: reveal, type the
  project's name, execute. It takes everything DataGripe holds about the
  project — its datasources and their stored credentials, its shared
  files, its domains and tags, its dismissed gripes, its members, its
  roles and its MCP tokens — in one cascade, and it cannot be undone.
- **Nothing on the host's disk is touched.** A repository datasource is
  a clone somebody else also has, an exported domain is a directory
  under version control, and a datasource path points at work that was
  never DataGripe's. Deleting the project is DataGripe forgetting them.
- **Nobody is left without a project.** Deleting your only one is
  refused, and so is deleting a shared project somebody else has no
  alternative to — remove them from it first. An account with no project
  cannot open the application.

## The interface

- **One Files section** in the sidebar: the datasource's own
  directories, the project's shared files and this browser's
  scratchpads, as three kinds of root in one tree. Each has its own
  `new`, and every section — Files, Repository, Online, MCP Server —
  starts collapsed and stays where it is in the list whether it is open
  or shut.
- **A section header carries the facts you would otherwise open it
  for**: the branch, the number of changed files and a refresh on
  Repository; how many people are here on Online; whether an agent can
  connect, and with what, on MCP Server.
- **`refresh` on a repository fetches first**, so *0 behind* is about
  the remote as it is now rather than the last time somebody pulled.
  The counts sit on the buttons that change them — `push 2`, `pull 0`.
- **One avatar in the header** opens the account menu: the project you
  are in and your role, the two settings panels, and the way out. Set a
  name in Account settings and the button wears it.
- **The version is bottom left**, as one number — and as *Update
  Available* when a newer release exists, when the page has fallen
  behind the server, or when a downloaded build is waiting. Clicking it
  tells you the one thing that applies an update *here*, which is
  different in every shape, and in Kubernetes offers the button that
  does it.
- **Scale.** Account settings has a slider for how big the interface is,
  from 80% to 180%. Every size in the application is a multiple of it,
  so the tree, the tabs, the editor and the results move together. It is
  stored in the browser rather than the account — the reason to turn it
  up is usually the screen in front of you.

## Editor and documents

- Movable tabs, horizontal and vertical splits, and one editor model per
  document so a split never desynchronises from itself.
- Drafts and layout survive a reload, stored in the browser.
- **Markdown documents** render beside SQL — a runbook lives in the
  project with the queries it describes, and a SQL fence inside it runs
  and formats like SQL.
- **You name the file**, in the row it will occupy, prefilled with
  `query-N.sql` and with the extension left out of the selection so
  typing keeps it. The extension is the whole rule: `.md` is a runbook,
  `.sql` is a query, anything else opens as plain text rather than being
  refused. Renaming `notes.sql` to `notes.md` switches it there and
  then — no reload.
- **A name that is taken counts up** — `notes.md`, `notes-1.md` — rather
  than being refused. Rename it afterwards if that is not what you
  meant.
- **Revert to last save** is in the right-click menu of any file with
  unsaved changes: the counterpart to the dot that says it has them.
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
- **Roles you define**: a role is a name and a set of capabilities —
  run queries, tag domains, run the sync, manage the MCP server,
  sixteen of them — edited as a matrix and checked on every action
  rather than at the door. Owner, editor and viewer are there in every
  project as the ranks they always were.

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

The switch is in the sidebar's **MCP Server** header, and the section
wears a green frame while the server is running — including collapsed,
because whether something outside the app can read a project is not
something you should have to open a panel to check.

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
  [security key](/docs/authentication/) as an alternative to a password —
  sign-in is usernameless, so there is no email to type and none to leak
  by asking about.
- Signup closes after the first account unless you say otherwise.
