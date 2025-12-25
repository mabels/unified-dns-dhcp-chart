{{- define "configs.knot" -}}
knot.conf: |
  server:
    listen: "0.0.0.0@5353"
    listen: "::@5353"

  log:
    - target: stdout
      any: info

  database:
    storage: "/var/lib/knot/zones"

  control:
    listen: knot.sock

  key:
    - id: {{ .global.ddns.keyName }}
      algorithm: hmac-sha256
      secret: {{ .global.ddns.key | quote }}

  acl:
    - id: ddns_acl
      address: ["127.0.0.1"]
      action: update
      key: {{ .global.ddns.keyName }}

    - id: transfer_acl
      address: [{{- range $i, $net := .global.authDNS.allowTransfer }}{{- if $i }}, {{ end }}{{ $net | quote }}{{- end }}]
      action: transfer

  zone:
    - domain: {{ .segment.zone.forward  | quote }}
      storage: "/var/lib/knot/zones"
      file: "{{ .segment.zone.forward }}.zone"
      acl: [ddns_acl, transfer_acl]
      journal-content: all
      zonefile-sync: 0
      zonefile-load: difference

    - domain: {{ .segment.zone.reverseV4 | quote  }}
      storage: "/var/lib/knot/zones"
      file: "{{ .segment.zone.reverseV4 }}.zone"
      acl: [ddns_acl, transfer_acl]
      journal-content: all
      zonefile-sync: 0
      zonefile-load: difference
    {{- if .segment.zone.reverseV6 }}

    - domain: {{ .segment.zone.reverseV6 | quote  }}
      storage: "/var/lib/knot/zones"
      file: "{{ .segment.zone.reverseV6 }}.zone"
      acl: [ddns_acl, transfer_acl]
      journal-content: all
      zonefile-sync: 0
      zonefile-load: difference
    {{- end }}
{{- end -}}
