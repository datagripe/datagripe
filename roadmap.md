# DataGripe roadmap

Single source of truth for what is planned, in progress, and shipped.
Update this file in the same change that starts or finishes a phase.
Dates are targets, not commitments.

Legend: `[ ]` planned · `[~]` in progress · `[x]` shipped

## Phase 0 — Foundation · shipped 2026-08-31

- [x] Bun workspaces monorepo (`apps/web`, `apps/server`, `packages/contracts`)
- [x] React 19 + Vite web shell with API/WebSocket proxy
- [x] Bun.serve API: config validation, structured logging, request IDs
- [x] PostgreSQL compose service, migration runner, initial schema
- [x] Shared Zod contracts: errors, WS protocol v1, documents, connections, executions
- [x] CI: typecheck, unit tests, migrations, web build

## Phase 1 — IDE shell · shipped 2026-08-31

- [x] Dockview workspace: movable tabs, horizontal/vertical splits
- [x] Monaco model registry: one model per document, split-safe editor views
- [x] Zustand document/view stores
- [x] IndexedDB draft + layout recovery (Dexie)
- [x] Spec: `docs/spec/editor-workspace.md`

Exit: multiple documents survive tab switching, splitting, and reload without lost changes.

## Phase 2 — PostgreSQL connections and explorer · shipped 2026-08-31

- [x] Encrypted connection CRUD (`connection_secrets`, AES-GCM, versioned keys)
- [x] DataGrip-style connection dialog: test, save, organize
- [x] Predefined connections from config/env — `docs/spec/connection-sources.md`
- [x] PostgreSQL adapter: lazy schema/table/column introspection
- [x] Explorer tree with refresh and short-lived introspection cache

Exit: a user can save a connection and browse schemas/tables/columns without seeing credentials.

## Phase 3 — Query execution · shipped 2026-08-31

- [x] Selection / statement-at-cursor / document execution
- [x] Execution registry, WebSocket lifecycle events, result batching
- [x] Data grid: columns, rows, duration, affected rows, truncation, errors
- [x] Server-enforced row/byte/timeout/concurrency limits
- [x] Reliable cancellation on a non-blocked control path
- [x] Query history metadata

Exit: queries run, stream bounded results, cancel reliably, and produce an auditable terminal state.

## Phase 4 — Product hardening · shipped 2026-08-31

- [x] Authentication provider + cookie sessions, CSRF, origin validation
- [x] Workspace RBAC via `workspace_members`
- [x] SSRF controls and deployment allowlists
- [x] Rate and concurrency limits
- [x] CSV/JSON export, keyboard-accessibility pass
- [x] Observability, backup/restore practice, load tests

Exit: production-readiness review passes for the intended deployment model.

## Phase 5 — Additional adapters · shipped 2026-08-31

- [x] MySQL adapter (`Bun.SQL`)
- [x] SQLite adapter where server-side file access fits deployment
- [x] Redis connection + command browser (`RedisClient`), distinct capability

Exit: adapters expose honest capability flags; no dialect leaks into generic UI state.

## Phase 6 — Multiplayer · shipped 2026-08-31

Tracked in `docs/spec/multiplayer.md`.

- [x] 6a: workspace-scoped shared documents (any member can open/edit/save)
- [x] 6b: presence — who is online, which document they have open
- [x] 6c: shared views — opt-in follow mode showing another member's cursor/selection
- [x] 6d: shared execution visibility — see what others ran and its results; run queries on shared connections under your own identity
- [x] 6e: audit trail for cross-user execution

## Phase 7 — Workspaces as projects · shipped 2026-09-01

- [x] Workspace create + switch (socket rebinds, everything rescopes)
- [x] Sidebar split: local scratchpads (IndexedDB) vs shared workspace files
- [x] Workspace default connection (document pick falls back to it)
- [x] Live `document.changed` broadcast for shared files
- [x] Spec: `docs/spec/workspaces.md`

## Phase 8 — Table view · shipped 2026-09-05

