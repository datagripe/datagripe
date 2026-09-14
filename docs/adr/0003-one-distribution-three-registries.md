# ADR 0003 — One distribution, three registries, one repository

**Status:** accepted
**Date:** 2026-09-14

## Context

DataGripe ships in more shapes than most tools its size: a desktop app,
a web bundle, an npm package, a container image, and a Helm chart. The
workspace that builds them is a Bun monorepo of five private packages
(`@datagripe/server`, `@datagripe/web`, `@datagripe/contracts`,
`@datagripe/database-adapters`, `@datagripe/gripes`, `@datagripe/sql-tools`),
none of which is independently useful and none of which is publishable
as it stands.

Two questions came with the `datagripe` GitHub organisation: whether the
deployment artefacts should live in their own repository now that there
is room for one, and how each artefact gets published.

## Decision

**One distribution.** `bun run build:dist` (`scripts/packaging/build.ts`)
stages a checkout-free `dist/`: the bundled server, its migrations, the
built web app, and a launcher. The npm package and the container image
are both made of that directory. Neither has a build of its own.

The staged layout reproduces the checkout's — the server bundle sits at
`apps/server/src/index.js` — because `config.ts` derives the repository
root from its own `import.meta.dir` and resolves every relative path and
the `.env` merge against it. Putting the bundle where the source was
makes that root the distribution root, and every default is then correct
without the launcher overriding it.

**Three registries, one repository.** The chart, the manifests and the
compose file stay in this repository, in `deploy/`:

- The chart's `appVersion`, the image tag and the npm version are the
  same number, bumped in one commit and proven by one CI run. Split
  across repositories, a release becomes a release in two places, and
  the failure mode — a chart that installs an image it was never tested
  against — is silent.
- The reason usually given for splitting is a `helm repo add` URL. That
  reason has expired: an OCI chart needs no repository, no `index.yaml`
  and no GitHub Pages, and `oci://ghcr.io/datagripe/charts/datagripe` is
  a direct link already.

So the organisation buys namespaces rather than repositories:
`@datagripe/cli` on npm, `ghcr.io/datagripe/datagripe` for the image,
`oci://ghcr.io/datagripe/charts/datagripe` for the chart.

**No publish credential in the repository.** npm publishes through
trusted publishing — the workflow exchanges its OIDC token for a
short-lived npm one — and GHCR through the job's own `GITHUB_TOKEN`.
There is no `NPM_TOKEN` to leak, rotate, or forget to rotate.

**Named shapes, not inferred ones.** `datagripe personal` pins embedded
mode, no accounts, and a loopback bind, rather than arriving at them by
default. The bare command still reads the environment, which is what a
deployment wants; the named one deliberately does not, because the
environment a person types `personal` into usually has an
`APP_DATABASE_URL` in it that they did not mean to aim at DataGripe.

## Consequences

- A chart-only fix waits for the next DataGripe release. Acceptable: the
  chart describes one application and has no reason to move separately.
  If that ever stops being true, the chart's version is already
  overridden at package time and can be decoupled in one line.
- npm's trusted publishing matches the **workflow filename**, so
  renaming `.github/workflows/release.yml` breaks publishing with a 403
  until the publisher is re-registered. Written down in
  `docs/releasing.md` because nothing in the error says so.
- The first npm publish must be manual: a trusted publisher can only be
  configured on a package that exists.
- The bundle is a single file, in which `import.meta.main` is true for
  every module rather than only the entry. Anything guarded by it runs
  on the way up, which is why `migrate.ts`'s CLI moved to
  `migrate.cli.ts`. Any future `import.meta.main` block in server code
  is a packaging bug; CI greps the bundle for it.
- `embedded-postgres` stays external to the bundle and is a real
  dependency of the published package, so the image and the npm package
  both carry a 60MB PostgreSQL. That is what makes `docker run` with a
  volume, and `bunx @datagripe/cli` with nothing, a working DataGripe.
