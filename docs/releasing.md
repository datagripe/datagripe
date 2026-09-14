# Releasing

A release is a tag. Pushing `v*` builds and publishes everything
DataGripe ships, from one commit:

| Artefact | Where it lands |
| --- | --- |
| `@datagripe/cli` | npm, published with provenance |
| `ghcr.io/datagripe/datagripe` | GHCR, `linux/amd64` and `linux/arm64` |
| `oci://ghcr.io/datagripe/charts/datagripe` | GHCR, the Helm chart |
| Web bundle, desktop builds for three platforms | GitHub release assets |

```bash
# 1. Version everything that carries one.
$EDITOR package.json apps/*/package.json packages/*/package.json
$EDITOR deploy/helm/datagripe/Chart.yaml    # version and appVersion

# 2. Move the CHANGELOG's Unreleased section under the new heading.
$EDITOR CHANGELOG.md

git commit -am "release 0.0.6"
git tag v0.0.6
git push origin main --tags
```

The npm job refuses to publish if the tag and `dist/package.json`
disagree, which is the check that catches a forgotten version bump. The
chart's two versions are overwritten from the tag at package time, so
the ones in `Chart.yaml` only matter to somebody installing from a
checkout — keep them current anyway.

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
| Workflow filename | `release.yml` |
| Environment | *(leave empty)* |

The workflow filename is matched exactly, so **renaming
`.github/workflows/release.yml` breaks publishing** until the trusted
publisher is updated to match. The failure is a 403 at the publish step,
which does not obviously say that, hence this paragraph.

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

## Verifying a release

```bash
bunx @datagripe/cli@0.0.6 --version
docker run --rm ghcr.io/datagripe/datagripe:0.0.6 --version
helm show chart oci://ghcr.io/datagripe/charts/datagripe --version 0.0.6
```

All three come out of the same `bun run build:dist`, so a disagreement
between them is a build that went wrong rather than a version that was
mistyped.