- [x] `table.rows` / `table.mutate` behind `ADAPTER_CAPABILITIES.tableData`
- [x] Real grid on double click: sort, `where …` filter, row-limit menu, paging
- [x] Editable cells, insert row, delete row — single-row writes in one transaction
- [x] Value panel for large/JSON cells, transpose, export shared with results
- [x] Spec: `docs/spec/table-view.md`

## Phase 9 — Object view · shipped 2026-09-05

- [x] `object.describe` behind `ADAPTER_CAPABILITIES.introspection === "sql"`
- [x] Seven structure tabs on real catalog data, one call fills them all
- [x] Per-engine DDL: verbatim on MySQL/SQLite, reconstructed on PostgreSQL
- [x] Tabs an engine cannot answer report themselves unsupported
- [x] Danger zone states real consequences; execution still deferred (see spec)
- [x] Spec: `docs/spec/object-view.md`

## Phase 10 — Structure editing and routines · shipped 2026-09-06

- [x] Routines and sequences in the object view; double click opens the ddl
- [x] PostgreSQL routine DDL is verbatim (`pg_get_functiondef`), overloads distinct
- [x] Editable columns tab: add, rename, retype, nullability, default, comment, drop
- [x] `object.alter` with `dryRun` — the SQL is reviewed before it runs
- [x] `columnChanges` capability so SQLite's narrow ALTER is honest, not broken
- [x] Middle click closes a tab
- [x] Spec: `docs/spec/object-view.md` (routines, "Editing columns")

## Phase 11 — Gripes engine · in progress

Designed in `docs/spec/gripes.md`.

- [x] `packages/gripes`: rule shape, runner, renderer, catalogue registry
- [x] `packages/contracts/src/gripes.ts`: severity, attitude, location,
      finding as wire types
- [x] `scanTokens` in sql-tools — comment/literal/quote-aware token walk,
      so a rule never fires on the word `join` inside a comment
- [x] Findings are analysis, wording is presentation — attitude re-renders,
      never re-analyses
- [x] Runner dispatches on declared inputs; a rule that throws costs its
      own output and nothing else
- [x] Catalogue assertions: four strings per rule with no fallback, length
      caps, barred terms at every level, notice profanity-free, id shape
- [x] Eleven rules — four blockers (definer-no-search-path,
      join.no-condition, delete/update.no-where), five warnings
      (subquery.not-in, view.select-star, index.not-concurrent,
      column.nullable-inequality, table.no-primary-key), two style
      (index.duplicate, routine.volatile-but-readonly) — each with a
      "looks like the finding and is not" fixture class
- [x] Client `SchemaInput` off the completion catalog: honest about what
      it does not know, and silent rather than guessing
- [x] `BARRED_TERMS` grows with the wording rather than gating it, and a
      plain-voice disclaimer beside the attitude control carries the rest
- [x] Client runner: debounced per document, offsets document-relative
- [x] Presentation: editor gutter glyph + squiggle, gripes panel with
      severity rows and auditable footers, status-bar count
- [x] Annotation rail on Monaco's overview ruler, capped at forty
- [x] Dismissal at occurrence / target / project scope, never silent —
      occurrence keys on a statement fingerprint, not a moving offset
- [x] Object-view annotations, tab-scoped, counted in the panel and
      status bar, with severity marks on the tab strip so a scoped
      finding cannot hide behind an unopened tab
- [x] Demo project: `scripts/demo/` seeds the objects and query files
      that exercise every rule, plus the silent counterexamples
- [ ] Server-side runner on the execution path
- [ ] Blocked with the danger zone on project class + attitude leaving
      localStorage

## Phase 12 — Domains · shipped 2026-09-07

Designed in `docs/spec/domains.md`. Replaces the hand-maintained
`pull_schema.sh` pattern: the object-to-domain map becomes data in the
app, and the directory tree it produces becomes a button.

- [x] `domains` + `domain_tags` + `domain_exports` (migration 0010),
      scoped to workspace × datasource, one domain per object, team-wide
- [x] `domain.list` / `upsert` / `delete` / `tag` and
      `packages/contracts/src/domains.ts`
- [x] Context-menu `domain ▸` submenu; Ctrl/Cmd click builds a
      multi-selection and the submenu applies to all of it
- [x] Colour rail on tree rows — eight palette slots, hues reserved for
      the brand pass, never the four project accents
