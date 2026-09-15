# Changelog

## Unreleased

### Changed

- **The version moved to the bottom left, and says one number.** `●
  0.0.8` when there is nothing to do; `● Update Available` when there
  is. Three different things put a deployment behind — a newer release,
  a page that has fallen behind its server, a downloaded build waiting
  to be applied — and it says the same two words for all of them,
  because the reader's next move is the same: open it. Inside are both
  versions, the refresh, the restart button where it applies, and the
  link to the upgrade page.

  It took the place of the datasource, its namespace and the project
  class, all three of which the sidebar's breadcrumb and the prompt
  already say a foot up the same screen. A status bar that repeats the
  chrome is a status bar nobody reads.

  The check now runs **once when a project opens** rather than only when
  somebody presses a button. That reverses a decision made one release
  ago, and the status bar is why: a badge that lights up only after you
  press something is a badge nobody sees, and "am I behind" is exactly
  the question a person does not know to ask. There is still no interval
  and no background thread, the server holds the answer for ten minutes
  so a team is one request between them, and `UPDATE_CHECK_DISABLED`
  removes the whole thing.

- **The account menu is about you, not the build.** Project, role,
  address, both settings panels, the way out — the versions have gone to
  the other end of the window.

- **The chrome scales with the type it carries.** The tab strip was a
  fixed 29px, so at any scale above 1 it cropped its own labels; it is
  now that height times the scale. The header is the same story in an
  installed window, where it was pinned to the height the operating
  system reserves for the titlebar — a floor now rather than a ceiling.

- **The avatar button is the full height of the bar** and wears the
  ordinary button radius rather than a circle: this is a square-cornered
  interface, and one circle in it read as an import from another
  product.

### Added

- **A name.** Account settings takes one, and the header button shows it
  beside the avatar instead of the initials taken from your address. It
  is stored in this browser like the scale, because it is how this
  browser addresses you — it does not rename the account, and other
  members still see the address.

## 0.0.8 — 2026-09-15

### Added

- **One avatar where four controls were.** The role, the settings cog,
  the signed-in address and the log-out button have become a single
  Gravatar in the header, and a menu behind it: the project and your
  role in it, Project settings, Account settings, Log out — and what
  version this is.

  The avatar is a hash. Your address never leaves the browser, only a
  SHA-256 of it does, nothing is requested until you open the menu, and
  an address with no Gravatar gets initials on a coloured disc rather
  than a generated face — which is also what you get offline or on an
  airgapped deployment.

- **Versions, and what to do about them.** The menu shows the app's
  version and the server's, separately, because they come apart: a
  service worker that has downloaded a build but not applied it leaves a
  browser running the old bundle against a new server, and the menu now
  says so instead of leaving it to be diagnosed.

  **Check for updates** is a button and nothing else. No timer, no
  startup call, no telemetry — it is the only thing in DataGripe that
  reaches the internet on its own behalf, and only when pressed.
  `UPDATE_CHECK_DISABLED` removes it. A check that failed says so: "up
  to date" on a timed-out request is how somebody misses a security
  release.

  What it tells you to do is per shape, because the answer is completely
  different in each and the person reading it is often not the person
  who deployed it. The desktop app updates itself; the CLI wants
  `@latest`; a container wants a pull; a checkout wants `git pull`. The
  server detects which it is, and the menu names the one that applies.

- **In Kubernetes, the menu can just do it.** With
  `imagePullPolicy: Always` a restart *is* the upgrade, so a workspace
  owner gets a **restart to apply** button. It is offered only where
  something is guaranteed to start DataGripe again — Kubernetes by
  default, and anything that sets `RESTART_TO_UPDATE` — and refused by
  the server elsewhere rather than merely hidden, because a process
  nothing will restart must not be able to stop itself. It goes out the
  way a `SIGTERM` does, embedded PostgreSQL included, it is audited as
  `app.restart`, and the page waits for the server to come back and
  reloads onto whatever it is now serving.

- **How big the interface is, is yours.** Account settings has a scale
  slider, 80% to 180%. Every type size in the application is that one
  number times a brand token, so the tree, the tabs, the status bar, the
  gripes and the editor all move together — Monaco included, live, with
  its undo history intact. It is stored in the browser rather than the
  account, because the reason to turn it up is the screen in front of
  you and the same account is also open on a phone, and it is applied
  before the first paint so nothing renders at one size and jumps to
  another.

