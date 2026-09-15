---
title: Kubernetes
description: A Helm chart addressed by URL, or manifests meant to be read — plus the ingress setting that closes every websocket.
group: Deploy
order: 5
---

Two shapes, the same deployment. The chart if you want it parameterised,
the manifests if you would rather read a deployment than configure one.

## Helm

```bash
helm install datagripe oci://ghcr.io/datagripe/charts/datagripe \
  --namespace datagripe --create-namespace \
  --set webOrigin=https://datagripe.example.com \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=datagripe.example.com
```

The chart is an OCI artifact published beside the image, so there is no
`helm repo add` and no `index.yaml` to go stale. Its version is
DataGripe's version: `--version <!--dg:version-->` is the chart that
installs `<!--dg:version-->`.

### A managed database

Better operated than one you now own:

```bash
--set postgresql.enabled=false \
--set database.url=postgres://user:password@db.example.com:5432/datagripe
```

### No database at all

DataGripe runs the PostgreSQL it needs inside the pod. One workload, one
volume, strictly one replica:

```bash
--set database.mode=embedded \
--set postgresql.enabled=false \
--set persistence.enabled=true
```

### Secrets

The encryption key and the session secret are generated on first install
and kept across upgrades. Their Secret is marked
`helm.sh/resource-policy: keep`, so an accidental `helm uninstall` does
not take them with it.

Back them up anyway, or set them yourself:

```bash
--set secrets.existingSecret=datagripe-secrets
```

Losing `CONNECTION_ENCRYPTION_KEY` does not sign anyone out. It orphans
every datasource password in the database, permanently.

## Plain manifests

[`deploy/k8s`](https://github.com/datagripe/datagripe/tree/main/deploy/k8s)
is the same deployment written to be read top to bottom rather than
parameterised: a Deployment with the migration as an init container, a
PostgreSQL StatefulSet, a Service, and an Ingress commented out until you
have a hostname.

```bash
$EDITOR deploy/k8s/secret.yaml      # the secrets
$EDITOR deploy/k8s/configmap.yaml   # WEB_ORIGIN
kubectl apply -k deploy/k8s
```

## One replica

The migrations run in an init container, so two pods starting at once
would race to apply them. The loser crashes and retries, which is untidy
rather than harmful — but there is no reason to invite it.

Nothing else in DataGripe requires a single replica. Sessions live in the
database, not in the pod.

## Ingress and websockets

This is the setting that breaks a Kubernetes deployment in a way nothing
else explains.

DataGripe holds **one WebSocket open per browser tab**, for as long as
the tab is open. ingress-nginx's default 60-second read timeout closes
every one of them a minute after it opens. The app reconnects, so it
looks like an intermittent glitch rather than a configuration error — but
a query in flight does not survive it.

The chart sets these already. If you are writing your own ingress, set
them too:

```
nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
nginx.ingress.kubernetes.io/proxy-body-size: 32m
```

Other ingress controllers have their own equivalent. The requirement is
the same: a long-lived upgraded connection, and a body size that fits an
import.

## `WEB_ORIGIN`

The exact origin browsers use — which behind an ingress is the ingress
hostname and scheme, not the Service and not the pod. Both the HTTP
routes and the WebSocket upgrade compare against it, so a mismatch is an
app that loads and then does nothing at all.

Set `NODE_ENV=production` alongside it once that origin is `https://`.

## Related

- [Upgrading](/docs/upgrading/) — the migration hook, and what to do
  when it fails.
- [Security](/docs/security/) — what to switch off for a shared
  deployment.
- [Configuration](/docs/configuration/) — every variable, a page per decision.
