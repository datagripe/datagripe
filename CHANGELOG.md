# Changelog

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
