{{- define "containers.kea.ctrl-agent" -}}
- name: kea-ctrl-agent
  image: ghcr.io/mabels/kea-dhcp-dns/kea-ctrl-agent:latest
  command: ["/usr/sbin/kea-ctrl-agent"]
  args: ["-c", "/etc/kea/kea-ctrl-agent.conf"]
  ports:
  - containerPort: 8000
    name: ctrl-agent
    protocol: TCP
  volumeMounts:
  - name: config
    mountPath: /etc/kea/kea-ctrl-agent.conf
    subPath: kea-ctrl-agent.conf
  - name: kea-sockets
    mountPath: /var/run/kea
{{- end -}}