- [x] Domain manager tab: colour, name, description, `include data`,
      delete with the untag count
- [x] Group-by-domain toggle with a permanent `untagged` bucket
- [x] `domain.export` — deterministic tree from object-view DDL, no
      external binary, dry run before prune, `HOST_FS_ROOTS` allowlist
      (optional; `HOST_FS_DISABLED` is the off switch) and `owner` role
- [x] Export directory set per datasource on its edit page
      (`datasource_export_paths`, migration 0012) — one path per project
      would have two datasources overwriting each other's tree
- [x] Per-object files carry their grants, `PUBLIC` written out
      explicitly so PostgreSQL's implicit `EXECUTE` default is visible
- [x] `domain.import` — the manifest round-trips tagging through git
- [x] Sync tab: target, plan, progress, refusals, and `domain_exports`
      run history in place of a parsed `pull_log.txt`
- [x] `domain.git` behind `DOMAIN_EXPORT_GIT` — argv not shell, `add`
      scoped to the domain root, push always a separate press, git's
      own stderr shown verbatim and no credential management
- [x] Datasource paths (`docs/spec/datasource-paths.md`, migration
      0013): `(name, directory)` pairs on the datasource page, each a
      sidebar section above the workspace files with a lazy file tree
- [x] A file opened from a path is a workspace document with an
      `origin` — live multiplayer state, and every save writes the file
      back to the checkout it came from
- [ ] Suggestions: glob patterns propose a domain, a person accepts it
- [ ] Stale-tag report in the manager; manual domain reordering

Exit: re-exporting an unchanged database produces an empty `git diff`,
and an object added since the last export shows up as untagged rather
than silently missing.

## Phase 13 — Access report · shipped 2026-09-07

Designed in `docs/spec/access-report.md`. The role × object matrix,
resolved rather than granted — which matters most under PostgREST,
where the grant graph is the API surface.

- [x] Effective privileges from `has_*_privilege`, with the ACL parse
      used only to explain *why* — `via PUBLIC`, `via member of …`,
      `owner`, `superuser`
- [x] Fixes the direct-grants blind spot the object view's grants tab
      still has: `information_schema.role_table_grants` cannot see a
      grant to `PUBLIC` or one inherited through a role. Asserted both
      ways in `accessData.test.ts`
- [x] Schema `USAGE` gates every cell, so the report never claims
      access a role does not have
- [x] RLS state, zero-policy tables, `security_invoker` views,
      `SECURITY DEFINER` routines, `pg_default_acl`, view dependencies
- [x] Per-datasource role set (`datasource_roles`, migration 0011) with
      untrusted and authenticator marks, suggested and never assumed
- [x] Seven `grant.*` rules in the gripes catalogue, loudest for
      `grant.public-execute` — the one nobody chose. The proposed
      eighth was dropped: it needed a judgement a rule cannot make
- [x] `access: <datasource>` tab, domain-filtered, "differences only"
- [x] `access/` in the domain dump, with no `Generated:` date in the
      body so a real change is not buried under a timestamp
- [ ] Render the per-column grant expansion (the data is already in the
      payload); a schema filter control; MySQL

Exit: a function created today shows `anon` reaching it via `PUBLIC`
before anybody has run a query against it.

## Phase 14 — Git datasources and markdown · shipped 2026-09-08

Designed in `docs/spec/git-datasources.md` and
`docs/spec/markdown-documents.md`. The repository becomes the datasource
definition, so a teammate who clones it gets the same connection, the
same sidebar sections and the same domains without configuring anything
— and the `.md` runbook that explains the database becomes something you
can read and run in place.

- [x] `.datagripe/` in the work tree root: `config.yaml` (connection,
      branding, path pairs — all repo-relative), `sync.yaml` (sync dir
      and export options), `domains.yaml` (generated)
- [x] `domains.yaml` replaces `manifest.json` everywhere, with a fixed
      YAML serialiser configuration so an unchanged export still diffs
      empty — line folding is the trap
- [x] Add by clone (into `GIT_REPOS_DIR`, SSRF-checked URL) or by
      adopting an existing checkout; `git_datasources` (migration 0014)
      is a pointer, never a copy of what the file says
