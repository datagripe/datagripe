---
title: Security
description: What is on by default, what is off, and the three switches that matter before it faces anybody.
group: Deploy
order: 8
---

DataGripe holds credentials for other people's databases. That is the
threat model, and most of what follows comes from taking it seriously
rather than from a checklist.

This page is what an operator needs. The full design is in the
[authentication and hardening spec](/specs/auth-and-hardening/),
and the production checklist is in
[`docs/operations.md`](https://github.com/datagripe/datagripe/blob/main/docs/operations.md).

## Before it faces anyone

Three settings, in order of how often getting them wrong causes a real
problem.

**`WEB_ORIGIN`** — the exact origin browsers use. Every HTTP route and
the WebSocket upgrade validate `Origin` against it. This is a security
control, not only a convenience: it is what stops another origin driving
the socket.

**`NODE_ENV=production`** — adds `Secure` to the session cookie. Correct
behind TLS and **wrong in front of plain HTTP**, where the browser will
not send the cookie back at all and sign-in silently fails.

**`ALLOW_SIGNUP=false`** — the default. The first account may always sign
up; this governs every one after it. Leaving signup open on a deployment
reachable from anywhere means anyone can create an account on it.

## Accounts and sign-in

Cookie sessions, stored in the database. Sessions survive a restart and a
restore; rotating `SESSION_SECRET` signs everyone out and nothing else.

A **FIDO2 security key** is an alternative to the password for both
signup and sign-in, and sign-in is **usernameless** — insert the key and
touch it. There is no email to type, which means there is no email to
leak by asking whether one exists. Nothing needs switching on;
`WEBAUTHN_RP_ID` only matters when the app answers on several subdomains
and one key should work across all of them.

**Google sign-in** is the third way in, off until a deployment
configures an OAuth client. Identities are matched on Google's `sub`
rather than the email address, an unverified address is refused, and
`GOOGLE_ALLOWED_DOMAINS` restricts it to your Workspace domains — set
it if `ALLOW_SIGNUP` is true, because empty means any Google account on
the internet. The only claim stored is the address.

Each of the three is independently switchable, and none is a second
factor on top of another: a key and a Google identity are alternatives
to a password, not additions to one. Turning off the last way in is
refused at startup. All of it is on
[accounts and sign-in](/docs/authentication/).

State-changing HTTP routes require a CSRF token matching the session's.

## Authorization is per action

Socket authentication is not object authorization. The upgrade binds the
socket to a user, a session, a workspace and a role — and the dispatcher
then enforces the role matrix on **every single message**, not once at
the door.

| | viewer | editor | owner |
| --- | :-: | :-: | :-: |
| Browse schema, read history, watch executions | yes | yes | yes |
| Run and cancel queries | – | yes | yes |
| Create, edit, delete and test datasources | – | yes | yes |
| Add and remove workspace members | – | – | yes |

Owners cannot remove the last owner.

## Datasource credentials

Encrypted at rest with `CONNECTION_ENCRYPTION_KEY` (AES-GCM, versioned
keys) and **never returned to the browser** — not masked, not
write-only-in-the-form, absent. The server holds them.

Consequences worth planning for:

- Losing the key does not sign anyone out. It orphans every stored
  password, permanently. Back it up separately from the database.
- Rotating it is additive: add the new version to the keyring, restart,
  re-save connections opportunistically. Old versions keep decrypting,
  so there is no flag day.
- **Predefined connections** (`connections.json`) resolve their secrets
  from the environment at boot and are held only in memory. They never
  touch the application database, which is the right shape when the
  secret belongs to your secret manager rather than to DataGripe.

## Reaching other machines

Before opening any target connection, the hostname is resolved and
**every** returned address is classified. Blocked by default: loopback,
RFC1918, link-local — including `169.254.169.254`, the cloud metadata
endpoint — unique local, multicast, unspecified and reserved ranges.

`TARGET_HOST_ALLOWLIST` overrides per hostname, exact or `*.suffix`.

`SSRF_DISABLED=true` turns the policy off entirely. On a hosted or
multi-tenant deployment this is the difference between a database client
and an open proxy into your network, because the server will then connect
to any host the user names, including loopback and metadata endpoints.

**One accepted limitation, stated plainly.** The driver resolves
hostnames itself at connect time, so a DNS answer can change between the
check and the connection — classic rebinding. Closing it fully needs a
connect-time address hook the driver does not expose. A deployment that
needs that guarantee must enforce egress at the network layer.

## The host filesystem, and git

All off or restricted by default, and each is a separate decision.

| | Default | |
| --- | --- | --- |
| `HOST_FS_DISABLED` | `false` | Set it to `true` for anything hosted or multi-tenant. It turns off **every** host-filesystem feature — domain export and import, datasource paths, git datasources — because there the person pressing the button does not own the disk. |
| `HOST_FS_ROOTS` | — | Optional allowlist of absolute directories, re-resolved with `realpath` on every access, so a symlink swapped in later is caught. |
| `GIT_ENABLED` | `false` | Off means absent, not disabled-with-a-tooltip. Git runs with argv and never a shell, with `GIT_TERMINAL_PROMPT=0` so a missing credential errors instead of hanging. |
| `REPO_COMMANDS_ENABLED` | `false` | See below. |

**Repo commands deserve their own paragraph.** They let a repository's
`.datagripe/run.yaml` declare commands DataGripe may run. It has a
separate switch from the rest of git on purpose: every other git feature
reads and writes files, and this one **executes a program somebody else
wrote, arriving over the network on `git pull`**.

Even switched on, nothing runs until a person approves the list, and any
change to that list needs a fresh approval. The approval *is* the
security boundary. There is no sandbox, and the documentation says so
rather than implying one.

## MCP

`MCP_ENABLED` defaults to `true` and is the deployment's kill switch —
off here means the route and the panel are both absent. It is on by
default because the opt-in that matters is per project and defaults to
off: an owner has to turn it on, and it is read-only until they say
otherwise. A read-only project cannot change a row no matter what it is
asked to run.

An MCP call is an execution like any other. It appears in the query
history with the token's name beside it.

`MCP_MAX_ROWS` defaults to 200, much lower than the grid's, because the
consumer is a context window.

## Limits

Server-enforced, so a client cannot ask past them: query timeout, max
rows, max bytes, concurrent queries per user, access-report cell count,
domain-export row count. All on [limits](/docs/limits/).

Rate limits are in-memory token buckets — 5 logins per minute per email,
30 per minute per IP, 30 executions per minute per user, and others.
Exhaustion returns `RATE_LIMITED`, not a slow response.

## What reaches the internet

Three things, and only three. Datasource connections you configured.
The MCP endpoint, when a project's owner turns it on. And two about the
app itself: the **update check**, which asks the release feed when a
project is opened and at most once every ten minutes per server — no
interval, no background thread — and the avatar, which is a hash of
your address sent to Gravatar the first time the account menu is
opened. Both are described on [updates](/docs/updates/), and the first
is removed outright by `UPDATE_CHECK_DISABLED`.

## Restarting from inside the app

In Kubernetes, where a Deployment is guaranteed to start it again, a
workspace **owner** can restart the server from the account menu — with
`imagePullPolicy: Always` that is the whole upgrade. It is off by
default in every other shape and refused by the server there, not just
hidden, because a process nothing will restart must not be able to stop
itself. `RESTART_TO_UPDATE` decides it either way, and every press is
audited.

## Audit log

Structured JSON on stdout, tagged `"msg":"audit"`: signup, login success
and failure, logout, security-key registration and removal, datasource
create/update/delete, execution start and cancel, workspace membership
changes, domain operations, access role changes, `app.restart`, and
`ssrf.blocked`.

Never passwords, never secrets, never result values.

Pipe it to your log stack and alert on two things: bursts of
`auth.login.failure`, and any `ssrf.blocked` at all — the second means
somebody pointed the server at an address the policy refused.

## Reporting something

Open an [issue](https://github.com/datagripe/datagripe/issues). For
anything you would rather not file in public, say so in the issue without
the details and a private channel will be arranged.

## Related

- [Configuration](/docs/configuration/) — every variable, a page per decision.
- [Upgrading](/docs/upgrading/) — backups and key rotation.
- [Kubernetes](/docs/kubernetes/), [Compose](/docs/compose/) — the
  shapes with accounts on.
