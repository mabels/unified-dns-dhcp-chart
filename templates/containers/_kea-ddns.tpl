{{- define "containers.kea.ddns" -}}
- name: kea-ddns
  image: {{ .images.keaDdns }}
  command: ["sh", "-c"]
  args:
  - |
    rm -f /var/run/kea/kea-dhcp-ddns.*.pid
    exec /usr/sbin/kea-dhcp-ddns -c /etc/kea/kea-dhcp-ddns.conf
  volumeMounts:
  - name: config
    mountPath: /etc/kea/kea-dhcp-ddns.conf
    subPath: kea-dhcp-ddns.conf
{{- end -}}
