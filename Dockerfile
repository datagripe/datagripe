# syntax=docker/dockerfile:1
#
# The DataGripe server and the web app it serves, in one image.
#
# It is built from `dist/` — the same checkout-free distribution the npm
# package `@datagripe/cli` is made of (`scripts/packaging/build.ts`) — so the
# container and `bunx @datagripe/cli` run identical code and take the same
# environment variables. `bin/datagripe.mjs` is the entry point in both.
#
#   docker run -p 3001:3001 -v datagripe:/data ghcr.io/datagripe/datagripe
#
# is a working DataGripe with no configuration: it starts its own
# PostgreSQL under /data and runs direct-in, with no accounts. Set
# APP_DATABASE_URL to point it at a PostgreSQL you manage instead — see
# deploy/ for compose, Kubernetes and Helm.

ARG BUN_VERSION=1.4.0

# ---- build -----------------------------------------------------------
FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /src

# Manifests before sources: installing dependencies is the slow layer and
# it should only be invalidated by a package.json or the lockfile.
COPY package.json bun.lock ./
COPY apps/desktop/package.json apps/desktop/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
COPY packages/database-adapters/package.json packages/database-adapters/
COPY packages/gripes/package.json packages/gripes/
COPY packages/sql-tools/package.json packages/sql-tools/
# --ignore-scripts because the one lifecycle script that matters here
# downloads 60MB of PostgreSQL binaries for the embedded cluster, and
# building the distribution never starts one. The runtime stage installs
# them properly.
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
RUN bun run build:dist

# ---- runtime dependencies --------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS deps
WORKDIR /app
COPY --from=build /src/dist/package.json ./package.json
# Drop the package's own optional dependency — the copy of Bun it offers
# people who have none, which this image already is — by name rather than
# with `--omit=optional`, which would also drop `embedded-postgres`'s
# per-platform binaries and leave the embedded cluster unable to start.
#
# What remains is `embedded-postgres`, whose postinstall resolves the
# symlinks its shared libraries are reached through; the generated
# package.json lists it as trusted so `bun install` actually runs it.
RUN bun --eval "const p = await Bun.file('package.json').json(); delete p.optionalDependencies; await Bun.write('package.json', JSON.stringify(p, null, 2))" \
	&& bun install --production

# ---- runtime ---------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS runtime

# git is not for the build — it is a feature. Git datasources and the
# domain export's commit controls (GIT_ENABLED, off by default) shell out
# to it, and openssh-client is how it reaches a private remote. Neither
# runs until a deployment turns them on.
RUN apt-get update \
	&& apt-get install --no-install-recommends -y git openssh-client \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /src/dist/ ./

# Everything that must outlive the container: the embedded cluster, the
# secrets generated beside it, and any repositories cloned for a git
# datasource. Mount a volume here — without one, an embedded deployment
# loses its database, and with it the key its connection passwords are
# encrypted with.
ENV DATAGRIPE_DATA_DIR=/data
RUN mkdir -p /data && chown bun:bun /data
VOLUME /data

# Never root: the embedded PostgreSQL refuses to run as root, and nothing
# else here needs to be.
USER bun

# WEB_ORIGIN defaults to http://localhost:<PORT>, which is right for
# `docker run -p 3001:3001` and wrong for every other mapping and every
# proxy — the WebSocket upgrade rejects an origin that does not match.
ENV PORT=3001
EXPOSE 3001

# Longer start period than interval: first boot in embedded mode runs
# initdb before it listens.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
	CMD bun --eval "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"

# `docker run <image> migrate` applies migrations to APP_DATABASE_URL and
# exits — what the compose one-shot and the Kubernetes init container run.
ENTRYPOINT ["bun", "run", "/app/bin/datagripe.mjs"]
