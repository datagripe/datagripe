---
title: Documentation
description: What DataGripe does, how to run it, and where everything is hidden.
---

DataGripe is a database IDE for PostgreSQL, MySQL, SQLite and Redis that
reads your queries and your schema back to you and says what is wrong
with them. It runs as a web app you host, a desktop app you install, or
one command on your own machine.

Every page is in the sidebar, and in the menu on the bar above on a
narrow screen. This page is for working out which one you want.

## I want to try it

[Getting started](/docs/getting-started/) is about twenty seconds and
needs nothing installed. After that, [the rules](/rules/) are what the
whole thing is for — the <!--dg:ruleCount--> things it complains about,
and none of them are formatting.

The two shortcuts nobody finds on their own are on the
[keyboard page](/docs/keyboard/), and they are worth thirty seconds:
`Ctrl/Cmd+Enter` runs the statement the caret is in without selecting
it, and `Ctrl+Alt+L` reformats.

## I want to run it for other people

Start at [deploying](/docs/deploy/), which is the four shapes and how to
pick one, then the page for whichever you picked.

Two settings decide whether a deployment works at all and neither has a
default that can be right everywhere — `WEB_ORIGIN` and
`CONNECTION_ENCRYPTION_KEY`. Both are on
[configuration](/docs/configuration/), which is also where the rest of
the environment lives, a page per decision:
[accounts and sign-in](/docs/authentication/) — including
[Google](/docs/authentication/#google-sign-in) —
[database and storage](/docs/database/),
[datasources](/docs/datasources/), [limits](/docs/limits/),
[files, git and commands](/docs/files-and-git/) and
[MCP](/docs/mcp/). [Security](/docs/security/) is what to change before
it faces anybody.

## I want to know why it is like this

[Why it complains](/docs/why-it-complains/) is the one sentence the
whole gripes feature follows from, and what it costs. From there:
[gripe levels](/docs/gripe-levels/) for the four-level dial,
[dismissing gripes](/docs/dismissing-gripes/) for turning one off, and
[writing a rule](/docs/writing-a-rule/) for adding one.

The [FAQ](/docs/faq/) has the questions that come back, including the
ones with an answer nobody likes, and the [glossary](/docs/glossary/)
has the words this project uses in a particular way.

## I want to know what is missing

The [roadmap](/roadmap/) is the gripes DataGripe has about itself, in
the same voice it uses on your schema — accepted, unscheduled, unfiled,
and the ones deliberately declined, which stay on the page because the
reason something was refused is the useful part.
[Release notes](/docs/release-notes/) are what has already shipped.

## I am an agent

Every page here is also Markdown: append `.md` to the path instead of
the trailing slash, so this page is [`/docs.md`](/docs.md) and the rules
are [`/rules.md`](/rules.md). No scraping and no JavaScript required.

- [`/llms.txt`](/llms.txt) — the whole site indexed, a sentence each.
- [`/llms-full.txt`](/llms-full.txt) — every page in one request.
- [`/sitemap.xml`](/sitemap.xml)

DataGripe itself speaks MCP: a project can expose an endpoint an agent
connects to, off until an owner turns it on and read-only until they say
otherwise, with every call in the query history under the token's name.

## Something is wrong

The app tells you what it refused and why, and the two settings that
break a deployment most often are described where they are set. If a
gripe is wrong, that is a bug worth
[reporting](https://github.com/datagripe/datagripe/issues) — a wrong
gripe costs more trust than a missing one.

## I am building it, not using it

The [specifications](/specs/) are the other half of this site:
<!--dg:specCountWord--> documents, one per subsystem, recording what each
does, what it deliberately does not, and which alternatives were
rejected and why. They are engineering documents and read like it.

The rest of the repository's
[`docs/`](https://github.com/datagripe/datagripe/tree/main/docs) holds
the ADRs and the brand system, and
[`roadmap.md`](https://github.com/datagripe/datagripe/blob/main/roadmap.md)
is where the roadmap page is rendered from.
