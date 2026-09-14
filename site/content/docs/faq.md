---
title: FAQ
description: The questions that come back, including the ones with an answer nobody likes.
group: Learn
order: 4
---

## Is it actually rude?

Yes, at the levels you ask for. `warning` is the default and is dry with
one beat of personality. `fatal` swears. `panic` shouts and is a joke.
`notice` is profanity-free and stays that way — there is a test for it,
because `notice` is the level for a shared screen.

It is rude about the query. It is never rude about you. See
[gripe levels](/docs/gripe-levels/).

## Will it ever be wrong?

It should not be, and when it is, that is a bug worth
[reporting](https://github.com/datagripe/datagripe/issues) rather than
dismissing. A wrong gripe costs more trust than a missing one, so a rule
that cannot tell is required to say nothing rather than guess. That
choice is why it is sometimes quiet about something you can see.

## Can I turn it off?

You can dismiss any finding for one occurrence, one file or object, or
the whole project, and the app tells you what it is hiding rather than
quietly showing you less. There is no global mute short of not using the
feature — that is on the [roadmap](/roadmap/) as `idea · silent-mode`
and honestly labelled as an idea.

## Does it send my queries anywhere?

No. No telemetry, no analytics, no crash reporting, no phoning home. It
answers nothing but the machine it is running on, and that is a
[declined](/roadmap/) item rather than an unimplemented one.

The personal shape binds to loopback only, because a DataGripe with no
accounts has no business answering the network it is plugged into.

## Will it write my query for me?

No, and it is not going to. A tool whose whole thesis is that it reads
SQL back to you critically cannot also be the thing that wrote it.
That one is on the roadmap under `declined`.

## Does it need an account?

Not for the personal and desktop shapes — there is no login screen at
all. A shared deployment has accounts, with a security key as an
alternative to a password; sign-in is usernameless, so there is no email
to type and none to leak by asking about. Signup closes after the first
account unless you say otherwise.

## Which databases?

PostgreSQL, MySQL, SQLite and Redis. Each adapter declares what it can
actually do, so the interface reflects SQLite's narrow `ALTER` rather
than offering an edit that fails at runtime. The exact matrix is on
[adapters](/docs/adapters/).

SQL Server is on the roadmap as `unscheduled`, which means nobody is
working on it.

## What does 0.0.x mean?

It works and it is tested. Nothing in it is promised to stay put. The
holes are not hidden: they are on the [roadmap](/roadmap/), written in
the same voice the tool uses on your schema, and the declined ones stay
there too.

## Is this a DataGrip clone?

It is an independent parody, not affiliated with, endorsed by, or
connected to any other software vendor. Some bindings are deliberately
familiar — `Ctrl+Alt+L` reformats because that is what a decade of muscle
memory expects — but the thing it does that nothing else does is the
complaining, and that is not a clone of anything.

## Can an agent use it?

Two ways. This website is Markdown at every path — append `.md`, or read
`/llms.txt` — so documentation needs no scraping. And DataGripe speaks
MCP: a project can expose an endpoint an agent connects to, off until an
owner turns it on and read-only until they say otherwise, with every
call in the query history under the token's name.

## Why is it dark only?

Because a light theme has not been drawn, which is an open item rather
than a position. It is on the [roadmap](/roadmap/) as
`brand · light-theme`, and saying so is cheaper than pretending it was
deliberate.

## Something is broken and I cannot tell why

Two settings break more deployments than everything else combined, and
both are on [configuration](/docs/configuration/):

- **`WEB_ORIGIN` must be exactly the origin browsers use.** A mismatch
  is not a degradation, it is an app that loads and then does nothing,
  because everything runs over a WebSocket that checks it.
- **`NODE_ENV=production` in front of plain HTTP** adds `Secure` to the
  session cookie, the browser refuses to send it back, and sign-in will
  not stick.

If it is neither, the app says what it refused and why — and
[issues](https://github.com/datagripe/datagripe/issues) are open.
