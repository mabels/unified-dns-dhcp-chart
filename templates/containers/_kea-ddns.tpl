{{- define "containers.kea.ddns" -}}
- name: kea-ddns
  image: {{ .images.keaDdns }}
  command: ["sh", "-c"]
  args:
  - |
    rm -f /var/run/kea/kea-dhcp-ddns.*.pid
    /usr/sbin/kea-dhcp-ddns -c /etc/kea/kea-dhcp-ddns.conf &
    KEA_PID=$!
    sleep 2
    chmod 777 /var/run/kea/kea-ddns-ctrl-socket 2>/dev/null || true
    wait $KEA_PID
  volumeMounts:
  - name: config
    mountPath: /etc/kea/kea-dhcp-ddns.conf
    subPath: kea-dhcp-ddns.conf
  {{- if and .stork.enabled .stork.agent.enabled }}
  - name: kea-sockets
    mountPath: /var/run/kea
  {{- end }}
{{- end -}}
