{{- define "datagripe.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "datagripe.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "datagripe.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "datagripe.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "datagripe.selectorLabels" -}}
app.kubernetes.io/name: {{ include "datagripe.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "datagripe.postgresFullname" -}}
{{- printf "%s-postgresql" (include "datagripe.fullname" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "datagripe.image" -}}
{{- printf "%s:%s" .Values.image.repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}

{{/*
Secrets are generated once and then kept. `lookup` reads back what the
previous release wrote, so an upgrade that does not name them does not
silently rotate CONNECTION_ENCRYPTION_KEY — which would orphan every
datasource password in the database rather than merely signing people out.
*/}}
{{- define "datagripe.keptSecret" -}}
{{- $existing := (lookup "v1" "Secret" .ctx.Release.Namespace .name) -}}
{{- if and $existing (index $existing.data .key) -}}
{{- index $existing.data .key | b64dec -}}
{{- else -}}
{{- .default -}}
{{- end -}}
{{- end -}}

{{/*
Every environment variable the server reads, shared by the Deployment and
the migration Job so that the two cannot drift.
*/}}
{{- define "datagripe.env" -}}
- name: WEB_ORIGIN
  value: {{ required "webOrigin is required: DataGripe compares it against the browser's Origin on every WebSocket upgrade" .Values.webOrigin | quote }}
- name: NODE_ENV
  value: {{ .Values.nodeEnv | quote }}
- name: ALLOW_SIGNUP
  value: {{ .Values.allowSignup | quote }}
- name: HOST_FS_DISABLED
  value: {{ .Values.hostFsDisabled | quote }}
{{- if eq .Values.database.mode "embedded" }}
- name: DATABASE_MODE
  value: embedded
{{- else }}
- name: APP_DATABASE_URL
  valueFrom:
    secretKeyRef:
      {{- if .Values.database.existingSecret }}
      name: {{ .Values.database.existingSecret }}
      key: {{ .Values.database.existingSecretKey }}
      {{- else }}
      name: {{ include "datagripe.fullname" . }}-secrets
      key: APP_DATABASE_URL
      {{- end }}
{{- end }}
- name: CONNECTION_ENCRYPTION_KEY
  valueFrom:
    secretKeyRef:
      name: {{ .Values.secrets.existingSecret | default (printf "%s-secrets" (include "datagripe.fullname" .)) }}
      key: CONNECTION_ENCRYPTION_KEY
- name: SESSION_SECRET
  valueFrom:
    secretKeyRef:
      name: {{ .Values.secrets.existingSecret | default (printf "%s-secrets" (include "datagripe.fullname" .)) }}
      key: SESSION_SECRET
{{- with .Values.extraEnv }}
{{ toYaml . }}
{{- end }}
{{- end -}}
