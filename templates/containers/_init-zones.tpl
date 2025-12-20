{{- define "containers.init.zones" -}}
- name: init-zones
  image: busybox
  command:
  - sh
  - -c
  - |
    set -e
    echo "Init zones: Checking for initial zone files..."

    # Copy initial zones (skipping existing)
    # The postStart hook will handle backup restore and static record merging
    for f in /config-init/*.zone; do
      [ ! -f "/zones/$(basename $f)" ] && cp "$f" /zones/ || true
    done

    echo "✓ Initial zones copied (if needed)"
    echo "Note: Backup restore and static record merge will be handled by postStart hook"
  volumeMounts:
  - name: zones
    mountPath: /zones
  - name: config
    mountPath: /config-init
{{- end -}}
