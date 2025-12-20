{{- define "containers.unbound" -}}
- name: unbound
  image: {{ .images.unbound }}
  command: ["sh", "-c"]
  args:
  - |
    exec unbound -d -c /etc/unbound/unbound.conf
  ports:
  - containerPort: 53
    protocol: UDP
    name: dns-udp
  - containerPort: 53
    protocol: TCP
    name: dns-tcp
  - containerPort: 8953
    protocol: TCP
    name: control
  volumeMounts:
  - name: config
    mountPath: /etc/unbound/unbound.conf
    subPath: unbound.conf
  - name: unbound-data
    mountPath: /var/lib/unbound
{{- end -}}
