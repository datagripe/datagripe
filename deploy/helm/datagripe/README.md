# DataGripe Helm chart

```bash
helm install datagripe oci://ghcr.io/datagripe/charts/datagripe \
  --namespace datagripe --create-namespace \
  --set webOrigin=https://datagripe.example.com \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=datagripe.example.com
```

That installs DataGripe, a PostgreSQL StatefulSet for its own state, and
a pre-install Job that migrates the schema. The encryption key and
session secret are generated on first install and kept across upgrades.

The chart is an OCI artifact beside the image it runs, so there is no
`helm repo add` — the URL above is the chart. `--version` pins it, and
its versions are DataGripe's: the chart has no lifecycle of its own, so
`0.0.6` is the chart that installs `0.0.6`.

From a checkout, `deploy/helm/datagripe` works as a path in place of the
`oci://` URL.

## The one value with no default

`webOrigin` — the exact URL browsers use, scheme and port included.
DataGripe compares it against the browser's `Origin` header on every
WebSocket upgrade, so a mismatch is an app that loads and then never
connects. Nothing can guess it, so the chart refuses to render without
it.

For a port-forward rather than an ingress, that means
`--set webOrigin=http://localhost:3001 --set nodeEnv=development` —
`production` marks the session cookie `Secure`, and a browser will not
send a `Secure` cookie back over plain http.

## Shapes

**A managed database** — better operated than a StatefulSet you now own:

```bash
--set postgresql.enabled=false \
--set database.url=postgres://user:password@db.example.com:5432/datagripe
```

Or keep the URL out of your shell history with
`--set database.existingSecret=my-secret`.

**No database at all** — DataGripe runs the PostgreSQL it needs itself,
inside the same pod. One workload, one volume, strictly one replica:

```bash
--set database.mode=embedded \
--set postgresql.enabled=false \
--set persistence.enabled=true
```

**Your own secrets**, from a secret manager rather than generated:

```bash
--set secrets.existingSecret=datagripe-secrets
```

holding `CONNECTION_ENCRYPTION_KEY` and `SESSION_SECRET`.

## Before this holds anything you would miss

`CONNECTION_ENCRYPTION_KEY` encrypts datasource passwords in the
database, and there is no recovering them without it. The chart generates
one and marks the Secret `helm.sh/resource-policy: keep` so an accidental
`helm uninstall` does not take it — but back it up, or set it yourself,
rather than relying on that.

Everything else — backups, the audit log, the production checklist, and
the switches for host filesystem access and git — is in
[docs/operations.md](../../../docs/operations.md). Values the chart does
not name go in `extraEnv`; the full list is in
[.env.example](../../../.env.example).

## Values

| Key | Default | |
| --- | --- | --- |
| `webOrigin` | — | **Required.** The origin browsers use |
| `replicaCount` | `1` | See the note in `values.yaml` before raising it |
| `nodeEnv` | `production` | `production` marks the session cookie `Secure` |
| `allowSignup` | `false` | The first account may always sign up |
| `hostFsDisabled` | `true` | No export to disk, no datasource paths, no git |
| `image.repository` | `ghcr.io/datagripe/datagripe` | |
| `image.tag` | `""` | Defaults to the chart's `appVersion` |
| `database.mode` | `external` | or `embedded` |
| `database.url` | `""` | Needed when `postgresql.enabled` is false |
| `database.existingSecret` | `""` | Holds `APP_DATABASE_URL` |
| `secrets.existingSecret` | `""` | Holds the encryption key and session secret |
| `postgresql.enabled` | `true` | The bundled StatefulSet |
| `postgresql.persistence.size` | `10Gi` | |
| `persistence.enabled` | `false` | `/data`; required for embedded mode |
| `migrations.enabled` | `true` | pre-install/pre-upgrade Job |
| `service.port` | `3001` | |
| `ingress.enabled` | `false` | Annotations default to ingress-nginx's |
| `extraEnv` | `[]` | Anything in `.env.example` |

`values.yaml` is commented; read it for the rest.
