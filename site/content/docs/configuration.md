---
title: Configuration
description: How DataGripe is configured, the two variables that decide whether a deployment works, and where every other one lives.
group: Configuration
order: 1
---

DataGripe is configured by environment variables, everywhere: the CLI,
the container, compose and the Helm chart all read the same names.
[`.env.example`](https://github.com/datagripe/datagripe/blob/main/.env.example)
in the repository is the same list with the same commentary, in the file
you copy to `.env`.

Nothing here is a secret kept in a database or a settings screen. A
deployment's behaviour is decided by its environment, which is the one
place a container, a systemd unit and a Helm chart all agree on.

## The two that matter most

| | |
| --- | --- |
| `WEB_ORIGIN` | The exact origin browsers use — scheme, host, and port if it is not the default. Both the HTTP routes and the WebSocket upgrade compare against it, and everything in the app runs over that socket. A mismatch is an app that loads and then does nothing. |
| `CONNECTION_ENCRYPTION_KEY` | Encrypts datasource passwords at rest. Not recoverable: losing it does not sign people out, it orphans every stored password. At least 32 characters — `openssl rand -base64 32`. |

## Where it listens

| | Default | |
| --- | --- | --- |
| `PORT` | `3001` | |
| `HOST` | `0.0.0.0` | The interface to bind. `datagripe personal` sets `127.0.0.1`, because that shape has no accounts. |
| `NODE_ENV` | `development` | `production` adds `Secure` to the session cookie. Correct behind TLS and **wrong in front of plain http**, where the browser will not send the cookie back and sign-in will not stick. |
| `WEB_STATIC_DIR` | — | A directory of built web assets to serve. Set by the CLI and the image; unset while developing against Vite. |

## The rest, by what it decides

- **[Accounts and sign-in](/docs/authentication/)** — whether there are
  accounts at all, which of the three ways in exist, security keys, and
  Google.
- **[Database and storage](/docs/database/)** — embedded or external
  PostgreSQL, where the data directory is, and the secrets.
- **[Datasources](/docs/datasources/)** — the predefined connections
  file, and which hosts DataGripe may connect out to.
- **[Limits](/docs/limits/)** — the ceilings a client cannot ask past.
- **[Files, git and commands](/docs/files-and-git/)** — everything that
  touches the host's disk, each with its own switch.
- **[Updates](/docs/updates/)** — the version check, and the one shape
  that can restart itself into a new image.
- **[MCP](/docs/mcp/)** — the endpoint an AI agent connects to.

## Older names

Three variables were renamed when the feature they belonged to grew past
the domain export. The old name is still read, so nothing breaks on
upgrade, and the new one wins when both are set.

| Old | Now |
| --- | --- |
| `DOMAIN_EXPORT_ROOTS` | `HOST_FS_ROOTS` |
| `DOMAIN_EXPORT_GIT` | `GIT_ENABLED` |
| `DOMAIN_GIT_TIMEOUT_MS` | `GIT_TIMEOUT_MS` |

## Nothing here drifts

Every variable the server reads is on one of these pages and in
`.env.example`, and the site build fails rather than publishes when one
is missing from either — or when a page names one the server no longer
reads. A variable that is internal, experimental or "you will never need
this" is still documented, with that said in words: an undocumented
variable is not a warning, it is a search through the source.