- [x] `connectionSourceSchema` gains `"git"`; ids are `git:<uuid>` so
      nothing branches on id shape
- [x] Secrets stay `passwordEnv`; an unset variable lists the datasource
      and names the variable rather than hiding it. Inline `password:`
      is refused, not deprecated
- [x] `export config` on any managed/predefined datasource: generate,
      preview, write the `.datagripe/` set — never the password
- [x] Repository section in the left bar: branch, ahead/behind,
      porcelain rows with checkboxes, `commit…` / `push` / `pull` /
      `refresh`. Nothing is checked by default, nothing runs on a timer,
      and `pull` is `--ff-only`
- [x] `apps/server/src/domains/git.ts` → `apps/server/src/git/`, same
      argv-not-shell / fixed-verb-list / no-credential-management rules,
      new verbs. `GIT_ENABLED` gates it (`DOMAIN_EXPORT_GIT` still
      honoured)
- [x] After a pull, `repo.changed` re-runs the existing three-case disk
      check per open file-backed document; a pull that would touch a
      dirty one is refused
- [x] `documents.language` (migration 0015) with `sql | markdown`,
      decided by the name's extension in every files area
- [x] Markdown opens rendered (`marked`, raw HTML escaped, no image
      fetching); one bottom-right button flips to the editor and back,
      per view and persisted in the layout
- [x] `sql` fences are read-only Monaco blocks with a run button on the
      real `execution.start` path, analysed by the gripes runner at
      document offsets
- [x] In edit mode, completion and formatting delegate to the SQL
      providers inside a `sql` fence and return nothing outside one
- [x] The repo's path list is *mirrored* into `datasource_paths` rather
      than merged with it, so `file.list`, `file.open`, the document
      origin and archive-on-removal are the Phase 12 machinery untouched
- [x] `noPassword` in `config.yaml`, so a trust-auth cluster inside a
      checkout can be imported with nothing to configure
- [x] Repository commands (`docs/spec/repo-commands.md`, migration
      0016): `.datagripe/run.yaml` declares argv-form commands, gated by
      `REPO_COMMANDS_ENABLED` and by an explicit per-workspace approval
      of a hash of the command list. A change — including one a pull
      brought in — needs a fresh approval, because otherwise `git pull`
      is remote code execution
- [x] `background: true` for a service rather than a task: no deadline,
      a stop button, and it is in the hash so flipping it re-earns trust
- [x] Narrow environment (allowlist, not a filter), stdin ignored,
      SIGTERM then SIGKILL, output streamed to the workspace, argv in
      every audit line
- [x] `datagripe-example`: a repository that starts its own embedded
      PostgreSQL in the checkout and seeds it, and exercises every
      feature above
- [x] **Import is its own tab**, beside `new datasource` in the menu,
      and hands over to the datasource's own edit page on success —
      creating asks for a host and a password, importing asks for a URL,
      and one form holding both made people read the half that did not
      apply to them
- [x] An imported datasource's page is not dead: a locally stored
      password (winning over `passwordEnv`, never written to the repo)
      and `read only` / `show all schemas` overrides that reach the
      connection, not just the form (migration 0017)
- [ ] Branch switching, conflict resolution, hunk-level staging — all
      the points where a terminal is the better tool
- [ ] Followed cursors in view mode (`docs/spec/markdown-documents.md`
      "What is not built"); highlighting for non-SQL fences

Exit: clone `datagripe-example`, approve its commands, press **start
database**, and have a working project — schema, data, queries,
runbooks, domains — without configuring anything. Open a runbook, run
the query in it, tick a file in the repository section and commit it,
with nothing having been committed, pushed, pulled or executed that was
not pressed.

## Phase 15 — MCP server · shipped 2026-09-09

Designed in `docs/spec/mcp.md`. The project's own knowledge — which
datasource is which, how they relate, what a column means — reaches an
agent instead of being re-guessed from field names.

- [x] `POST /mcp/<projectId>`, stateless JSON-RPC, hand-rolled: one
      endpoint per project, so no tool ever takes a project argument
