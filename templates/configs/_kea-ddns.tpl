{{- define "configs.kea.ddns" -}}
kea-dhcp-ddns.conf: |
  {
    "DhcpDdns": {
      "ip-address": "127.0.0.1",
      "port": 53001,
      "dns-server-timeout": 1000,
      "ncr-protocol": "UDP",
      "ncr-format": "JSON",
      "control-socket": {
        "socket-type": "unix",
        "socket-name": "/var/run/kea/kea-ddns-ctrl-socket"
      },
      "forward-ddns": {
        "ddns-domains": [{
          "name": "{{ .segment.zone.forward }}.",
          "key-name": "{{ .global.ddns.keyName }}",
          "dns-servers": [{
            "hostname": "",
            "ip-address": "127.0.0.1",
            "port": 5353
          }]
        }]
      },
      "reverse-ddns": {
        "ddns-domains": [{
          "name": "{{ .segment.zone.reverseV4 }}.",
          "key-name": "{{ .global.ddns.keyName }}",
          "dns-servers": [{
            "hostname": "",
            "ip-address": "127.0.0.1",
            "port": 5353
          }]
        }]
      },
      "tsig-keys": [{
        "name": "{{ .global.ddns.keyName }}",
        "algorithm": "hmac-sha256",
        "secret": "{{ .global.ddns.key }}"
      }],
      "loggers": [{
        "name": "kea-dhcp-ddns",
        "output_options": [{
          "output": "stdout"
        }],
        "severity": "DEBUG",
        "debuglevel": 0
      }]
    }
  }
{{- end -}}
