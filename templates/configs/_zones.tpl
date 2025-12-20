{{- define "configs.zone.forward" -}}
{{ .segment.zone.forward }}.zone: |
  $ORIGIN {{ .segment.zone.forward }}.
  $TTL 3600
  @   IN  SOA ns1.{{ .segment.zone.forward }}. admin.{{ .segment.zone.forward }}. (
              2025111401  ; Serial
              3600        ; Refresh
              1800        ; Retry
              604800      ; Expire
              86400 )     ; Minimum TTL
  @   IN  NS  ns1.{{ .segment.zone.forward }}.
  ns1 IN  A   {{ .segment.ipv4.dns }}
  {{- range .segment.staticRecords }}
  {{ . }}
  {{- end }}
{{- end -}}

{{- define "configs.zone.reverseV4" -}}
{{ .segment.zone.reverseV4 }}.zone: |
  $ORIGIN {{ .segment.zone.reverseV4 }}.
  $TTL 3600
  @   IN  SOA ns1.{{ .segment.zone.forward }}. admin.{{ .segment.zone.forward }}. (
              2025111401  ; Serial
              3600        ; Refresh
              1800        ; Retry
              604800      ; Expire
              86400 )     ; Minimum TTL
  @   IN  NS  ns1.{{ .segment.zone.forward }}.
  {{- $forwardZone := .segment.zone.forward }}
  {{- $reverseZone := .segment.zone.reverseV4 }}
  {{- range .segment.staticRecords }}
  {{- if contains " IN A " . }}
  {{ include "dns.to.reverse" (dict "record" . "zone" $forwardZone "reverseZone" $reverseZone) -}}
  {{- end }}
  {{- end }}
{{- end -}}

{{- define "configs.zone.reverseV6" -}}
{{- if .segment.zone.reverseV6 }}
{{ .segment.zone.reverseV6 }}.zone: |
  $ORIGIN {{ .segment.zone.reverseV6 }}.
  $TTL 3600
  @   IN  SOA ns1.{{ .segment.zone.forward }}. admin.{{ .segment.zone.forward }}. (
              2025111401  ; Serial
              3600        ; Refresh
              1800        ; Retry
              604800      ; Expire
              86400 )     ; Minimum TTL
  @   IN  NS  ns1.{{ .segment.zone.forward }}.
  {{- $forwardZone := .segment.zone.forward }}
  {{- $reverseZone := .segment.zone.reverseV6 }}
  {{- range .segment.staticRecords }}
  {{- if contains " IN AAAA " . }}
  {{ include "dns.to.reverse" (dict "record" . "zone" $forwardZone "reverseZone" $reverseZone) -}}
  {{- end }}
  {{- end }}
{{- end }}
{{- end -}}
