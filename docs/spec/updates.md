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

## Two places, and why they are two

**Who you are** is top right. **What this is** is bottom left. The
header carries the account, the status bar carries the version, and the
split is the point: one is a property of you and the other of the
deployment, and a menu that mixed them made "am I up to date" a thing
you opened an account menu to find out.

### The account menu

The header used to carry four permanent controls — the role, a settings
cog, the signed-in address and a log-out button. None of them is pressed
hourly, and the header is the one bar that has to stay legible in an
installed window where the operating system takes whichever end it
likes. They are now one avatar, and behind it:

- the current project and your role in it, and your address;
- **Project settings** and **Account settings**, the two panels that
  were reachable only by knowing that the cog and the email were
  buttons;
- **Log out**, absent when the deployment has no accounts.

The button is the **full height of the bar** and wears the ordinary
button radius. It is not a circle: this is a square-cornered interface,
and one circle in it reads as an import from another product. Its height
is the bar's, so it grows with the reader's scale like everything else,
and in an installed window the bar's height is a floor rather than a
ceiling for the same reason.

It carries a **name** when one is set (Account settings → Name) and
initials when it is not. That name is local to the browser, like the
scale and for the same reason: it is how this browser addresses you, not
who the server thinks you are. Other members still see the address, on
presence and in history — renaming an account is an accounts change, not
a preference.

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

### The status bar

`● 0.0.8`, bottom left, where the active datasource and the project used
to be repeated from the sidebar and the prompt a foot further up the
same screen.

**One number when there is nothing to do.** The app's version and the
server's are the same number in every deployment that is not mid-upgrade,
and showing two identical numbers to say "fine" is noise. They are only
separated when they disagree.

**Two words when there is.** `● Update Available` covers all three ways
to be behind — a newer release exists, the page has fallen behind the
server, or a service worker is holding a downloaded build — because the
reader's next action is the same in all three: open it and find out what
to press. Inside: both versions, the latest if it is known, one
**refresh** that covers the last two cases (see below — it is not a
reload), the restart button where that applies, and the link to
`/docs/upgrading/`.

The dot is the part read from across a desk, and it is green only when
there is something to do.

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

When it is true, and only then, the menu offers **restart server** to
a workspace **owner**. This ends the app process, so Kubernetes restarts
the container in the same pod. Even with `imagePullPolicy: Always`,
completed init containers do not rerun, and no Helm hook is triggered.
The app startup path checks `schema_migrations` and applies pending
files before creating services or opening HTTP/WebSocket listeners, in
both embedded and external modes. Startup and manual migration runners
share a PostgreSQL transaction advisory lock. Each file and its history
row commit together; failures roll back that file and stop startup.
The advice and confirmation state that this check happens on restart.

The button does not wait for the update check to find something. A
deployment building its own image from a moving tag has updates the
release feed has never heard of. The check answers "is there a release",
not "is your image current" or "have its migrations run".

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
`/health` and moves onto the new build when it answers, because a
restart that pulled a new image also replaced the bundle.

### A reload is not a way out of a stale bundle

This is the part that bit. The page is behind a service worker, which
answers from its precache, so `location.reload()` re-renders the exact
build you were trying to leave. A server upgraded underneath a tab left
that tab saying "this page is running an older build than the server"
after every refresh, for ever, and the only honest way out was a hard
reload nobody should have to know about.

Anything that knows the page is behind therefore calls
`refreshOntoLatest()` rather than reloading:

1. ask the registration for a new worker (`registration.update()`);
2. wait for it to finish installing — precaching a Monaco-sized bundle
   is seconds, so this waits up to thirty of them;
3. hand over to it (`skipWaiting`), which reloads onto the new build;
4. and only when there is no worker at all — no registration, nothing
   new, an install that never finished — fall back to an ordinary
   reload, which is the whole job in that case.

Two things call it: the restart, once the server answers again, and the
**refresh** in the version popup. And a version mismatch now asks for a
new worker as soon as it is noticed rather than on the hourly timer,
because a server on a different version *is* the proof that a new bundle
exists.

## The update check

`app.update.check` reads the repository's latest release and compares
its tag with the server's version.

**Once per workspace open, and never on an interval.** This started out
manual — a button, and nothing else, on the reasoning that a database
tool phoning home on its own schedule is a database tool somebody has to
write a firewall rule about. The status bar is what changed the answer:
a badge that only lights up after you press something is a badge nobody
sees, and "am I behind" is exactly the question a person does not know
to ask.

So the client asks when a project opens, the server holds the answer for
ten minutes, and a room full of people opening the same project is still
one request. There is no interval and no background thread; close the
tab and nothing asks again. The firewall-rule objection survives as
`UPDATE_CHECK_DISABLED`, which removes both the check and the button.

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
| `kubernetes` (supervised) | Upgrade the image or chart, then restart. App startup applies missing migrations before serving. |
| `desktop` | Nothing: the shell updates itself and offers the new version. |
| `cli` | Stop it and run it again with `@latest`. |
| `container` | Pull the image and restart the container. |
| `source` | Pull the repository and restart. |

Every one of them also links to `/docs/upgrading/`, which carries the
commands, the migration story per shape, and the two things that make an
upgrade unrecoverable rather than annoying.

## The rest of the chrome scales too

The tab strip is sized from `--dv-tabs-and-actions-container-height`,
which is `29px * --dg-scale`: a strip that stayed 29px while its labels
grew would crop them. The header is content-sized, and in an installed
window `min-height` rather than `height`, so the reserved titlebar strip
is a floor and not a ceiling — what spills below the overlay is ordinary
client area and the drag region goes with it
(docs/spec/editor-workspace.md "Scale").

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
