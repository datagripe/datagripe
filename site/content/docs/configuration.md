---
title: Configuration
description: Every environment variable, and the two that decide whether a deployment works.
group: Deploy
order: 6
---

DataGripe is configured by environment variables, everywhere: the CLI,
the container, compose and the Helm chart all read the same names.
[`.env.example`](https://github.com/datagripe/datagripe/blob/main/.env.example)
in the repository is the exhaustive list with the same commentary; this
page is the one you read first.

## The two that matter most

| | |
| --- | --- |
| `WEB_ORIGIN` | The exact origin browsers use — scheme, host, and port if it is not the default. Both the HTTP routes and the WebSocket upgrade compare against it, and everything in the app runs over that socket. A mismatch is an app that loads and then does nothing. |
| `CONNECTION_ENCRYPTION_KEY` | Encrypts datasource passwords at rest. Not recoverable: losing it does not sign people out, it orphans every stored password. At least 32 characters — `openssl rand -base64 32`. |

## Which database, and whether there are accounts

| | Default | |
| --- | --- | --- |
| `APP_DATABASE_URL` | — | A PostgreSQL for DataGripe's own state. Setting it selects **external** mode: accounts on, and migrations run separately. |
| `DATABASE_MODE` | derived | `embedded` or `external`, forced. Without it, external when `APP_DATABASE_URL` is set and embedded otherwise. |
| `AUTH_DISABLED` | derived | Off in embedded mode, on in external. Set it to override either. |
| `SESSION_SECRET` | — | Signs session cookies. Required in external mode; regenerating it only signs everyone out. |
| `ALLOW_SIGNUP` | `false` | The first account may always sign up. This governs the ones after it. |
| `EMBEDDED_PG_DATA_DIR` | `./data/pg` | Where the embedded cluster lives. |
| `DATAGRIPE_DATA_DIR` | per-OS | Read by the packaged launcher and the image only; sets the two above and the repository directory under one path. |

In embedded mode the secrets are generated once and kept beside the data
directory, so there is nothing to configure at all.

## Where it listens

| | Default | |
| --- | --- | --- |
| `PORT` | `3001` | |
| `HOST` | `0.0.0.0` | The interface to bind. `datagripe personal` sets `127.0.0.1`, because that shape has no accounts. |
| `NODE_ENV` | `development` | `production` adds `Secure` to the session cookie. Correct behind TLS and **wrong in front of plain http**, where the browser will not send the cookie back and sign-in will not stick. |
| `WEB_STATIC_DIR` | — | A directory of built web assets to serve. Set by the CLI and the image; unset while developing against Vite. |

## Limits

Server-enforced, so a client cannot ask past them.

| | Default |
| --- | --- |
| `QUERY_TIMEOUT_MS` | `30000` |
| `QUERY_MAX_ROWS` | `10000` |
| `QUERY_MAX_BYTES` | `25000000` |
| `MAX_CONCURRENT_QUERIES_PER_USER` | `3` |
| `ACCESS_REPORT_MAX_CELLS` | `250000` |
| `DOMAIN_EXPORT_MAX_DATA_ROWS` | `10000` |

## Security keys

A FIDO2 key is an alternative to the password for both signup and
sign-in, and sign-in is usernameless — insert the key and touch it.
Nothing to switch on; these only tune where credentials are scoped.

| | Default | |
| --- | --- | --- |
| `WEBAUTHN_RP_ID` | `WEB_ORIGIN`'s host | The registrable domain a credential is bound to. Set it to a parent domain when the app answers on several subdomains and one key should work across all of them. |
| `WEBAUTHN_RP_NAME` | `DataGripe` | The name the key shows while asking for a touch. |
| `WEBAUTHN_EXTRA_ORIGINS` | — | Comma-separated. `WEB_ORIGIN` is always accepted; this is for the second hostname a proxy answers on. |

## Reaching other machines

| | Default | |
| --- | --- | --- |
| `TARGET_HOST_ALLOWLIST` | — | Comma-separated hosts allowed despite the private-range block. |
| `SSRF_DISABLED` | `false` | Turns the policy off entirely. Trusted networks only: the server will then connect to any host, including loopback and cloud metadata endpoints. |

## The host filesystem, and git

All off or restricted by default, and each is a separate decision.

| | Default | |
| --- | --- | --- |
| `HOST_FS_DISABLED` | `false` | Turns off **every** host-filesystem feature: domain export and import, datasource paths, git datasources. This is what a hosted, multi-tenant deployment sets — there, the person pressing the button does not own the disk. |
| `HOST_FS_ROOTS` | — | Optional colon-separated allowlist of absolute directories. Empty means no allowlist, because the directory is already named per datasource. Re-resolved with `realpath` on every access, so a symlink swapped in later is caught. |
| `GIT_ENABLED` | `false` | Every git feature: the export's commit controls and git datasources. Off means absent, not disabled-with-a-tooltip. Git runs with argv, never a shell, and `GIT_TERMINAL_PROMPT=0` so a missing credential errors instead of hanging. |
| `GIT_REPOS_DIR` | `<data dir>/repos` | One directory per datasource. DataGripe deletes a directory only when it created it. |
| `GIT_TIMEOUT_MS` | `60000` | Every git invocation is killed at this. Clone gets its own budget, `GIT_CLONE_TIMEOUT_MS`, default `600000` — a big repository is not a hung one. |
| `REPO_COMMANDS_ENABLED` | `false` | Lets a repository's `.datagripe/run.yaml` declare commands DataGripe can run. **Its own switch on purpose**: every other git feature reads and writes files, and this one executes a program somebody else wrote, arriving over the network on `git pull`. Even on, nothing runs until somebody approves the list, and any change to it needs a fresh approval. The approval *is* the security boundary; there is no sandbox. |

## MCP

| | Default | |
| --- | --- | --- |
| `MCP_ENABLED` | `true` | The deployment's kill switch. On by default because the opt-in is per project and off until an owner flips it; off here means the route and the panel are both absent. |
| `MCP_PUBLIC_URL` | the listening port | What the panel tells people to point their client at. Set it behind a proxy. |
| `MCP_MAX_ROWS` | `200` | Much lower than the grid's, because the consumer is a context window. A call asking for more is clamped, not refused. |
| `MCP_MAX_BYTES` | `1000000` | |
| `MCP_READ_MAX_BYTES` | `65536` | Per call, reading a file or a resource. |

## Predefined connections

| | Default | |
| --- | --- | --- |
| `CONNECTIONS_FILE` | `./connections.json` | Read-only connections declared in a file, with secrets resolved from the environment at boot and held only in memory. They never touch the application database. |
