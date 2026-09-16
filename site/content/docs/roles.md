---
title: Roles and permissions
description: What a member of a project may do, as a matrix you can edit rather than three ranks you cannot.
group: Product
order: 8
---

A project's members hold **roles**, and a role is a name and a set of
capabilities. Owner, editor and viewer are in every project and cannot
be removed — what they may do is yours to change — and you can add your
own beside them.

Project settings → **Roles** is the matrix: capabilities down, roles
across, tick what each may do. Each member row above it picks the role
that member holds.

## Reading is not on the list

Being a member is being able to read: browse the schema, read the query
history, watch what other people run, open the access report. There is
no capability for it and no way to take it away.

That is a limit worth being honest about. If somebody must not see the
data, they need a different project or a database role of their own —
hiding a table behind a checkbox, in an application whose whole purpose
is handing you a SQL prompt, would be a promise DataGripe cannot keep.

## What you can grant

| | |
| --- | --- |
| **Run queries** | Run and cancel statements. |
| **Edit data** | Change, insert and delete rows in the table view. |
| **Change structure** | Alter columns, with the SQL shown first. |
| **Edit files** | The project's shared files, and files opened from a datasource path. |
| **Dismiss gripes** | Turn a finding off for an occurrence, an object or the project. |
| **Manage datasources** | Add, edit and remove them, and their per-project settings. |
| **Manage domains** | Create domains and tag objects into them. |
| **Mark roles untrusted** | Which database roles the grant rules treat as untrusted. Reading the report needs nothing. |
| **Commit and pull** | Stage, commit and pull in a repository datasource. Local only. |
| **Push, and add repositories** | Reaches the remote. |
| **Export and import domains** | Writes the host's filesystem. |
| **Approve and run repo commands** | The only feature that runs a program DataGripe did not write. |
| **Manage the MCP server** | Turn the project's endpoint on, and mint or revoke its tokens. |
| **Manage members and roles** | Add and remove people, and edit this matrix. |
| **Rename the project** | |
| **Restart the server** | Where the deployment is [supervised](/docs/updates/). Interrupts everybody. |

The three built-ins start as what they always were: a viewer holds none
of these, an editor holds the first nine, an owner holds all sixteen. An
upgrade changes nothing about what anybody can already do.

## Three rules that will stop you

- **Somebody has to keep "manage members and roles".** Moving the last
  person who has it into a role that does not is refused — otherwise the
  project can never be given its roles back.
- **A role somebody holds cannot be deleted.** Move them first. A role
  deleted out from under a member would demote them silently.
- **The built-ins cannot be renamed or removed.** Their capabilities are
  yours; the names are fixed so "owner" means the same thing in every
  deployment.

## Changes take effect immediately

Take a capability away and the people holding it lose it now, in the tab
they already have open — the interface stops offering what the server
would refuse. No reconnect, no reload.

## Related

- [Security](/docs/security/) — how each action is checked, and the rest
  of the model.
- [permissions](/specs/permissions/) — the design, and what was
  deliberately not built.