- **The sidebar's MCP switch is in its header.** The section is titled
  MCP Server, the toggle sits on its title bar, and the whole section
  wears a green frame while the server is running — collapsed as well as
  open. Whether something outside the app can read your project is not a
  fact that should need a panel opened to see. It costs one new
  `mcp.status` read, three fields off the settings row; the panel's
  full state, which walks every datasource path to count files, still
  waits until somebody opens it.

- **The Online section counts who is there** — grey at nought, green
  when it is not.

- **The specifications are published.** `docs/spec` — eighteen documents
  recording what each subsystem does, what it deliberately does not, and
  which alternatives were rejected and why — is now `/specs/` on
  datagripe.com, with a Markdown twin for each and a **Specs** entry in
  the top nav beside Docs. Pages that used to send you to GitHub for the
  design now link to the page.

  Specs cross-reference each other as backticked paths, eighty-eight
  times across the set, which is a link inside a repository and a dead
  end on a website; the build turns every one into a real link — to the
  spec's page where it names a spec, and to GitHub where it does not.
  Each page carries the spec's own status and phase as a strip, and a
  note saying it is an engineering document, because publishing a spec
  does not make it user documentation and a reader should not have to
  infer that from the tone halfway down.

  The build now insists every spec has a heading, a status, a phase and
  a goal, and fails on one that does not; the goal's first sentence is
  the page's description and its `llms.txt` entry. `docs/adr` is
  deliberately not published — that is a separate decision and it has
  not been made.

### Changed

- **Configuration is a section of the documentation, not a page.**
  Fifty environment variables in one wall of tables is a page people
  search rather than read, and the question somebody arrives with —
  "how do I turn on Google sign-in" — is now a heading on a short page
  about accounts and sign-in. Alongside it: database and storage,
  datasources, limits, files/git/commands, and MCP.

  **Google sign-in was documented nowhere on the site**, despite being
  one of the three ways into a deployment. It now has the four steps,
  the OAuth client type, what the redirect URI must match, and the
  warning that matters: an empty `GOOGLE_ALLOWED_DOMAINS` with signup
  open means anyone on the internet can make themselves an account.

  Fourteen other variables were undocumented too — the two sign-in kill
  switches, the Google four, both repository-command timeouts, the MCP
  briefing cap, `EMBEDDED_PG_PORT`, `MIGRATIONS_DIR`, and the three
  pre-rename names. Thirteen were missing from `.env.example`. All are
  there now, and **the site build fails when the next one is not**: it
  reads `envSchema` out of `apps/server/src/config.ts` and checks both
  directions, so a variable added without documentation, or a page
  describing a name that was renamed, stops the build rather than
  shipping.

- **Every file the editor can open is in one Files section.** The
  datasource's own directories, the project's shared files and this
  browser's scratchpads are now three kinds of root in one tree, each
  with its own `new` on the row it creates in — and `new` opens that
  root, because a file appearing in a folder you cannot see is
  indistinguishable from nothing happening. They were three to five
  separate sections whose number changed with the datasource.

  The sidebar's sections are now Files, Repository (when the datasource
  has one), Online and MCP Server, in that order, and they keep it:
  every section starts collapsed, and a collapsed one stays where it is
  in the list instead of docking at the bottom. Opening one used to
  re-order the sidebar around it, so the shape you learned was never the
  shape you were looking at.

### Fixed

- **An installed window hid the header behind the window controls.**
  With `window-controls-overlay` the header only padded its left edge,
  so on Windows and Linux — where the controls are on the right — the
  account menu and the log-out button sat underneath them, unreachable.
  It now pads whatever the browser says is reserved on *both* sides,
  gives the activity bar back the 4px it was overhanging the titlebar
  strip by, and ellipsises a long address rather than pushing the
  buttons off the edge. Installed on a phone, the shell now insets for
  the cutout and the home indicator too.

