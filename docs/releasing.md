# Releasing

A release is a tag. Pushing `v*` builds and publishes everything
DataGripe ships, from one commit:

| Artefact | Where it lands |
| --- | --- |
| `@datagripe/cli` | npm, published with provenance |
| `ghcr.io/datagripe/datagripe` | GHCR, `linux/amd64` and `linux/arm64` |
| `oci://ghcr.io/datagripe/charts/datagripe` | GHCR, the Helm chart |
| Web bundle, desktop builds for three platforms | GitHub release assets |

**Step 1: review documentation against the release diff.** Compare the
previous release tag with HEAD and read `## Unreleased`. For each behaviour
change, check the relevant `site/content/docs/` sections and published
`docs/spec/` pages, including shortcuts and gestures. Fix omissions and
stale prose before bumping versions. Release notes alone do not document
how to use a feature. Record which pages were updated, or why none needed
changes, in the release commit message.

```bash
# 2. Version everything that carries one: eight package.json files —
#    the root, three apps, four packages — and the chart.
$EDITOR package.json apps/*/package.json packages/*/package.json
$EDITOR deploy/helm/datagripe/Chart.yaml    # version and appVersion
bun install                                 # bun.lock carries them too

# 3. Date the notes: `## Unreleased` becomes `## 0.0.6 — 2026-09-16`.
$EDITOR CHANGELOG.md

# 4. Run what CI runs, before the thing that publishes.
bun run typecheck && bun run lint && bun run check:brand &&
  bun test && bun run build:site

git commit -am "release 0.0.6"
git tag v0.0.6
git push origin main --tags
```

The version and notes update changes eleven files: the eight `package.json`s, `bun.lock`,
`Chart.yaml`, `CHANGELOG.md`. `git show` of any previous release commit
is the version diff to compare against. Documentation corrections from
step 1 belong in the release too.

**`bun install` is part of the version bump, not an afterthought.** The
lockfile records every workspace version, every job installs
`--frozen-lockfile`, and a lock that disagrees with the manifests fails
the install rather than the publish — which is a red release that never
built anything.

**The notes are dated, not written, at this point.** Every change has
been landing under `## Unreleased` as it shipped
([AGENTS.md](../AGENTS.md) "Releasing"); this step renames that heading
and nothing else. Reconstructing a changelog from `git log` at release
time is how a release ends up describing the commits rather than the
product.

The npm job refuses to publish if the tag and `dist/package.json`
disagree, which is the check that catches a forgotten version bump. The
chart's two versions are overwritten from the tag at package time, so
the ones in `Chart.yaml` only matter to somebody installing from a
checkout — keep them current anyway.

**A release that carries a migration needs nothing extra here.**
The app applies pending migrations on startup in both embedded and
external modes, before serving requests. `bun run db:migrate` remains
available to apply them before rollout.
The ordering is the deployment's, not the tag's — but it is
worth saying so in the CHANGELOG entry, because an operator reading the
release notes is the person who finds out either way.

## One-time setup

These are done once, per registry, and are the reason a release works
without a long-lived credential in the repository.

### npm: trusted publishing

The `npm` job has no `NPM_TOKEN`. It exchanges the workflow's OIDC token
for a short-lived npm one, which means there is no publish credential to
leak or rotate — and provenance comes with it rather than being a flag.

Setting it up needs the package to exist first, so the first publish is
manual and the only one that ever uses a token:

```bash
bun run build:dist
cd dist && npm publish --access public    # asks for your npm login
```

Then on npmjs.com, under **@datagripe/cli → Settings → Trusted
Publisher**, add a GitHub Actions publisher:

| Field | Value |
| --- | --- |
| Organization or user | `datagripe` |
| Repository | `datagripe` |
| Workflow filename | `release.yml` — note `.yml`, not `.yaml` |
| Environment | *(leave empty)* |

The workflow filename is matched **exactly**, extension included, and
npm cannot edit it afterwards — a wrong one has to be deleted and added
again. `release.yaml` for `release.yml` is a real hour lost, and so is
renaming the workflow later without updating the publisher.

What that failure looks like is the reason this paragraph is long. npm
reports it as:

```
npm error code ENEEDAUTH
npm error need auth You need to authorize this machine using `npm adduser`
```

which points at a missing token, and the token is not the problem. The
line that says what happened only appears with `--loglevel verbose`,
which the publish step now passes:

```
npm http fetch POST 404 .../oidc/token/exchange/package/@datagripe%2fcli
npm verbose oidc Failed token exchange request: OIDC token exchange error - package not found
```

"package not found" means no trusted publisher matched the claims —
organisation, repository, workflow filename, environment. It does not
mean the package is missing.

The other way to break it is to give `actions/setup-node` a
`registry-url`. That input writes an `.npmrc` with
`_authToken=${NODE_AUTH_TOKEN}` and exports a placeholder value for it —
and npm that finds a credential configured uses it instead of exchanging
the OIDC token. The publish then 404s, with nothing in the output saying
that trusted publishing never happened. The job sets up Node and no
registry for that reason.

Two npm-side settings are worth checking while you are there: the
`@datagripe` scope's packages must be **public** (the workflow passes
`--access public`, which only works if the org allows it), and if the
org requires 2FA for publishing, trusted publishing satisfies it — an
OIDC publish is not a token publish.

### GHCR: making the packages public

A package pushed by Actions is **private until somebody makes it
public**, and the first symptom is a `docker pull` that asks an
anonymous user to authenticate. After the first release, for both
`datagripe` (the image) and `charts/datagripe` (the chart):

**github.com/orgs/datagripe/packages → the package → Package settings**

- **Danger Zone → Change visibility → Public**
- **Manage Actions access** → add the `datagripe` repository with
  `Write`, so later releases can push to it

The image job derives its name from `github.repository` and the chart
job from `github.repository_owner`, so neither needs editing if the
repository moves again.

### Desktop updates

`apps/desktop/electrobun.config.ts` points the updater at
`github.com/datagripe/datagripe/releases/latest/download`. GitHub
redirects that URL after a repository transfer, so installed apps keep
updating across a move — but the config should be corrected anyway,
because a redirect is not a plan.

## When a release gets part way

Each registry is published by its own job, so a failure leaves some of
them done. The jobs are written to be repeatable for that reason —
`gh run rerun --failed <run-id>` picks up where it stopped, and the npm
step skips a version the registry already has rather than failing on it.

What is **not** repeatable is re-tagging: moving the tag re-runs
everything, and the image and chart tags would be overwritten with an
equivalent build while npm quietly no-ops. Re-tag only when the fix is
to the workflow itself and nothing has published yet.

If the `release` job is the one that failed and the artifacts are
already built, the fastest path is to finish by hand — the assets are on
the run:

```bash
for a in asset-web asset-desktop-linux-x64 asset-desktop-macos-arm64 asset-desktop-win-x64; do
  gh run download <run-id> --name "$a" --dir release-assets
done
gh release create v0.0.6 --title v0.0.6 --generate-notes release-assets/*
```

## Verifying a release

```bash
bunx @datagripe/cli@0.0.6 --version
docker run --rm ghcr.io/datagripe/datagripe:0.0.6 --version
helm show chart oci://ghcr.io/datagripe/charts/datagripe --version 0.0.6
```

All three come out of the same `bun run build:dist`, so a disagreement
between them is a build that went wrong rather than a version that was
mistyped.
