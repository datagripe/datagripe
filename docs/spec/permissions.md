# Spec — Roles and permissions

**Status:** current
**Phase:** 20
**Supersedes:** the three fixed roles in `docs/spec/auth-and-hardening.md`
"Authorization is per action"

## Goal

Three ranks answered one question — can this person edit — and the
questions people actually have are narrower and do not nest. This member
should be able to expose the project over MCP and nothing else. That one
runs the sync. Everybody in support tags domains and touches nothing.
A rank cannot express any of it, and a fourth and fifth rank only move
the argument to where the line between them goes.

So a role is a **name and a set of capabilities**, roles belong to a
project, and every member holds one. Owner, editor and viewer are still
there — seeded rows with exactly the capabilities their rank always had,
which is why an upgrade changes nothing — and a project may add its own
beside them.

## Reading is not a capability

Being a member is being able to read: browse the schema, read the query
history, watch what other people run, open the access report. There is
no capability for it and no way to take it away.

That is a deliberate limit rather than an omission. A project where
somebody must not see the data is a project that needs a second
datasource, or a database role of their own — hiding a table behind a
checkbox in an application that hands out SQL prompts would be a
promise it cannot keep.

## The sixteen

| Capability | What it gates |
| --- | --- |
| `query.run` | Run and cancel statements |
| `data.write` | Edit rows in the table view |
| `schema.change` | Alter columns |
| `document.write` | Create, save and archive shared files; open a file from a datasource path |
| `gripe.dismiss` | Dismiss a finding, and restore one |
| `datasource.manage` | Add, edit and remove datasources and their per-project settings |
| `domain.manage` | Create domains and tag objects into them |
| `access.manage` | Mark a database role untrusted |
| `git.commit` | Stage, commit and pull — local only |
| `git.push` | Push, and add or remove a git datasource — reaches a remote |
| `sync.run` | Export and import domains: writes the host's disk |
| `repo.commands` | Approve and run a repository's declared commands |
| `mcp.manage` | Turn the project's MCP server on, and mint or revoke tokens |
| `members.manage` | Add and remove members, and manage roles |
| `project.manage` | Rename the project |
| `server.restart` | Restart the server where the deployment is supervised |

`server.restart` is here rather than in a separate deployment-admin
concept. It is the one lever whose blast radius is the whole process,
and the alternative — a second permission system alongside this one —
would be two places to look when somebody cannot do something.

### What the built-ins are

`viewer` holds none. `editor` holds the first nine. `owner` holds all
sixteen. That is exactly what those three ranks meant before this
existed, and `permissions.test.ts` asserts it: an upgrade that quietly
gave editors the ability to push would be a security change nobody
asked for.

## How a decision is made

1. Every action names at most one capability
   (`CAPABILITY_FOR_ACTION`, `apps/server/src/permissions.ts`). An action
   absent from the map needs none.
2. A socket resolves its member's capabilities once, at upgrade, and
   carries them. A query per message would be a query per message.
3. `requireCapability` runs before every action, in the dispatcher,
   exactly where the rank check used to.

The map is exhaustive on purpose rather than clever. There is a test
asserting that every action whose name is a verb of writing names a
capability, with an explicit allowlist for the ones that write only
your own things — your name, your layout, where you are looking, a
project of your own. A new write action fails that test until somebody
has decided who may do it, which is the point.

### A change takes effect now, not on reconnect

Capabilities live on the socket, so removing one would otherwise last
until the tab was reloaded — which is the wrong direction to be wrong
in. After anything that changes a role or who holds one, the server
re-resolves every open socket in that project, updates it in place, and
sends `workspace.permissions` so the interface stops offering what the
server would now refuse.

## Rules with teeth

- **The built-ins cannot be deleted, and cannot be renamed.** Their
  capabilities are editable — a project may decide an editor here does
  not touch datasources — but `owner` names the same thing everywhere,
  so a conversation between two deployments is possible.
- **A role nobody holds can be deleted; one somebody holds cannot.**
  Deleting a role out from under a member would silently demote them,
  and a silent demotion is discovered as a bug report six weeks later.
- **Somebody must keep `members.manage`.** The old rule was "you cannot
  remove the last owner"; this is the same rule about the same door.
  Without it a project can never be given its roles back, and the only
  way out is a database session.
- **A read is still a read.** `role.list` needs nothing: knowing what
  the roles here can do is how you know what to ask for.

## The legacy column

`workspace_members.role` stays, holding the built-in a member's role
derives from. It is the fallback for a server that knows about roles
against a database that has not been migrated yet, and it keeps a
half-applied upgrade working rather than locking everybody out. The
capability set is the authority; the rank is a hint.

## Deliberately not built

- **Per-datasource permissions.** A capability is per project. A
  datasource somebody must not touch belongs to a different project —
  that boundary already exists and is enforced everywhere.
- **Per-object permissions.** That is the database's job and it is
  better at it. The access report exists to show you what it decided.
- **Role inheritance.** Sixteen checkboxes are readable; a graph of
  roles that imply other roles is not, and the first question anybody
  asks of one is "so what can this person actually do".
- **Deployment-wide roles.** Roles belong to projects. A deployment
  concern that is not a project concern — restarting — is a capability
  in the same matrix rather than a second system.