- **The MCP panel gave out an address that only worked on the server.**
  It printed `http://localhost:$PORT` unless `MCP_PUBLIC_URL` was set,
  which is the port the process listens on and not the address anybody
  reaches it at. It now defaults to `WEB_ORIGIN` — the same origin the
  app is served from, which is where the endpoint actually is — and in
  development Vite proxies `/mcp` so the printed address answers there
  too. `MCP_PUBLIC_URL` stays, for a deployment that answers MCP on a
  different hostname.

- **Every page but the landing one was flush against the edge of a
  phone.** Sections carry `.shell` for their horizontal padding, and
  `.sec`'s `padding: 64px 0 0` shorthand won on source order and set it
  to zero. The hero escaped because it sets its own.

  The documentation layout had the opposite problem and a worse one: it
  paid 24px of shell padding *and* 26px of cell padding, 13% of a 390px
  screen gone on each side, and it opened with twenty-one navigation
  links above the title. Below the two-rail breakpoint the body now
  comes first, the rails follow it, and the lattice borders come off —
  a hairline down the edge of the viewport is an artefact, not
  structure.

- **The wordmark is the application's prompt lockup.** `>Datagripe` in
  the mono face, the chevron in magenta, `Data` in ink and `gripe` in
  green — the same three colours, from the same `.dg-prompt__*` classes
  in `tokens.css`, that the project switcher wears in the app. It
  replaces an icon and a two-colour `datagripe`, and it is set larger
  than everything else on the row rather than level with it: on a
  toolbar the prompt is one control among many, but on a website it is
  the only thing identifying the site.

  There is no `:project_` tail, because that half of the prompt carries
  project identity and a website has no project.

- **The header was 233px narrower than the page.** It used the 960px
  shell while the section bar, the content and the footer all used the
  1440px one, so at full width the wordmark started a long way in from
  everything under it. All four now agree.

- **Narrow screens get the navigation back.** Below the two-rail
  breakpoint the documentation and spec rails now fold into the sticky
  bar under the header: the page's own headings in a row that scrolls
  sideways, and a **Docs** or **Specs** dropdown pinned to its right
  holding the whole rail. The dropdown does not move with the headings,
  so what gets cut off on a page with twenty of them is a heading, never
  the way out of the page.

  Both render from one list, so the menu and the sidebar cannot disagree
  about what exists. It is a `details` element and opens with no
  JavaScript; the script only adds closing it on an outside click or
  Escape.

- **The documentation index stopped repeating the navigation.** It
  enumerated all twenty-one pages, which the sidebar, the new dropdown
  and the footer all already do — four copies on one screen. It now
  routes by what you are trying to do rather than restating the
  directory.

- **Documentation and spec pages have top padding**, and clear the
  section bar instead of starting under it.

- **The site no longer states the version by hand.** Two pages said
  `--version 0.0.6` on the day 0.0.7 shipped. The Helm examples are
  substituted from `package.json` like every other count on the site.

## 0.0.7 — 2026-09-14

### Added

- **Google sign-in, and a switch for every other method.** Setting
  `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` puts "Continue with
  Google" on the sign-in screen: OIDC authorization code with PKCE,
  ending in the same session cookie a password or a security key issues.
  Identities are matched on Google's `sub` rather than the address, so
  renaming it at Google does not strand the account, and a first sign-in
  links to the local account owning a verified address before it
  considers creating one. `GOOGLE_ALLOWED_DOMAINS` restricts sign-in to
  your Workspace domains.

  `PASSWORD_AUTH_DISABLED` and `PASSKEY_AUTH_DISABLED` turn off the
  other two, which is how a deployment locks itself to Google, or to
  keys, or to any combination. Off means the routes are absent and the
  screen does not offer them. Turning off the last way in fails at
  startup rather than at the login screen.

### Changed

- **datagripe.com is rebuilt, and four of its pages are no longer
  written.** The site said "eleven rules" in three places on a day the
  catalogue held eighteen, which is the argument for all of this: the
  rules page now renders from `packages/gripes`, the roadmap page from
  `roadmap.md`, the release notes from this file, and the adapter
  capability table from `ADAPTER_CAPABILITIES`. The landing page's
  counts are substituted at build time. None of it can state a number a
  human has to remember to change.

  Twenty-three pages in three groups, where a page's `group` is both its
  sidebar heading and its footer column — one field with two uses rather
  than two fields that disagree. The build fails rather than publishes
  on a broken internal link, a nav entry pointing at nothing, an
  ungrouped page, an unparseable roadmap line, a duplicate gripe slug,
  an unsubstituted placeholder, or a rule listed as planned that has
  already shipped.

  Visually it is a hairline lattice, a sticky section bar and a
  three-column documentation layout, with every colour a `var()` from
  `tokens.css` so the site and the application cannot drift apart on
  colour or type.