- [x] `mcp_tokens` + `mcp_settings` (migration 0019); bearer only,
      cookies ignored, effective role = the minter's current role capped
      at `editor` and never `owner`, resolved per call so demoting or
      removing them stops their agent
- [x] Off by default per project, read-only by default; `MCP_ENABLED`
      defaults on as the deployment's kill switch
- [x] Read-only in three layers: statement classification refuses on
      tokens rather than text, `ExecuteLimits.sandbox` runs the call in
      a read-only transaction that always rolls back, and the
      datasource's own constraints still apply. The mode is a ceiling
      and never overrides a datasource's own `read only`
- [x] What a rollback cannot undo is written down rather than papered
      over, and layer 2 is proven against a real server
      (`postgres/sandbox.test.ts`) with the classifier out of the way
- [x] Nine tools: `describe_project`, `describe_domain`, `list_docs`,
      `read_doc`, `search_docs`, `list_schemas`, `list_objects`,
      `describe_object`, `run_query` — with the domain map in the
      orientation call, because `information_schema` cannot say which
      tables are billing
- [x] `resources/list` and `resources/read` mirror the file reads for
      clients where a human assembles context by hand
- [x] `instructions` from `.datagripe/config.yaml` → `AGENTS.md` → our
      words alone, with the mode sentence always ours and always first
- [x] `mcp` sidebar section, collapsed by default and owner-only:
      toggle, mode, endpoint, copy-client-config, tokens with
      reveal-once, last used, revoke. `defaultCollapsed` in
      `SidebarSections`, with an expanded list beside the collapsed one
- [x] An MCP query is an execution — history row, workspace-wide
      events, `source = 'mcp'` and the token's name in the history list
      so a teammate sees which client ran it
- [x] Per-token rate limits, a 200-row default cap and compact
      serialisation, because the consumer is a context window

Exit: point an agent at a cloned project and it answers a question about
the database using the project's own runbook — with a read-only project
unable to change a row no matter what it is asked to run.

## Phase 16 — Packaging and deployment · shipped 2026-09-14

- [x] `bun run build:dist` stages a checkout-free distribution — the
      bundled server, its migrations, the built web app, a launcher —
      that both the npm package and the container image are made of, so
      the two cannot describe different software
- [x] The distribution reproduces the checkout's directory layout on
      purpose: `config.ts` derives the repository root from its own
      location, so putting the bundle where the source was makes that
      root the distribution root and every path default correct
- [x] `@datagripe/cli` on npm: `bunx @datagripe/cli` is DataGripe with
      no install, no configuration and no accounts. The launcher runs
      under plain node so `npx` works too, finding a Bun to hand the
      server to and installing one only if there is none
- [x] `datagripe personal` — its own database, no accounts, loopback
      only, and pinned rather than defaulted so an `APP_DATABASE_URL` in
      the shell cannot turn it into a shared deployment that stops
      asking for secrets. `HOST` is the new setting under it
- [x] `datagripe migrate` as a second entry point, for the deployments
      that do not migrate themselves
- [x] `ghcr.io/datagripe/datagripe`, multi-arch, non-root, with the
      embedded cluster still available so `docker run` with a volume and
      nothing else is a working DataGripe
- [x] `deploy/`: a compose stack with its own PostgreSQL and a one-shot
      migration, plain Kubernetes manifests to read top to bottom, and a
      Helm chart with managed-database, embedded-database and
      bring-your-own-secrets shapes
- [x] Secrets generated once and kept across upgrades, because rotating
      `CONNECTION_ENCRYPTION_KEY` does not sign people out — it orphans
      every datasource password in the database
- [x] The chart ships as an OCI artifact beside the image —
      `oci://ghcr.io/datagripe/charts/datagripe`, no `helm repo add`, no
      `index.yaml`, and its version is DataGripe's version
- [x] Nothing publishes with a long-lived credential: npm through
      trusted publishing (OIDC), GHCR through the job's own token
- [x] CI builds the distribution and the image, boots the container, and
      validates the manifests, the chart and the compose file

Exit: someone who has never seen the repository has DataGripe running
from one command, and someone with a cluster has it running from three.

## Phase 17 — Documentation site · shipped 2026-09-14

