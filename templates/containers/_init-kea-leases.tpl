{{- define "containers.init.kea-leases" -}}
- name: init-kea-leases
  image: busybox
  command:
  - sh
  - -c
  - |
    echo "Init kea-leases: Checking for backup restore..."
    if [ -f /var/lib/kea/kea-leases.tar.gz ]; then
      echo "Found kea-leases backup, restoring..."
      cd /var/lib/kea
      tar xzf kea-leases.tar.gz
      rm -f kea-leases.tar.gz
      echo "✓ Kea leases restored from backup"
    fi
    echo "✓ Kea leases initialized"
  volumeMounts:
  - name: kea-leases
    mountPath: /var/lib/kea
{{- end -}}
