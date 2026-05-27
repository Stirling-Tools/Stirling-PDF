{{/* Resolve the Valkey URL - bundled vs. external bring-your-own.
  Bundled path uses ${REDIS_PASSWORD} (shell expansion at Spring Boot startup) so the
  password is never written into the rendered manifest or K8s events.
*/}}
{{- define "stirling-pdf.valkeyUrl" -}}
{{- if and .Values.cluster.enabled .Values.cluster.valkey.bundled -}}
redis://:${REDIS_PASSWORD}@{{ .Release.Name }}-valkey:6379
{{- else if .Values.cluster.valkey.externalUrl -}}
{{ .Values.cluster.valkey.externalUrl }}
{{- else if .Values.cluster.enabled -}}
{{ fail "cluster.valkey.bundled=false requires cluster.valkey.externalUrl to be set (e.g. rediss://user:pw@host:6379)" }}
{{- end -}}
{{- end -}}
