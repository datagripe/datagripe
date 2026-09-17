# Codebase map

Where things are, and which of them is the *one* place for a thing.
Written so nobody has to grep the repository to find out, and updated
when the answer changes.

## The workspaces

| Path | What it is |
| --- | --- |
| `apps/server` | Bun HTTP + WebSocket server, PostgreSQL app database, migrations |
| `apps/web` | React 19 + Monaco + Dockview client |
| `apps/desktop` | Electrobun shell around the two above |
| `packages/contracts` | Everything the client and the server both have to agree on |
| `packages/database-adapters` | One implementation per engine, behind `ADAPTER_CAPABILITIES` |
| `packages/gripes` | The rule catalogue and its four-level wording |
| `packages/sql-tools` | Statement splitting, formatting, the read-only classifier |

## The one place for a thing

Adding a second one of these is the mistake each line exists to prevent.

| Thing | Lives in |
| --- | --- |
| A rule the client and server both apply | `packages/contracts` — e.g. `languageForName`, `uniqueName`, the capability map's labels. Two copies is two behaviours |
| The WebSocket protocol | `packages/contracts/src/ws.ts` (actions) plus a request schema per action in its own file |
| Which capability an action needs | `apps/server/src/permissions.ts` — `CAPABILITY_FOR_ACTION`, exhaustive on purpose |
| Action handling | `apps/server/src/ws/dispatch.ts`, one `case` per action |
| Who receives an event | `apps/server/src/ws/hub.ts` |
| Form controls and buttons | `apps/web/src/components/controls.tsx` — `TextInput`, `Select`, `Field`, `Button` |
| Document state (content, dirty, drafts, sync) | `apps/web/src/stores/documents.ts` |
| Socket access from the client | `apps/web/src/api/ws.ts` (`wsClient`) |
| Grid cell selection and its arithmetic | `apps/web/src/components/gridSelection.ts`, `gridStats.ts` — shared by the results panel and the table view |
| Monaco models | `apps/web/src/editor/modelRegistry.ts`, reference-counted per document |

## The client's shape

State is Zustand stores in `apps/web/src/stores/`, one per domain
(`documents`, `executions`, `connections`, `git`, `mcp`, `session`,
`views`, …). Components read them with selectors; nothing fetches in a
component body.

Three things are worth knowing before touching a panel:

- **Panels are Dockview tabs.** `apps/web/src/app/Workspace.tsx` holds
  the layout, the component registry (`components = { editor, results,
  tableView, … }`) and the sidebar's section list. Opening a panel goes
  through `app/viewPanels.ts` / `app/editorPanels.ts`.
- **Forms are tabs, not modals.** There is no backdrop or modal chrome
  in this application and removing it was deliberate — a form that needs
  a surface becomes a dock tab (`NewProjectForm`, `ConnectionForm`,
  `ProjectSettingsPanel`). Naming something inline happens in the row it
  belongs to (`components/NameInput.tsx`).
- **The sidebar is `SidebarSections`.** A section is
  `{ id, title, actions?, on?, body?, onOpen? }`; `actions` renders in the header
  and stays visible while the section is shut, which is where anything
  worth knowing without opening the panel goes (the MCP switch and its
  pill, the repository's branch and refresh). `onOpen` opens a dock tab
  instead of expanding a body; MCP management uses this path.

## The server's shape

`apps/server/src/index.ts` is the HTTP entry: static assets, `/api/*`,
the `/ws` upgrade (which resolves the session, binds a workspace and
mints a `socketId`), and `/mcp/<projectId>`.

Everything else is a module directory with a `service.ts` and its tests
beside it: `workspaces`, `documents`, `connections`, `domains`,
`execution`, `files`, `git`, `gripes`, `mcp`, `access`, `auth`.
`ws/dispatch.ts` is the one file that knows about all of them, and it is
a switch rather than a router on purpose — the action list is meant to
be readable in one sitting.

## Related

- [adding-an-action.md](adding-an-action.md) — the checklist for a new
  WebSocket action
- [testing.md](testing.md) — what runs where, and what skips silently
- [migrations.md](migrations.md) — the app database's schema
- [`spec/`](spec/) — what a subsystem does and why, per feature
