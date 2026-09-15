# Spec — Versions, updates and the account menu

**Status:** current
**Phase:** 19
**Supersedes:** nothing

## Goal

Somebody running DataGripe should be able to answer three questions
without leaving it: what am I running, is there anything newer, and what
do I do about it. The third is the one that is usually missing. "Version
0.0.8 is available" is not an instruction — applying it means a
different act in every shape DataGripe runs in, and the person reading
the message is often not the person who deployed it.

So the server says which shape it is, and the menu says the one thing
that applies there. In exactly one shape it can also just do it.

## The menu

The header used to carry four permanent controls — the role, a settings
cog, the signed-in address and a log-out button. None of them is pressed
hourly, and the header is the one bar that has to stay legible in an
installed window where the operating system takes whichever end it
likes. They are now one avatar, and behind it:

- the current project and your role in it, and your address;
- **Project settings** and **Account settings**, the two panels that
  were reachable only by knowing that the cog and the email were
  buttons;
- **Log out**, absent when the deployment has no accounts;
- the two versions, **app** and **server**;
- **check for updates**, and what to do with the answer.

### Two versions, not one

The bundle's version is a build-time constant; the server's comes from
`app.version`. They are shown separately because they genuinely come
apart: a service worker that has downloaded a new build but has not been
applied leaves a browser running the old bundle against a new server,
and that is worth being able to see rather than diagnose. When they
differ the menu says so and asks for a refresh.

### The avatar

Gravatar, by hash. The address never leaves the browser — SHA-256 of it
does, using `crypto.subtle`, so no digest implementation ships — and
nothing is requested until somebody opens the menu for the first time.
The URL carries `d=404`, so an address with no avatar gets no generated
image: what a reader sees then is initials on one of the eight domain
palette slots, which is also what they see offline, on an airgapped
deployment, or in a browser that blocks it.

Deliberately not a setting. A deployment that must make no third-party
requests at all is describing a content-security policy, not a checkbox
— and the failure mode here is a pair of letters rather than a broken
page.

## Deployment shape

`DeploymentShape` is one of `kubernetes`, `container`, `desktop`, `cli`
or `source`. Detection, in order:

1. `KUBERNETES_SERVICE_HOST` is set — a pod. This is checked **first**
   and beats anything the image says about itself: the container image
   sets `container`, which in a pod is true and useless.
2. `DATAGRIPE_SHAPE`, set by the desktop shell, the CLI launcher and the
   image, each of which knows what it is.
3. `/.dockerenv` exists — a container that did not say so.
4. Otherwise `source`: a checkout.

### Supervision, and the one thing the app may do to itself

`supervised` is the answer to "would ending this process bring a new one
back". It is true in Kubernetes by default and false everywhere else,
because a Deployment's entire job is that and nothing else guarantees
it. `RESTART_TO_UPDATE` overrides it in both directions, for a compose
stack or a systemd unit that restarts — and for a pod where somebody
would rather it did not.

When it is true, and only then, the menu offers **restart to apply** to
a workspace **owner**. With `imagePullPolicy: Always` the restart *is*
the upgrade: the new pod pulls, runs the entry point, and comes back on
the new image.

The button does not wait for the update check to find something. A
deployment building its own image from a moving tag has updates the
release feed has never heard of, and restarting is how those are applied
too — the check answers "is there a release", not "is your image
current".

Four things keep that honest:

- `app.restart` is refused when `supervised` is false, in those words —
  "nothing here would start DataGripe again, so it will not stop
  itself".
- Owner-only. It interrupts everybody in the deployment, which is a
  heavier thing than any other action on the socket, and it is a
  deliberate second press behind a confirm.
- It goes out the way a `SIGTERM` does. The dispatcher is handed a
  `restart` function by `index.ts` rather than learning how to stop a
  server: there is one description of shutdown, and the embedded
  PostgreSQL cluster has to be part of it or the next process finds a
  stale `postmaster.pid`.
- It is audited: `app.restart` with the user and the shape.

The reply is sent, then the process exits a quarter of a second later —
the close frame has to reach the browser, or the person who pressed the
button gets a dead tab instead of "restarting…". The client then polls
`/health` and reloads when it answers, because a restart that pulled a
new image also replaced the bundle.

## The update check

`app.update.check` reads the repository's latest release and compares
its tag with the server's version.

**Nothing checks on a timer.** A database tool that phones home on its
own schedule is a database tool somebody has to write a firewall rule
about; the answer is only ever wanted when a person is looking at the
menu, so the button is the only thing that reaches the network. Repeat
presses inside ten minutes get the cached answer.

`UPDATE_CHECK_DISABLED` removes the button entirely, for a deployment
that cannot reach the internet and should not offer something that
cannot work.

The feed URL is a constant. An update check that can be pointed anywhere
is an update check that can be lied to, and "there is no newer version"
is exactly the lie worth telling somebody.

**A failed check is never an all-clear.** Timeout, refusal, unparseable
tag: each says what happened. Reporting "up to date" when the request
failed is how a person misses a security release.

## What the menu says per shape

| Shape | The one thing to do |
| --- | --- |
| `kubernetes` (supervised) | Restart — the pod pulls on start. Offered as a button. |
| `desktop` | Nothing: the shell updates itself and offers the new version. |
| `cli` | Stop it and run it again with `@latest`. |
| `container` | Pull the image and restart the container. |
| `source` | Pull the repository and restart. |

Every one of them also links to `/docs/upgrading/`, which carries the
commands, the migration story per shape, and the two things that make an
upgrade unrecoverable rather than annoying.

## Deliberately not built

- **Automatic updates anywhere but the desktop.** A server that upgrades
  itself is a server that changes under the people using it, mid-query.
- **A background check.** See above: it is a firewall rule and a support
  question, bought with nothing.
- **In-app upgrade for the other shapes.** DataGripe cannot pull an
  image, run a migration Job or replace a binary that a package manager
  owns, and pretending otherwise would be a button that half-works.
- **A server-admin role.** Restarting is owner-gated per workspace,
  which is the coarsest thing this permission model has. A deployment
  where that is too broad wants `RESTART_TO_UPDATE=false` and a person
  with `kubectl`.
