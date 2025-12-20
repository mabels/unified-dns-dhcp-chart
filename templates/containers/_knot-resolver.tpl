{{- define "containers.knot.resolver" -}}
- name: knot-resolver
  image: {{ .images.knotResolver }}
  command: ["sh", "-c"]
  args:
  - |
    exec /usr/sbin/kresd -c /etc/knot-resolver/kresd.conf -n
  ports:
  - containerPort: 53
    protocol: UDP
    name: dns-udp
  - containerPort: 53
    protocol: TCP
    name: dns-tcp
  - containerPort: 8453
    protocol: TCP
    name: metrics
  volumeMounts:
  - name: config
    mountPath: /etc/knot-resolver/kresd.conf
    subPath: kresd.conf
{{- end -}}