- **Every page is also a Markdown file.** Drop the trailing slash, add
  `.md`: `/docs/faq/` is also `/docs/faq.md`, and the landing page is
  `/index.md`. Plus `/llms.txt` indexing the whole site with a sentence
  per page, `/llms-full.txt` for a client that would rather make one
  request than twenty-three, `/sitemap.xml` and `/robots.txt`. Half the
  readers of a tool like this arrive as an agent, and an agent should
  not have to render a page to read it.

- **The roadmap is one list now, in the product's own voice.** The
  unscheduled/parking-lot section is replaced by "Gripes about
  Datagripe" — twenty-four complaints it has about itself, at five
  statuses, including the declined ones, which stay on the list because
  the reason something was refused is more useful than its absence.

- **`AGENTS.md`**, which exists mainly to say one thing: a change to
  behaviour is a change to datagripe.com in the same commit, and here is
  the table of what to check for whatever you touched.

- **The landing page animates, once.** A particle canvas whose readout
  counts what is actually there and reports its insights and its
  relevance at zero. It is a joke about the genre and it suspends a real
  brand rule, so `docs/brand/brand-system.md` "Motion" now argues for it
  by name rather than being quietly contradicted. It stops drifting
  under `prefers-reduced-motion`; nothing else on the site moves.

## 0.0.6 — 2026-09-14

### Added

- **DataGripe runs from one command, anywhere.** `bunx @datagripe/cli`
  — or `npx @datagripe/cli` — is the whole application: the server, the
  web app it serves, and a PostgreSQL it starts for itself, with no
  install, no configuration and no account to create. There is a
  container image too, `ghcr.io/datagripe/datagripe`, which does
  the same thing with a volume mounted at `/data`.

  The npm package and the image are the same build. `bun run build:dist`
  stages a checkout-free distribution — the bundled server, its
  migrations, the built web app, a launcher — and both are made of that
  directory, so there is no deployment where the code differs.

  The distribution reproduces the checkout's directory layout on
  purpose. `config.ts` derives the repository root from its own location
  and resolves every relative path against it, so putting the bundle
  where the source was makes that root the distribution root; the
  alternative was a package whose defaults for migrations, `.env` and
  `connections.json` pointed three directories above wherever npm
  happened to unpack it.

  The launcher is written for plain node rather than Bun, because that
  is what `npx` hands it to. It finds a Bun to run the server with — the
  one you have, or one it installs as an optional dependency — and
  otherwise stays out of the way.

- **`deploy/` for the deployments that are not one person's laptop.** A
  compose stack with its own PostgreSQL, accounts switched on and the
  migration as a one-shot service; plain Kubernetes manifests meant to
  be read top to bottom; and a Helm chart with the shapes a cluster
  actually comes in — a managed database, the bundled StatefulSet, or
  the embedded cluster on a volume — plus secrets it generates once and
  then keeps, since rotating `CONNECTION_ENCRYPTION_KEY` does not sign
  people out but orphans every datasource password in the database.

  `WEB_ORIGIN` is the one setting with no default that can be right, and
  every one of these says so: DataGripe compares it against the
  browser's `Origin` on every WebSocket upgrade, and everything in the
  app runs over that socket, so a mismatch is not a degradation but an
  app that loads and then does nothing.

- **`bunx @datagripe/cli personal`** — the shape somebody actually wants
  when they are trying DataGripe on their own machine: its own database,
  no accounts, and loopback only, because a DataGripe with no accounts
  has no business answering the network it is plugged into. `HOST` is the
  new setting under that; it still defaults to every interface, which is
  what a container and a shared deployment need.

  `personal` pins the shape rather than defaulting to it, and that is the
  reason for the word. Most developers have an `APP_DATABASE_URL`
  exported in their shell; without `personal` it is taken as an
  instruction to run a shared deployment, and DataGripe stops asking for
  two secrets nobody meant to need. Asking for the personal one should
  not depend on what else is in your environment.