- [x] datagripe.com is six pages rendered from markdown in
      `site/content/`, not one hand-written page: landing, getting
      started, keyboard, features, deploy, configuration
- [x] A keyboard reference, because the two most useful bindings are on
      no button — `Ctrl/Cmd+Enter` runs the statement at the caret
      without selecting it, and `Ctrl+Alt+L` reformats
- [x] "What it can do": the first complete account of the surface in one
      place, including the parts with no banner — middle-click column
      selection, domains, the access report, repo commands, MCP
- [x] `scripts/site/build.ts` is one file and not a static-site
      generator: no theme to override, and it emits the markup that was
      already written by hand
- [x] The build fails on a broken internal link, and CI runs it on every
      pull request
- [x] A release calls the Pages workflow, so the site describes the
      version that just shipped

Exit: somebody who has never used DataGripe can find out what it does
and how to run it without opening the repository.

## Phase 18 — The site as a projection of the repository · shipped 2026-09-14

datagripe.com redrawn, and rebuilt so that the parts of it that can go
stale no longer can. The trigger was finding "eleven rules" in three
places on a day the catalogue held eighteen.

- [x] Forty-two pages in three groups — Product, Deploy, Learn —
      where `group` in a page's frontmatter is both the sidebar heading
      and the footer column, so a page cannot be added to one and
      forgotten in the other
- [x] Five things rendered from the repository rather than written:
      `/rules/` from `packages/gripes`, `/roadmap/` from this file,
      `/specs/` from all eighteen of `docs/spec`, `/docs/release-notes/`
      from the changelog, and the adapter capability table from
      `ADAPTER_CAPABILITIES`
- [x] The specs get a **Specs** entry in the top nav, their own rail
      grouped by status, and their eighty-eight backticked
      cross-references turned into real links — a path is a link inside
      a repository and a dead end on a website
- [x] The landing page's counts substituted at build time, so no
      headline states a number a human has to remember to change
- [x] The build fails rather than publishes on: a broken internal link
      in either representation, a nav entry pointing at nothing, an
      ungrouped page, a colliding group and order, an unparseable
      roadmap line, a duplicate gripe slug, a rule with no wording, an
      unsubstituted placeholder, and **a rule listed as planned that has
      already shipped**
- [x] Every page also served as Markdown at the same path — `.md`
      instead of the trailing slash — plus `/llms.txt`,
      `/llms-full.txt`, `/sitemap.xml` and `/robots.txt`. A first-class
      representation, not an export: half the readers of a tool like
      this arrive as an agent
- [x] The hairline lattice, the sticky section bar and the three-column
      documentation layout, every colour a `var()` from `tokens.css` so
      the site and the app cannot drift apart
- [x] One hero canvas that animates, which is a joke about hero canvases
      and is argued for by name in `docs/brand/brand-system.md` "Motion"
      rather than quietly breaking the rule it suspends
- [x] The unscheduled/parking-lot section replaced by "Gripes about
      Datagripe" below — one list, in the product's own voice, rather
      than a public roadmap and a private one that drift apart
- [x] `AGENTS.md`: a change to behaviour is a change to datagripe.com in
      the same commit, with a table of what to check for what you
      touched
- [x] `pages.yml` redeploys when the repository sources it renders
      change, not only when `site/` does

Exit: a page cannot describe a version that does not exist, and the
build says which page and why.

## Phase 19 — The shell · shipped 2026-09-15

The chrome around the editor, which had accumulated rather than been
designed: a header of four controls nobody presses hourly, a sidebar
that re-ordered itself when you opened a section, and type sized in
pixels for one particular pair of eyes.

- [x] One **scale** setting — a slider in account settings, 80% to 180%,
      multiplying every type token, Monaco included and live — stored in
      the browser rather than the account, because the reason to turn it
      up is the screen in front of you
- [x] The sidebar is Files, Repository, Online and MCP Server, in that
      order, **all collapsed by default**, and a collapsed section stays
      where it is instead of docking at the bottom: opening one used to
      re-order the sidebar around it
- [x] Every file the editor can open is one tree — datasource
      directories, workspace files, scratchpads — each root with its own
      `new`, so switching datasource changes what is inside a section
      rather than which sections exist
