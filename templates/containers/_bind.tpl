{{- define "containers.bind.auth" -}}
- name: bind-auth
  image: {{ .images.bind }}
  command: ["/usr/sbin/named"]
  args: ["-c", "/etc/bind/named.conf", "-g"]
  ports:
  - containerPort: 5353
    protocol: UDP
    name: auth-dns-udp
  - containerPort: 5353
    protocol: TCP
    name: auth-dns-tcp
  volumeMounts:
  - name: config
    mountPath: /etc/bind/named.conf
    subPath: bind.conf
  - name: zones
    mountPath: /var/lib/bind/zones
{{- end -}}
