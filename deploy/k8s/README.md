# DataGripe on Kubernetes

Plain manifests for a small, single-replica deployment: DataGripe, the
PostgreSQL it keeps its own state in, and the configuration for both.
For anything you want to parameterise — several environments, a managed
database, an ingress per host — use the [Helm chart](../helm/datagripe)
instead; this directory is the version you can read top to bottom.

```bash
# 1. Fill in the secrets. Do not apply the file as it stands.
$EDITOR deploy/k8s/secret.yaml

# 2. Set WEB_ORIGIN to the URL browsers will actually use.
$EDITOR deploy/k8s/configmap.yaml

kubectl apply -k deploy/k8s
kubectl -n datagripe rollout status deploy/datagripe
```

Without an ingress, reach it with a port-forward:

```bash
kubectl -n datagripe port-forward svc/datagripe 3001:3001
```

— and note that this only works if `WEB_ORIGIN` is
`http://localhost:3001`, because the WebSocket upgrade compares the
browser's origin against it. Set the real hostname before you expose it
through `ingress.yaml`, which is commented out of `kustomization.yaml`
until you have one.

## What to know before this is production

- **`CONNECTION_ENCRYPTION_KEY` is not recoverable.** Datasource
  passwords in the database are encrypted with it; a database backup
  without the key cannot open them. Back it up separately.
- **One replica by default.** Startup and init-container migrations share
  an advisory lock, so concurrent starts do not apply files twice. Keep
  one writer for an embedded database or a shared local data volume;
  sessions themselves live in the database.
- **`NODE_ENV: production` needs HTTPS.** It puts `Secure` on the session
  cookie, which a browser will not send back over plain http. It is set
  in `configmap.yaml` because that is where a real deployment ends up;
  if you are port-forwarding to try it out, change it to `development`.
- **`/data` is an `emptyDir`.** In external mode the only thing under it
  is git datasource clones, which are re-cloneable. Give it a
  PersistentVolumeClaim if you enable git datasources and would rather
  not re-clone after a restart — and you must give it one if you switch
  to the embedded database, which is what `/data` is really for.
- **Host filesystem access is off** (`HOST_FS_DISABLED`), which is the
  right default when the person pressing the button does not own the
  disk. See [docs/operations.md](../../docs/operations.md).