- [x] MCP's switch moved into its section header, with a green frame
      that survives collapsing: whether something outside the app can
      read the project should not need a panel opened to see
- [x] The MCP panel hands out `WEB_ORIGIN`, not the port the process
      happens to listen on
- [x] An installed window pads for the reserved area on **both** edges,
      so the account menu is not under the window controls on the two
      platforms that put them on the right
- [x] The header's four controls became one Gravatar and a menu:
      project, role, address, both settings panels, log out, **and the
      versions of the app and the server** (`docs/spec/updates.md`)
- [x] A **check for updates** button that is the only thing in DataGripe
      reaching the internet on its own behalf, and only when pressed —
      no timer, no telemetry — which then says the one thing that
      applies an update *in this shape*, detected server-side
- [x] In Kubernetes, where a Deployment guarantees a restart, an owner
      can restart from the menu: with `imagePullPolicy: Always` that is
      the entire upgrade. Refused by the server anywhere nothing would
      start it again
- [x] Configuration became a documentation *group*, Google sign-in got
      documented at last, and the site build now fails when an
      environment variable is missing from the docs or `.env.example` —
      or named there after it stopped existing

Exit: nothing in the shell is sized, ordered or documented by accident,
and the version you are running is one click away.

## Phase 20 — Roles with capabilities · shipped 2026-09-16

Three ranks answered "can this person edit" and nothing else. What
projects ask is narrower: this one may expose the project over MCP, that
one runs the sync, support tags domains and touches nothing.

- [x] A role is a **name and a set of capabilities**, roles belong to a
      project, and a project can add its own beside the three that ship
      with it
- [x] Sixteen capabilities, grouped into four decisions, edited as a
      matrix in project settings; each member row picks a role
- [x] Owner, editor and viewer seeded with exactly what those ranks
      always had, with a test asserting it — an upgrade changes nothing
      about what anybody can already do
- [x] Every action names at most one capability, checked on every
      message where the rank check used to be; a test refuses a new
      writing action that names none
- [x] Taking a capability away reaches open sessions **now** rather than
      on their next reconnect
- [x] Somebody must keep *manage members and roles*, and a role somebody
      holds cannot be deleted — the old "cannot remove the last owner",
      in the shape a matrix gives it
- [x] Reading is deliberately not a capability, and the spec says why

Exit: what a person may do in a project is a sentence somebody wrote
down, not a rank somebody chose from three.

## Gripes about Datagripe

It has opinions about your schema. These are the ones it has about
itself, and this list is the only place they are written down: the
roadmap page on datagripe.com is rendered from it, so the site and the
repository cannot disagree about what is missing.

This replaces the old "unscheduled / parking lot" heading. One list, in
one voice, rather than a public roadmap and a private one that drift
apart by the second release.

Format, parsed by `scripts/site/build.ts` — the build fails on a line in
this section it cannot read, on a duplicate slug, and on a status that
is not one of the five:

```
- [status] area · slug — the gripe, in one or two sentences.
```

| Status | Means |
| --- | --- |
| `being written` | in progress now, in a phase above |
| `accepted` | it is a real hole, it will be filled, no date |
| `unscheduled` | worth doing, nothing is blocking it but nobody has |
| `unfiled` | an idea. It may never be more than that |
| `declined` | deliberately not doing it, and the reason is the point |

Nothing here is a promise. A declined gripe stays on the list rather
than being deleted, because the reason something was refused is more
useful than its absence.

### About itself

