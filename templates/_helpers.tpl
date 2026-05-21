{{/*
Full resource name for a segment.
Usage: {{ include "technicum.name" . }}  where . is the segment dict
*/}}
{{- define "technicum.name" -}}
unified-dns-dhcp-{{ .name }}
{{- end -}}
