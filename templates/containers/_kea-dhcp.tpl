{{- define "containers.kea.dhcp4" -}}
- name: kea-dhcp4
  image: {{ .images.keaDhcp }}
  command: ["sh", "-c"]
  args:
  - |
    rm -f /var/run/kea/kea-dhcp4.*.pid
    /usr/sbin/kea-dhcp4 -c /etc/kea/kea-dhcp4.conf &
    KEA_PID=$!
    sleep 2
    chmod 777 /var/run/kea/kea4-ctrl-socket 2>/dev/null || true
    wait $KEA_PID
  securityContext:
    capabilities:
      add: ["NET_RAW", "NET_ADMIN"]
  lifecycle:
    postStart:
      exec:
        command:
        - /bin/sh
        - /config/restore-kea-leases.sh
  volumeMounts:
  - name: config
    mountPath: /etc/kea/kea-dhcp4.conf
    subPath: kea-dhcp4.conf
  - name: config
    mountPath: /config/restore-kea-leases.sh
    subPath: restore-kea-leases.sh
  - name: kea-leases
    mountPath: /var/lib/kea
  {{- if and .stork.enabled .stork.agent.enabled }}
  - name: kea-sockets
    mountPath: /var/run/kea
  {{- end }}
{{- end -}}
