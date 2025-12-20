{{- define "configs.bind" -}}
bind.conf: |
  options {
    directory "/var/lib/bind/zones";
    listen-on port {{ .global.authDNS.port }} { any; };
    listen-on-v6 port {{ .global.authDNS.port }} { any; };
    allow-query { any; };
    recursion no;
    dnssec-validation no;
  };

  controls {
    inet 127.0.0.1 port 953 allow { 127.0.0.1; };
  };

  key "{{ .global.ddns.keyName }}" {
    algorithm hmac-sha256;
    secret "{{ .global.ddns.key }}";
  };

  zone "{{ .segment.zone.forward }}" {
    type primary;
    file "{{ .segment.zone.forward }}.zone";
    allow-update { key "{{ .global.ddns.keyName }}"; };
  };

  zone "{{ .segment.zone.reverseV4 }}" {
    type primary;
    file "{{ .segment.zone.reverseV4 }}.zone";
    allow-update { key "{{ .global.ddns.keyName }}"; };
  };
  {{- if .segment.zone.reverseV6 }}

  zone "{{ .segment.zone.reverseV6 }}" {
    type primary;
    file "{{ .segment.zone.reverseV6 }}.zone";
    allow-update { key "{{ .global.ddns.keyName }}"; };
  };
  {{- end }}
{{- end -}}
