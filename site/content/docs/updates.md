---
title: Updates
description: What the account menu tells you about versions, the check that only runs when you press it, and the one shape that can restart itself.
group: Configuration
order: 7
---

Bottom left of the window is the version: `● 0.0.8` when there is
nothing to do, and `● Update Available` when there is. Click it for both
version numbers, what to do about them, and the way to do it.

Three different things put you behind and it says the same two words for
all of them, because your next move is the same: a newer release exists,
the page has fallen behind the server, or a downloaded build is waiting
to be applied.

**The check asks once, when you open a project.** No interval, no
background thread, no telemetry — and the server holds the answer for
ten minutes, so a team opening the same project is one request between
them. Close the tab and nothing asks again.

A failed check says so. Reporting "up to date" when the request timed
out is how a person misses a security release, so a check that could not
reach the release feed says that instead.

| | Default | |
| --- | --- | --- |
| `UPDATE_CHECK_DISABLED` | `false` | Removes the check and the button both. What an airgapped deployment sets: an offer that cannot work is worse than no offer. |

## Applying one

What the menu suggests depends on how this deployment runs, because the
answer is completely different per shape and the person reading it is
often not the person who deployed it.

| Shape | What the menu says |
| --- | --- |
| Kubernetes | Restart — the pod pulls on start. Offered as a button; see below. |
| Desktop | Nothing to do: the app updates itself and offers the new version. |
| CLI (`bunx @datagripe/cli`) | Stop it and run it again with `@latest`. |
| Container | Pull the image and restart the container. |
| A checkout | Pull the repository and restart. |

Every one of them also links to [upgrading](/docs/upgrading/), which has
the commands and, more importantly, the migration story per shape.

| | Default | |
| --- | --- | --- |
| `DATAGRIPE_SHAPE` | detected | Which of `desktop`, `cli` or `container` this is. The desktop shell, the CLI launcher and the image each set it for you, and Kubernetes is detected from `KUBERNETES_SERVICE_HOST` and wins over it. Setting it by hand only changes which upgrade advice you are shown. |

## Restarting to apply

With `imagePullPolicy: Always`, restarting **is** the upgrade: the new
pod pulls, runs the entry point, and comes back on the new image. So in
Kubernetes the menu offers a **restart to apply** button rather than an
instruction.

| | Default | |
| --- | --- | --- |
| `RESTART_TO_UPDATE` | true in Kubernetes | Whether ending the process brings a new one back. Set it for a compose stack or a systemd unit that restarts, and the button appears there too; set it `false` in a pod where you would rather nobody had it. |

The button is there whether or not the update check found anything: a
deployment that builds its own image from a moving tag has updates the
feed has never heard of, and restarting applies those too.

Four things about that button:

- **It is offered only where something will start DataGripe again.**
  Off by default everywhere but Kubernetes, because a container started
  without a restart policy that exits is a DataGripe nobody is running.
  The action is refused by the server as well as hidden by the app.
- **Owners only, behind a confirm.** It disconnects everyone in the
  deployment for a few seconds. Unsaved editor content is in the
  browser, not in the process, so it survives.
- **It goes out the way a `SIGTERM` does** — the embedded PostgreSQL
  cluster included, which is what stops the next process finding a stale
  lock file.
- **It is in the audit log** as `app.restart`, with who pressed it.

The page then waits for the server to answer again and reloads, because
a restart that pulled a new image also replaced the web bundle.

## The account menu

The avatar in the top right is the other half: the project you are in
and your role, your address, both settings panels and the way out. No
versions — those are a property of the deployment, not of you, which is
why they are at the other end of the window.

It comes from Gravatar, by hash: your address never leaves the browser,
only a SHA-256 of it does, and nothing is requested until you open the
menu for the first time. An address with no Gravatar gets no generated
image — the request asks for a 404 — so what you see is your initials.
That is also what you see offline, on an airgapped deployment, or behind
a content-security policy that blocks it.

Set a **name** in Account settings and the button shows that instead of
the initials. It is stored in this browser: it does not rename your
account, and other members still see your address.