- **`datagripe migrate`** as a second entry point, for the deployments
  that do not migrate themselves. The compose stack runs it before the
  app starts, the Helm chart as a pre-install hook, the plain manifests
  as an init container.

- **datagripe.com is a documentation site now, not a page.** Six pages
  rendered from markdown in `site/content/`, with a
  [keyboard reference](https://datagripe.com/docs/keyboard/) that exists
  because two of the most useful bindings are written on no button:
  `Ctrl/Cmd+Enter` runs the statement the caret is in without selecting
  it, and `Ctrl+Alt+L` reformats. Also
  [what it can do](https://datagripe.com/docs/features/), which is the
  first complete list of the surface in one place, a
  [deployment guide](https://datagripe.com/docs/deploy/) and a
  [configuration reference](https://datagripe.com/docs/configuration/).

  The build is one file, `scripts/site/build.ts`, and not a static-site
  generator: there is no theme to override and the markup it emits is
  the markup that was already written by hand, which is what keeps the
  brand intact rather than reskinned. It **fails on a broken internal
  link**, which is a docs site's characteristic rot and cheaper to catch
  in CI than from a reader.

  A release rebuilds it, so the documentation describes the version that
  just shipped rather than the one before it.

- **The Helm chart is a direct link.** It is published as an OCI
  artifact beside the image it runs, so there is no `helm repo add` and
  no `index.yaml` to go stale:

  ```bash
  helm install datagripe oci://ghcr.io/datagripe/charts/datagripe \
    --set webOrigin=https://datagripe.example.com
  ```

  Its version is DataGripe's version — the chart has no lifecycle of its
  own, and one of the two silently lagging is how people end up
  installing last month's manifests against this month's image.

- **Sign in with a security key instead of a password.** A FIDO2 key — a
  YubiKey, or a passkey your laptop or phone holds — can create an
  account and sign into it, and one account may register as many keys as
  it likes. The account settings tab (click your email in the header)
  lists them, names them, and adds more.

  Sign-in is usernameless: no email, no password, insert the key and
  touch it. That means credentials are registered as discoverable, which
  costs a slot on a hardware key — a YubiKey 5 holds around 25 — and it
  buys a sign-in screen with nothing to type and no email addresses to
  leak by asking about them.

  The key always asks for its PIN. For an account created with a key and
  no password there is nothing behind it, so possession of the key alone
  must not be enough. For the same reason the server refuses to remove
  an account's last credential.

  A password account is unaffected, and adding a key to one does not
  take the password away — this is another way in, not a second factor.
  Deployment knobs are `WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME` and
  `WEBAUTHN_EXTRA_ORIGINS`; all three have working defaults derived from
  `WEB_ORIGIN`. See [docs/spec/auth-and-hardening.md](docs/spec/auth-and-hardening.md).

### Changed

- **DataGripe lives at `github.com/datagripe/datagripe`.** The image is
  `ghcr.io/datagripe/datagripe` and the chart is under the same
  organisation. GitHub redirects the old URLs, so existing clones and
  installed desktop apps — which ask the releases URL for updates —
  carry on working.

  The packages stay in one repository. The chart's `appVersion`, the
  image tag and the npm version are the same number bumped in one commit
  and proven by one CI run; split across repositories, the failure mode
  is a chart that installs an image it was never tested against, and it
  is silent. See
  [docs/adr/0003-one-distribution-three-registries.md](docs/adr/0003-one-distribution-three-registries.md).

- **Nothing publishes with a long-lived credential.** npm publishes
  through trusted publishing — the release workflow exchanges its OIDC
  token for a short-lived npm one, and provenance comes with it rather
  than being a flag — and GHCR through the job's own `GITHUB_TOKEN`.
  There is no `NPM_TOKEN` in the repository to leak or rotate.
  [docs/releasing.md](docs/releasing.md) has the one-time setup.

### Fixed

- **A bundled server no longer runs the migration CLI on the way up.**
  `migrate.ts` guarded it with `import.meta.main`, which is true for
  every module in a single-file bundle rather than only the entry one —
  so the packaged server applied migrations against `APP_DATABASE_URL`
  before starting, and in embedded mode threw the error that explains
  the CLI is for external databases. It is its own module now. The
  desktop app's bundled server had the same defect.

- **A bundled server no longer reads `connections.json` from outside
  itself.** The default path counted `..` from the module's own
  location, which bundling flattens, so the distribution resolved it
  four directories up and could pick up a file belonging to something
  else entirely. Both it and the migrations directory now go through
  `resolveRepoPath`, so there is one definition of where the root is.

## 0.0.5 — 2026-09-12

### Added

- **A datasource can carry `search_path`.** PostgreSQL runtime parameters
  are sent in the startup packet, so an unqualified name resolves in the
  schemas the datasource names instead of every query having to say so.
  `application_name` comes with the same mechanism, and shows up in
  `pg_stat_activity`. A pasted connection string carrying either now
  keeps it rather than reporting that it could not.

  An allowlist rather than free-form name/value pairs, because an
  unrecognised parameter in the startup packet is a connect-time FATAL
  rather than a warning — a typed-in name would be a datasource that
  cannot connect at all, reporting a parameter instead of the field it
  came from. `statement_timeout`, `client_encoding` and
  `default_transaction_read_only` are refused by name with the reason.

  They travel into `.datagripe/config.yaml` on export, so a teammate who
  clones the repository resolves names the same way. They are not
  secrets, and the form says so.

## 0.0.4 — 2026-09-10

### Fixed

- **The desktop app can reach its own update manifest.** Every check since
  the updater shipped failed with `unable to get local issuer
  certificate`: the bundled runtime does not find the system's
  certificate authorities on its own, while the system Bun on the same
  machine fetches the same URL fine. It is pointed at them now, before
  anything reaches the network — the server inherits it too, and needs it
  for the same reason. 0.0.2 and 0.0.3 cannot update themselves; 0.0.4
  has to be installed by hand, and updates work from there.
- **The update dialog no longer says "0.0.3 is available" to someone
  running 0.0.3.** Updates are compared by build hash, so two builds can
  share a version; when they do, the dialog names the builds instead.

## 0.0.3 — 2026-09-10

### Added

- **Paste a connection string to create a datasource.** A box above the
  engine picker on the new-datasource form reads a provider's URL —
  scheme, host, port, database, user, password, `sslmode` — and fills the
  fields in for you to check. Parsed in the browser; the string itself is
  never sent anywhere. Anything it cannot honour is named underneath with
  the reason, so nothing is dropped in silence — `channel_binding` has no
  option in this driver, and runtime parameters like `application_name`
  and `search_path` have nowhere to live until a datasource can carry
  them.
- **`verify-ca` joins the TLS modes**, so a pasted `sslmode` has somewhere
  to land. libpq's `allow` and `prefer` deliberately do not: measured
  against a non-TLS PostgreSQL, both hang until the connection timeout
  because the driver has no negotiated fallback, so a pasted one is raised
  to `require` and you are told.
- **A setting for the blank window on some Linux GPUs.**
  `disableDmabufRenderer` in `settings.json` beside the data directory,
  for when WebKit cannot allocate a DMABUF buffer and the app opens as an
  empty rectangle. Previously fixable only by launching from a terminal
  with an environment variable, which the desktop icon cannot do.
- **[docs/moving-a-datasource.md](docs/moving-a-datasource.md)** — how to
  export a datasource into git and import it on another machine, and
  where the password lives instead of in the repository.

### Fixed

- **Quitting the desktop app no longer leaves its database running.**
  Closing the window quits Electrobun natively, without running a Bun
  exit handler, so the shell never signalled the server it had spawned —
  the server outlived the app, the embedded PostgreSQL kept its lock on
  the data directory, and the next launch could not start its own and
  never opened. The shell now stops the server from `before-quit`, which
  every quit path passes through.
- **A cluster left behind by a crash no longer bricks the app.** The
  server adopts a postmaster already serving its data directory instead
  of failing to start beside it, and stops it on the way out — including
  from an exit handler, which is the only thing that runs when shutdown
  is cut short.

## 0.0.2 — 2026-09-09

### Fixed

- **The packaged desktop app now runs.** It expected a monorepo checkout
  beside the install and died at startup looking for
  `apps/server/src/index.ts`. `apps/desktop/scripts/bundle-server.ts` now
  stages the backend — the server bundled with `bun build`, its
  migrations, the built web app and the PostgreSQL binaries — into the
  bundle, and the shell runs that when there is no checkout to run from.
  Build packaged desktop apps with `bun run build` in `apps/desktop`;
  `electrobun build` on its own skips the staging step.
- **The launcher no longer shows a broken icon.** The generated
  `.desktop` entry had no `Icon=` line, because Electrobun's
  `build.linux.icon` was never set and no icon shipped with the app.

- **The desktop app checks for its own updates.** It asks 10 seconds
  after launch and every six hours after, offers the new version in a
  dialog, and on acceptance downloads it, stops the server and restarts
  into it. Electrobun had shipped the updater and the build had been
  writing an update manifest all along; nothing pointed at a URL, nothing
  published the manifest, and nothing ever asked.
  `DATAGRIPE_DISABLE_UPDATES=true` turns it off.

### Changed

- **The shipped brand assets live in `brand/`.** The app icon and the
  painted mascot set had been sitting in `apps/web/public/`, hand-copied
  into `site/`. `brand/app-icon/icon.svg` is now the drawing everything
  else comes from: `bun run brand:render` rasterises it into the sizes
  the platforms ask for, `bun run sync:brand` copies the results into
  `apps/` and `site/`, and CI fails if a copy drifts. The desktop, the
  PWA and the landing page now show the same mark, and the placeholder
  cylinder favicon is retired.

## 0.0.1 — 2026-09-07

First tagged release. Version zero in the honest sense: it works, it is
tested, and nothing in it is promised to stay put.

### What is in it

A web-based database IDE — Bun, React 19, TypeScript.

- **Editor workspace.** Movable tabs and splits (Dockview), one Monaco
  model per document, drafts and layout recovered from IndexedDB across
  reloads.
- **Connections and explorer.** Encrypted connection storage (AES-GCM,
  versioned keys), predefined connections from config, lazy
  schema/table/column introspection.
- **Query execution.** Run a selection, the statement at the cursor, or
  a whole document; streamed bounded results, reliable cancellation,
  server-enforced row/byte/timeout/concurrency limits, CSV and JSON
  export.
- **Adapters.** PostgreSQL, MySQL, SQLite, and Redis, each declaring
  what it can actually do through `ADAPTER_CAPABILITIES` — the UI gates
  on capability flags, never on an adapter id.
- **Table view.** Sort, filter, page, edit cells, insert and delete
  rows, a value panel for large and JSON cells, and transpose.
- **Object view.** Seven structure tabs from one catalog call, per-engine
  DDL, an editable columns tab (add, rename, retype, nullability,
  default, comment, drop) with `dryRun` so the SQL is reviewed before it
  runs.
- **Multiplayer.** Shared workspace documents, presence, follow mode,
  shared execution visibility under your own identity, and an audit
  trail.
- **Projects.** Workspace create and switch, local scratchpads separate
  from shared files, a per-project default connection.
- **Gripes.** Eleven static-analysis rules over your SQL and your
  schema, at four attitude levels, dismissible per occurrence, per
  target, or per project. Findings are analysis and wording is
  presentation, so changing the attitude re-renders and never
  re-analyses.
- **Shipping.** Installable PWA, and an Electrobun desktop shell that
  runs its own embedded PostgreSQL.

### What is not in it

- The object view's **danger zone** states consequences but does not
  execute: truncate and drop are deliberately unimplemented.
- Gripes run in the client only. The **server-side runner** on the
  execution path is designed and not built, so there are no rules about
  how a query actually turned out.
- **Project class and attitude live in `localStorage`**, marked as a
  mock. Both need to move server-side before they can be trusted, which
  is what the danger zone is waiting on.
- Nothing analyses the text on the **DDL tab**, so a view created with
  `select *` is flagged in a query file but not on the view itself.

### Trying it

`bun install && bun run dev` starts an embedded PostgreSQL and opens
without a login. `scripts/demo/` seeds a project whose files and objects
trip every gripe rule, alongside the cases that look like findings and
are deliberately silent.