- [being written] engine · server-side-gripes — Gripes stop at the query text. Nothing yet complains about how a query actually turned out, only about how it was written.
- [being written] config · settings-server-side — Project class and attitude live in your browser's localStorage. Two machines, two personalities, and a per-project setting the server has never heard of.
- [accepted] object-view · danger-zone-inert — The danger zone states real consequences and then does nothing. Truncate and drop are decoration until project class leaves the browser.
- [accepted] brand · placeholder-icon — The app icon is a scowling cylinder drawn by hand. The mascot is real; the flat version that can animate in-app is not drawn.
- [accepted] ui · browser-chrome-in-an-app — Right-click anywhere it has nothing to say and the browser's own menu arrives, offering to reload the frame and save the image. Drag past the edge of a tree and the whole page selects, prose and all. Both are the moment it stops feeling like an application.
- [accepted] ui · one-of-each-control — Inputs, selects and now buttons are one component, but only the sidebar goes through the button: the forms, the status bar and the object view still hand-roll theirs, and toggles and segmented controls have no component at all. Every variation is a fix that has to be made twice, and eventually is made once.
- [accepted] rules · catalogue-too-thin — Eighteen rules, and seven of them are about grants. A rules page wants about thirty before it stops looking like a sample.
- [accepted] docs · counts-in-prose — The website no longer states a count it cannot derive. The specs still do, in prose, and prose is not checked by anything.
- [unscheduled] engine · explain-aware-gripes — Nothing reads an execution plan. The worst queries in the database still look completely fine in text.
- [unscheduled] rules · migration-lint — Migrations are not linted. The most dangerous SQL anyone writes gets the least attention from the thing that exists to complain about SQL.
- [unscheduled] schema · diff-view — Two databases cannot be compared. You are diffing schemas in a text editor like it is 2009.
- [unscheduled] adapters · mssql — Four engines, and none of them is the one your employer makes you use.
- [unscheduled] adapters · sqlite-table-rebuild — SQLite cannot change a column's type, nullability or default here, because that needs the twelve-step table rebuild and nobody has written it.
- [unscheduled] object-view · structure-editing — Columns can be edited. Indexes, constraints and triggers cannot. The preview-then-apply shape is proven; the rest is just dialect SQL nobody has typed.
- [unscheduled] domains · migration-generation — The domain export is a structure snapshot, not an ordered rebuild. It will not tell you how to get from the old schema to this one.
- [unscheduled] execution · arrow-transport — Results travel as JSON batches. Arrow would be faster and nobody has profiled the JSON to prove it is the problem.
- [unscheduled] connections · ssh-tunnels — No SSH tunnels, no cloud IAM auth, no network agent. If the database is not reachable from the server, it is not reachable.
- [unfiled] idea · result-shape-gripes — It never comments on what came back. Four million rows dropped into a grid is a gripe, and it is silent about it.
- [unfiled] idea · silent-mode — There is no way to make it shut up entirely except switching it off, which is not the same thing and loses the dismissals.
- [unfiled] idea · ci-mode — Gripes only exist inside the app. They could exist in a pull request, which is where somebody else would have to read them.
- [unfiled] brand · light-theme — Dark theme only. That is an open item, not a stylistic position, and saying so is cheaper than pretending.
- [declined] rules · formatting — No formatting rules, ever. Style filler is a formatter's job and the fastest way to get the whole thing switched off.
- [declined] privacy · usage-analytics — No telemetry, ever. It answers nothing but this machine, and that is the entire point of it.
- [declined] editor · ai-query-generation — It will not write your query. A tool whose thesis is that it reads SQL back to you critically cannot also be the thing that wrote it.
- [declined] product · query-health-score — No grade, no "query health 62%". A number invites gaming and averages away the one blocker that mattered.
- [declined] product · visual-schema-design — No ERD canvas, no DBA workflows. Drawing boxes is not the job and doing it badly is worse than not doing it.

### Rules not built yet

The same format, minus the area: these are rule ids, and the build fails
if one of them has quietly shipped and is still listed here as planned.
Sourced from `docs/spec/gripes.md` "Still on the list".

- [unscheduled] index.missing — Nothing knows which indexes a relation has. The completion catalog does not carry them and the object describe result is not wired to the runner.
- [unscheduled] execution.truncated — It cannot tell you that it stopped reading. Needs the server-side runner, which is being written.
- [unscheduled] statement.over-ddl — A view created with `select *` is a finding the catalogue already has, and it fires in a query document but never on the view itself, which is the one place anyone would look.
- [unscheduled] plan.seq-scan — Nothing reads an execution plan, so a sequential scan over forty million rows reads exactly like one over forty.
- [declined] select.unqualified-star — `select * from t limit 100` is the single most common legitimate query there is. Griping at it is precisely the style filler this catalogue exists to avoid.
