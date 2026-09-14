---
title: Deploying
description: Docker, compose, Kubernetes and Helm — all running the same image.
group: Running it for other people
order: 5
---

Four shapes, smallest first. All of them run the same server, take the
same [configuration](/docs/configuration/), and are built from the same
release.

| | State lives in | Accounts |
| --- | --- | --- |
| `bunx @datagripe/cli personal` | an embedded cluster under the data dir | off |
| `docker run … -v datagripe:/data` | the same, on a volume | off |
| compose | a PostgreSQL container beside it | on |
| Kubernetes, Helm | a StatefulSet or a managed database | on |

## Read this first

Two settings decide whether a deployment works, and neither has a
default that can be right everywhere.

**`WEB_ORIGIN` must be exactly the URL browsers use** — scheme, host, and
port if it is not the default. Both the HTTP routes and the WebSocket
upgrade compare against it, and everything in the app runs over that
socket. A mismatch is not a degradation, it is an app that loads and then
does nothing. It is the first thing to check.

**`CONNECTION_ENCRYPTION_KEY` is not recoverable.** Datasource passwords
in the application database are encrypted with it. A database backup
without the key is a backup of connections nobody can open. Store it
somewhere other than beside the backup.

## One container

```bash
docker run -p 3001:3001 -v datagripe:/data ghcr.io/datagripe/datagripe
```

Zero-config DataGripe: its own PostgreSQL under `/data`, no accounts. The
volume is not optional — without it a restart loses the database and the
generated key its stored passwords are encrypted with.

Publishing on any port other than 3001 means saying so:

```bash
docker run -p 8080:3001 -e WEB_ORIGIN=http://localhost:8080 \
  -v datagripe:/data ghcr.io/datagripe/datagripe
```

## Compose

```bash
curl -O https://raw.githubusercontent.com/datagripe/datagripe/main/deploy/compose.yaml
curl -o .env https://raw.githubusercontent.com/datagripe/datagripe/main/deploy/.env.example
$EDITOR .env
docker compose up -d
```

DataGripe on <http://localhost:3000>, a PostgreSQL beside it, and
accounts switched on — the first person to open it creates the first
one. The migration runs as a one-shot service before the app starts.

`POSTGRES_PASSWORD` is interpolated into a connection URL, so generate
that one with `openssl rand -hex 32`: a `/` or `+` from `openssl rand
-base64` would end the password early.

## Helm

```bash
helm install datagripe oci://ghcr.io/datagripe/charts/datagripe \
  --namespace datagripe --create-namespace \
  --set webOrigin=https://datagripe.example.com \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=datagripe.example.com
```

The chart is an OCI artifact published beside the image, so there is no
`helm repo add` and no index to go stale. Its version is DataGripe's
version: `--version 0.0.6` is the chart that installs `0.0.6`.

**A managed database** instead of the bundled StatefulSet — better
operated than one you now own:

```bash
--set postgresql.enabled=false \
--set database.url=postgres://user:password@db.example.com:5432/datagripe
```

**No database at all** — DataGripe runs the PostgreSQL it needs inside
the pod. One workload, one volume, strictly one replica:

```bash
--set database.mode=embedded \
--set postgresql.enabled=false \
--set persistence.enabled=true
```

The encryption key and session secret are generated on first install and
kept across upgrades, and their Secret is marked
`helm.sh/resource-policy: keep` so an accidental `helm uninstall` does not
take them. Back them up anyway, or set them yourself with
`--set secrets.existingSecret=…`.

## Plain Kubernetes

[`deploy/k8s`](https://github.com/datagripe/datagripe/tree/main/deploy/k8s)
is the same deployment as manifests meant to be read top to bottom rather
than parameterised: a Deployment with the migration as an init container,
a PostgreSQL StatefulSet, a Service, and an Ingress that is commented out
until you have a hostname.

```bash
$EDITOR deploy/k8s/secret.yaml      # the secrets
$EDITOR deploy/k8s/configmap.yaml   # WEB_ORIGIN
kubectl apply -k deploy/k8s
```

One replica. The migrations run in an init container, so two pods
starting at once would race to apply them — the loser crashes and
retries, which is untidy rather than harmful, but there is no reason to
invite it. Nothing else in DataGripe requires a single replica; sessions
live in the database.

## Ingress and websockets

DataGripe holds one WebSocket open per browser tab for as long as the tab
is open. ingress-nginx's default 60-second read timeout closes every one
of them a minute after it opens; the app reconnects, but a query in
flight does not survive it. The chart sets these already:

```
nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
nginx.ingress.kubernetes.io/proxy-body-size: 32m
```

## Migrations, backups, the audit log

A shared deployment does not migrate itself — that is the embedded
database's job — so the image has a second entry point:

```bash
docker run --rm -e APP_DATABASE_URL=… -e CONNECTION_ENCRYPTION_KEY=… \
  -e SESSION_SECRET=… ghcr.io/datagripe/datagripe migrate
```

Compose runs it as a one-shot service, Helm as a pre-install hook, the
plain manifests as an init container.

Backups, the audit log and the full production checklist are in
[docs/operations.md](https://github.com/datagripe/datagripe/blob/main/docs/operations.md).
