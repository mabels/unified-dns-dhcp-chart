{{- define "configs.kea.ctrl-agent" -}}
kea-ctrl-agent.conf: |
  {
    "Control-agent": {
      "http-host": "0.0.0.0",
      "http-port": 8000,
      "control-sockets": {
        "dhcp4": {
          "socket-type": "unix",
          "socket-name": "/var/run/kea/kea4-ctrl-socket"
        },
        "d2": {
          "socket-type": "unix",
          "socket-name": "/var/run/kea/kea-ddns-ctrl-socket"
        }
      },
      "loggers": [{
        "name": "kea-ctrl-agent",
        "output_options": [{
          "output": "stdout"
        }],
        "severity": "INFO",
        "debuglevel": 0
      }]
    }
  }
{{- end -}}
