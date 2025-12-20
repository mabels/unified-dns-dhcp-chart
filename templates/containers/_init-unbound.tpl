{{- define "containers.init.unbound" -}}
- name: init-unbound
  image: {{ .images.unbound }}
  command: ['sh', '-c']
  args:
  - |
    # Create unbound directories
    mkdir -p /var/lib/unbound
    # Initialize trust anchor if it doesn't exist
    if [ ! -f /var/lib/unbound/root.key ]; then
      unbound-anchor -a /var/lib/unbound/root.key || true
    fi
  volumeMounts:
  - name: unbound-data
    mountPath: /var/lib/unbound
{{- end -}}
