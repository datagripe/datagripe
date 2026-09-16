# Adding a WebSocket action

Four edits, in this order. Miss one and the failure is specific enough
to name here, which is the point of the list.

## 1. Name it

`packages/contracts/src/ws.ts` — add it to `clientActionSchema`. The
enum is the protocol: an action that is not in it is rejected by the
envelope parser before anything sees it.

## 2. Give it a request schema

In the contracts file its subject already owns (`documents.ts`,
`git.ts`, `auth.ts`, …), export a zod schema and its inferred type. Two
rules worth copying rather than rediscovering:

- **Name the object, do not infer it from the socket.** A destructive
  action takes the id of the thing it destroys and the server checks it
  against the bound workspace — a socket rebinds when somebody switches
  project, so "whatever this socket has open" is a race, not a request
  (`workspaceDeleteRequestSchema`).
- **Idempotency keys** (`idempotencyKey: z.string().min(8).max(128)`)
  go on anything that writes and can be retried; the dispatcher wraps
  those in `withIdempotency`.

## 3. Decide who may do it

`apps/server/src/permissions.ts` — add a row to
`CAPABILITY_FOR_ACTION`. The map is exhaustive on purpose: an action
absent from it needs no capability, which for a read is right and for a
write is a hole.

`permissions.test.ts` will fail if an action whose name ends in a verb
of writing (`create`, `delete`, `save`, `set-*`, `rename`, `run`, …)
names no capability. The allowlist beside that test is for actions that
write only your own things — your name, your layout, a project of your
own. Add to it only if the action truly belongs there.

## 4. Handle it

`apps/server/src/ws/dispatch.ts` — one `case`, which parses the payload
with the schema from step 2 and calls the service. Two conventions:

- **Rate limits** live in `RATE_SCOPES`, keyed by action. Anything that
  spawns a process or reads disk shares an existing budget rather than
  getting a free one (`git.status` and `git.fetch` share
  `schema.children`).
- **Broadcasts skip the socket that caused them.** Pass `ctx.socketId`
  to the broadcast helper. The event is sent while the action is still
  running, so it reaches the caller *before* the response does — the
  bug that produced was every shared save telling its own author the
  server had moved ahead of them (`docs/spec/workspaces.md`
  "Documents"). Other tabs of the same session are different sockets and
  are still told.

## Then, on the client

`wsClient.request<Result>("action.name", payload)` from a store in
`apps/web/src/stores/`, never from a component body. If the server
broadcasts an event, handle it in the `wsClient.onEvent` switch in
`apps/web/src/app/Workspace.tsx` and keep the store mutation in the
store.

## Checking it

`bun run typecheck` catches the missing case (the switch is exhaustive
over `ClientAction`). `bun test` catches the missing capability. Nothing
catches a missing rate-limit scope, which is why it is on this list.
