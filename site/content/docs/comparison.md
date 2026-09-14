---
title: Comparison
description: What to use instead, honestly, and the one thing this does that the others do not.
group: Product
order: 7
---

This page names no products. That is partly the
[parody boundary](https://github.com/datagripe/datagripe/blob/main/docs/brand/brand-system.md) —
DataGripe is an independent parody and does not trade on anyone else's
name — and partly that a page comparing feature lists with four named
competitors is wrong within two releases of any of them.

What does not rot is the shape of the tools. There are about five kinds,
and DataGripe is one of them.

## The desktop database IDE

The heavyweight one, usually commercial, usually a JVM underneath. Deep
introspection, a real editor, refactoring, diagrams, a decade of
polish.

**Use it if** you want schema comparison, migration generation, visual
schema design, or support you can escalate to. DataGripe has none of
those and the first two are on the [roadmap](/roadmap/) as
`unscheduled`, which means nobody is working on them.

**DataGripe instead if** you want the editor and the grid without the
installer, a tool your whole team opens at a URL, and something that
tells you the delete has no `WHERE` clause before you run it.

Some bindings here are deliberately familiar — `Ctrl+Alt+L` reformats,
`Ctrl/Cmd+Enter` runs the statement the caret is in. That is muscle
memory, not imitation, and breaking it would help nobody.

## The web admin panel

Ships with the database or beside it. Browser-based, a form for
everything, runs on the server.

**Use it if** you want a tool that has been maintained for twenty years,
that your DBA already trusts, and that nobody has to be persuaded to
install.

**DataGripe instead if** you want a real editor with tabs and splits
rather than a text area, streamed results with cancellation that works
on a stuck query, and more than one engine behind the same interface.

## The `psql` prompt

The terminal, and the one that is always right.

**Use it if** you are on a server, in a pipeline, or doing anything a
script will do again tomorrow. Nothing in this project replaces it and
nothing should try.

**DataGripe alongside it**, mostly. A grid you can sort and edit, an
object view that fills eight tabs from one catalog call, and a linter
that reads the query as you type are worth a browser tab. The commit you
push is still going through the terminal.

## The SQL linter in CI

A formatter with rules, usually run on a directory of `.sql` files.

**Use it if** you want consistent formatting enforced on a pull request.
DataGripe deliberately has **no formatting rules at all** — style filler
is a formatter's job and the fastest way to get a linter switched off —
so these two do not overlap and both are worth having.

**DataGripe instead if** you want findings that know something the query
text does not say: that the column is nullable, that the index is
redundant, that the definer routine has no pinned `search_path`. A
linter working from the text alone cannot reach any of those.

The reverse is also true today: DataGripe's gripes live inside the app
and not in your pull request. That is on the roadmap as
`idea · ci-mode`, and it is honestly labelled an idea.

## The notebook

Cells, results, charts, and a document you share.

**Use it if** the output is an analysis somebody reads. DataGripe has
Markdown documents beside SQL and a SQL fence inside one runs and formats
like SQL — but it has no charts and no output cells, and it is not
pretending to be a notebook.

## What only this one does

Everything above is a real tool with real reasons. The honest summary of
what DataGripe adds is one paragraph:

It reads your SQL and your schema as you type and tells you what is wrong
with them, in a register you choose, from a catalogue of rules where
every rule either knows something the query text does not say or is about
damage rather than tidiness — and where a rule that cannot tell is
required to say nothing. That is the feature. The rest of it is a
competent database IDE built so that the feature has somewhere to live.

Whether that is worth switching for is genuinely your call. It runs in
about twenty seconds with nothing to install, which is a cheap way to
find out.

## Related

- [Getting started](/docs/getting-started/) — twenty seconds.
- [The rules](/rules/) — the whole catalogue.
- [Roadmap](/roadmap/) — including what it deliberately will not do.
