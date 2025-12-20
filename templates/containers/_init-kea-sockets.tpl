{{- define "containers.init.kea-sockets" -}}
- name: init-kea-sockets
  image: busybox
  command:
  - sh
  - -c
  - |
    echo "Init kea: Checking for backup restore..."
    if [ -f /var/lib/kea/kea-leases.tar.gz ]; then
      echo "Found kea-leases backup, restoring..."
      cd /var/lib/kea
      tar xzf kea-leases.tar.gz
      rm -f kea-leases.tar.gz
      echo "✓ Kea leases restored from backup"
    fi

    mkdir -p /var/run/kea
    chmod 750 /var/run/kea
    chown 101:101 /var/run/kea || true
    echo "✓ Kea sockets initialized"
  volumeMounts:
  - name: kea-leases
    mountPath: /var/lib/kea
  - name: kea-sockets
    mountPath: /var/run/kea
{{- end -}}
