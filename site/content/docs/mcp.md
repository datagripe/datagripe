---
title: MCP
description: The endpoint an AI agent connects to, and the deployment's switch for it.
group: Configuration
order: 8
---

Every project can expose an endpoint an AI agent connects to, so the
agent reads the project's own documentation and queries its datasources
under the same rules a person gets. The opt-in is **per project** and
off until an owner turns it on in the sidebar, read-only until they say
otherwise.

That is why the deployment switch defaults to on, unlike git and
repository commands: a second default-off gate would only mean editing
`.env` to try it on your own machine.

| | Default | |
| --- | --- | --- |
| `MCP_ENABLED` | `true` | The deployment's kill switch. Off means the route and the panel are both absent. |
| `MCP_PUBLIC_URL` | `WEB_ORIGIN` | What the panel tells people to point their client at. The endpoint is the same process on the same origin as the app, so the address you already gave browsers is the right one — including behind a proxy. Set this only when MCP answers on a different hostname. |
| `MCP_MAX_ROWS` | `200` | Much lower than the grid's, because the consumer is a context window. A call asking for more is clamped, not refused. |
| `MCP_MAX_BYTES` | `1000000` | Serialized bytes for one tool call's rows. |
| `MCP_READ_MAX_BYTES` | `65536` | Per call, reading a file or a resource. The reply says how to continue rather than silently ending. |
| `MCP_INSTRUCTIONS_MAX_BYTES` | `16384` | Cap on the briefing handed to every client at `initialize`. |

The sidebar section says what is true of it without being opened: a
grey **no tokens** while nothing can connect, green **read only** once
something can, and violet **read/write** when what connects can commit.
Three words, three colours, and the words are there because colour on
its own is not a label anybody can rely on.

An MCP query is an execution like any other: it appears in history under
the token's name, with the same timeouts and the same concurrency limit
a person has. A read-only project cannot change a row no matter what an
agent is asked to run — and a datasource marked read-only stays
read-only however the project's mode is set.


Click **MCP Server** in the sidebar to open its management tab. The
sidebar keeps the on/off switch and read/write status; the tab holds
mode, functionality switches, tokens, endpoint and client configuration.
You can configure it and create or revoke tokens while it is off.

Domain management, sync and Git are separate opt-ins, initially off:

- **Domains:** list, create, edit and delete domains; assign or unassign
  objects; set descriptions, ordering, hidden and include-data settings.
  Hidden domains are excluded from sync.
- **Sync:** preview or write a datasource snapshot to its configured
  export directory. Preview is the default. This does not pull Git changes.
- **Git:** inspect status, commit, and push as separate tool calls. Commit
  stages named paths then commits the whole staged index, including files
  staged earlier. Inspect status first. Push never forces. Deployment Git
  must also be enabled, and the datasource must have a repository.

Domain changes, sync writes, commits and pushes additionally require
read/write mode and editor access. Reads and sync previews work in
read-only mode once their functionality is enabled. The account must
also hold the corresponding domain, sync or Git capability; custom
role restrictions still apply. Agents should reuse
the same idempotency key when retrying a completed mutation.

The design, the tool list and the token model are in
[the MCP spec](/specs/mcp/).
