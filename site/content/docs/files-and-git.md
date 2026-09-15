---
title: Files, git and commands
description: Everything that touches the host's disk or runs a program, and why each one has its own switch.
group: Configuration
order: 6
---

All off or restricted by default, and each is a separate decision. The
ordering here is deliberate: every switch below grants strictly more
than the one above it.

## The host filesystem

| | Default | |
| --- | --- | --- |
| `HOST_FS_DISABLED` | `false` | Turns off **every** host-filesystem feature: domain export and import, datasource paths, git datasources. This is what a hosted, multi-tenant deployment sets — there, the person pressing the button does not own the disk. |
| `HOST_FS_ROOTS` | — | Optional colon-separated allowlist of absolute directories. Empty means no allowlist, because the directory is already named per datasource and making people configure the same thing twice bought nothing. Re-resolved with `realpath` on every access, so a symlink swapped in later is caught. |

## Git

| | Default | |
| --- | --- | --- |
| `GIT_ENABLED` | `false` | Every git feature: the domain export's commit controls and git datasources. Off means absent, not disabled-with-a-tooltip. Git runs with argv, never a shell, and with `GIT_TERMINAL_PROMPT=0` so a missing credential errors instead of hanging. |
| `GIT_REPOS_DIR` | `<data dir>/repos` | One directory per datasource. DataGripe deletes a directory only when it created it. |
| `GIT_TIMEOUT_MS` | `60000` | Every git invocation is killed at this. |
| `GIT_CLONE_TIMEOUT_MS` | `600000` | Clone gets its own budget: a big repository is not a hung one. |

## Repository commands

| | Default | |
| --- | --- | --- |
| `REPO_COMMANDS_ENABLED` | `false` | Lets a repository's `.datagripe/run.yaml` declare commands DataGripe can run. |
| `REPO_COMMAND_DEFAULT_TIMEOUT_MS` | `120000` | Used when a command declares no `timeoutSeconds` of its own. |
| `REPO_COMMAND_TIMEOUT_MS` | `600000` | The hard ceiling per run, whatever the command asked for. |

`REPO_COMMANDS_ENABLED` has **its own switch on purpose**. Every other
git feature reads and writes files; this one executes a program somebody
else wrote, arriving over the network on `git pull`. A deployment that
wants git datasources does not thereby want arbitrary execution, and the
two decisions should not share a checkbox.

Even on, nothing runs until a person approves the command list, and any
change to that list needs a fresh approval. The approval *is* the
security boundary; there is no sandbox.
