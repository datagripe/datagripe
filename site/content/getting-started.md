---
title: Getting started
description: Running DataGripe, and the first five minutes after that.
group: Start here
order: 2
---

## On your own machine

```bash
bunx @datagripe/cli personal      # or: npx @datagripe/cli personal
```

Then open <http://localhost:3001>. That is the whole setup. DataGripe
starts its own PostgreSQL for its own state, migrates it, and opens
without a login. It listens on loopback only — a DataGripe with no
accounts has no business answering the network it is plugged into.

Your work lives in `~/.local/share/datagripe` on Linux,
`~/Library/Application Support/DataGripe` on macOS, and
`%LOCALAPPDATA%\DataGripe` on Windows. It is still there next time,
wherever you run the command from.

The `npx` version works with no Bun on the machine. DataGripe's server
runs on [Bun](https://bun.sh), so it fetches one.

```
  -p, --port <port>     Port to listen on (default 3001)
      --data-dir <dir>  Where the database and its secrets live
  -h, --help            Every option
```

**Why `personal` and not just `bunx @datagripe/cli`?** Because it pins
that shape rather than defaulting to it. Most developers have an
`APP_DATABASE_URL` exported in their shell; without the word, DataGripe
takes it as an instruction to run a shared deployment and stops, asking
for two secrets nobody meant to need. Asking for the personal one should
not depend on what else is in your environment.

## As a desktop app

[Download it](https://github.com/datagripe/datagripe/releases/latest) for
Linux, macOS or Windows. The same application in a frameless window, with
its own database underneath and no login. The web app also installs as a
PWA if you would rather it lived in the browser.

## For other people

See [deploying](/docs/deploy/). The short version is one container:

```bash
docker run -p 3001:3001 -v datagripe:/data ghcr.io/datagripe/datagripe
```

## The first five minutes

**Add a datasource.** The connection dialog tests before it saves.
Passwords are encrypted at rest with a key the deployment holds, and
never come back to the browser.

**Run something.** `Ctrl/Cmd+Enter` runs the selection, or the statement
the caret is in if there is no selection — you do not have to select a
statement to run it. `Ctrl/Cmd+Shift+Enter` runs the whole document.

**Reformat with `Ctrl+Alt+L`.** IntelliJ's binding, and DataGrip's. It
is not written on a button anywhere, which is the single most common
thing people fail to find.

**Read the gripes.** They appear in the gutter as you type, before you
press run. If one is wrong, dismiss it — for that occurrence, that
table, or the whole project — and
[tell us](https://github.com/datagripe/datagripe/issues), because a wrong
gripe costs more trust than a missing one.

Then: [everything it can do](/docs/features/), and
[every shortcut](/docs/keyboard/).
