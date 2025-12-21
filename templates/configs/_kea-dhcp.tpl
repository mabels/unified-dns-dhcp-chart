{{- define "configs.kea.dhcp4" -}}
kea-dhcp4.conf: |
  {
    "Dhcp4": {
      "interfaces-config": {
        "interfaces": ["net1"]
      },
      "control-socket": {
        "socket-type": "http",
        "socket-address": "0.0.0.0",
        "socket-port": 8000
      },
      "hooks-libraries": [
        {
          "library": "/usr/lib/kea/hooks/libdhcp_lease_cmds.so"
        },
        {
          "library": "/usr/lib/kea/hooks/libdhcp_stat_cmds.so"
        }
      ],
      "lease-database": {
        "type": "memfile",
        "persist": true,
        "name": "/var/lib/kea/dhcp4.leases"
      },
      "valid-lifetime": 3600,
      "subnet4": [{
        "id": {{ .segment.name }},
        "subnet": "{{ .segment.ipv4.subnet }}",
        "pools": [{
          "pool": "{{ .segment.ipv4.range.start }} - {{ .segment.ipv4.range.end }}"
        }],
        {{- if .segment.staticLeases }}
        "reservations": [
          {{- $segmentStaticLeases := .segment.staticLeases }}
          {{- range $index, $lease := $segmentStaticLeases }}
          {
            "hw-address": "{{ $lease.macAddress }}",
            "ip-address": "{{ $lease.address }}"
            {{- if $lease.hostname }},
            "hostname": "{{ $lease.hostname }}"
            {{- end }}
            {{- if $lease.clientId }},
            "client-id": "{{ $lease.clientId }}"
            {{- end }}
          }{{ if ne (len $segmentStaticLeases) (add $index 1) }},{{ end }}
          {{- end }}
        ],
        {{- end }}
        "option-data": [
          {
            "name": "routers",
            "data": "{{ .segment.ipv4.gateway }}"
          },
          {
            "name": "domain-name-servers",
            "data": "{{ .segment.ipv4.dns }}"
          },
          {
            "name": "domain-name",
            "data": "{{ .segment.zone.forward }}"
          }
        ],
        "ddns-qualifying-suffix": "{{ .segment.zone.forward }}",
        "ddns-send-updates": true,
        "ddns-override-no-update": true,
        "ddns-override-client-update": true,
        "ddns-replace-client-name": "when-not-present",
        "ddns-generated-prefix": "myhost",
        "hostname-char-set": "[^A-Za-z0-9.-]",
        "hostname-char-replacement": "-"
      }],
      "dhcp-ddns": {
        "enable-updates": true,
        "server-ip": "127.0.0.1",
        "server-port": 53001,
        "sender-ip": "",
        "sender-port": 0,
        "max-queue-size": 1024,
        "ncr-protocol": "UDP",
        "ncr-format": "JSON"
      },
      "loggers": [{
        "name": "kea-dhcp4",
        "output_options": [{
          "output": "stdout"
        }],
        "severity": "INFO",
        "debuglevel": 0
      }]
    }
  }
{{- end -}}
