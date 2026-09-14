---
title: Documentation
description: What DataGripe does, how to run it, and where everything is hidden.
---

DataGripe is a database IDE for PostgreSQL, MySQL, SQLite and Redis that
reads your queries and your schema back to you and says what is wrong
with them. It runs as a web app you host, a desktop app you install, or
one command on your own machine.

Three groups below, which are the same three the sidebar and the footer
use. If you are here for the first time, [getting
started](/docs/getting-started/) is twenty seconds and
[the rules](/rules/) are what the whole thing is for.

## Product

What it does.

- [What it can do](/docs/features/) — the whole surface, including the
  parts with no banner.
- [The rules](/rules/) — everything it complains about, rendered from
  the catalogue the app runs.
- [Roadmap](/roadmap/) — the gripes it has about itself, including the
  declined ones.
- [Gripe levels](/docs/gripe-levels/) — the four-level dial, and why
  `panic` resets on upgrade.
- [Adapters](/docs/adapters/) — four engines and exactly what each can
  do.
- [Keyboard shortcuts](/docs/keyboard/) — including the two that are on
  no button.
- [Comparison](/docs/comparison/) — what to use instead, honestly.

## Deploy

How to run it.

- [Getting started](/docs/getting-started/) — running it, and the first
  five minutes after that.
- [Deploying](/docs/deploy/) — the four shapes, and how to pick one.
- [Docker](/docs/docker/) — one container.
- [Compose](/docs/compose/) — the app and a PostgreSQL beside it.
- [Kubernetes](/docs/kubernetes/) — Helm, manifests, and the ingress
  setting that closes every websocket.
- [Configuration](/docs/configuration/) — every environment variable.
- [Upgrading](/docs/upgrading/) — migrations, backups, key rotation.
- [Security](/docs/security/) — what is on, what is off, what to change.

## Learn

Why it is like this.

- [Why it complains](/docs/why-it-complains/) — the one sentence the
  whole feature follows from.
- [Writing a rule](/docs/writing-a-rule/) — a file, an entry, four
  strings and three fixtures.
- [Dismissing gripes](/docs/dismissing-gripes/) — three scopes, never
  silently.
- [FAQ](/docs/faq/) — including the answers nobody likes.
- [Glossary](/docs/glossary/) — the words this project uses in a
  particular way.
- [Release notes](/docs/release-notes/) — every release, newest first.

## For agents

Every page here is also Markdown: append `.md` to the path instead of the
trailing slash, so this page is [`/docs.md`](/docs.md) and the rules are
[`/rules.md`](/rules.md). No scraping and no JavaScript required.

- [`/llms.txt`](/llms.txt) — the whole site indexed, with a sentence
  each.
- [`/llms-full.txt`](/llms-full.txt) — every page in one request.
- [`/sitemap.xml`](/sitemap.xml)

DataGripe itself speaks MCP: a project can expose an endpoint an agent
connects to, off until an owner turns it on and read-only until they say
otherwise, with every call in the query history under the token's name.

## If something is wrong

The app tells you what it refused and why, and the two settings that
break a deployment most often are described where they are set. If a
gripe is wrong, that is a bug worth
[reporting](https://github.com/datagripe/datagripe/issues) — a wrong
gripe costs more trust than a missing one.

## Building it rather than using it

These pages are for people using DataGripe. The repository's own
[`docs/`](https://github.com/datagripe/datagripe/tree/main/docs) holds
the specs, the ADRs and the brand system, and
[`roadmap.md`](https://github.com/datagripe/datagripe/blob/main/roadmap.md)
is where the roadmap page above comes from.
