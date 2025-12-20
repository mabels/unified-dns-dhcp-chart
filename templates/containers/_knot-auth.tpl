{{- define "containers.knot.auth" -}}
- name: knot-auth
  image: {{ .images.knotAuth }}
  command: ["/usr/sbin/knotd"]
  args: ["-c", "/etc/knot/knot.conf"]
  ports:
  - containerPort: 5353
    protocol: UDP
    name: auth-dns-udp
  - containerPort: 5353
    protocol: TCP
    name: auth-dns-tcp
  lifecycle:
    postStart:
      exec:
        command:
        - /bin/sh
        - /config/restore-and-merge-zones.sh
  volumeMounts:
  - name: config
    mountPath: /etc/knot/knot.conf
    subPath: knot.conf
  - name: config
    mountPath: /config/restore-and-merge-zones.sh
    subPath: restore-and-merge-zones.sh
  - name: zones
    mountPath: /var/lib/knot/zones
{{- end -}}
