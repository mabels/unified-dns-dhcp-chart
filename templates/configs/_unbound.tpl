{{- define "configs.unbound" -}}
unbound.conf: |
  server:
      # Network interfaces
      interface: {{ .segment.ipv4.dns }}
      interface: {{ .segment.ipv6.dns }}
      interface: 127.0.0.1@200

      # Access control
      access-control: 0.0.0.0/0 allow
      access-control: ::/0 allow

      # Allow querying localhost for stub zones
      do-not-query-localhost: no

      # Disable default blocking of private address reverse zones (RFC 1918)
      # This allows forward-zones for reverse DNS to work
      unblock-lan-zones: yes
      insecure-lan-zones: yes

      # DNSSEC
      auto-trust-anchor-file: "/var/lib/unbound/root.key"

      # Mark local zones as insecure (no DNSSEC validation)
      domain-insecure: "{{ .segment.zone.forward }}"
      domain-insecure: "{{ .segment.zone.reverseV4 }}"
      {{- if .segment.zone.reverseV6 }}
      domain-insecure: "{{ .segment.zone.reverseV6 }}"
      {{- end }}

      # Performance
      num-threads: 2
      msg-cache-size: 50m
      rrset-cache-size: 100m
      cache-min-ttl: 60
      cache-max-ttl: 86400

      # Privacy
      hide-identity: yes
      hide-version: yes

      # Logging
      verbosity: 1
      logfile: ""

      # Fix buffer warnings - use system defaults
      so-sndbuf: 0
      so-rcvbuf: 0

      # Statistics (without remote-control)
      statistics-interval: 0
      extended-statistics: no
      statistics-cumulative: no

  # Remote control disabled (requires SSL certs)
  remote-control:
      control-enable: no

  # Forward zones for local authoritative DNS (using forward instead of stub for better local zone handling)
  forward-zone:
      name: "{{ .segment.zone.forward }}"
      forward-addr: {{ .global.authDNS.service }}@{{ .global.authDNS.port }}

  forward-zone:
      name: "{{ .segment.zone.reverseV4 }}"
      forward-addr: {{ .global.authDNS.service }}@{{ .global.authDNS.port }}

  {{- if .segment.zone.reverseV6 }}
  forward-zone:
      name: "{{ .segment.zone.reverseV6 }}"
      forward-addr: {{ .global.authDNS.service }}@{{ .global.authDNS.port }}
  {{- end }}

  {{- if .global.upstreamDNS }}
  # Forward all other queries to upstream DNS
  forward-zone:
      name: "."
      {{- range .global.upstreamDNS }}
      forward-addr: {{ . }}
      {{- end }}
  {{- end }}
{{- end -}}
