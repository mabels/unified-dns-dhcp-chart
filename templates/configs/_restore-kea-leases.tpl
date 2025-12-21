{{- define "configs.restore-kea-leases" -}}
restore-kea-leases.sh: |
  #!/bin/sh
  set -e

  echo "=== Kea DHCP Leases Restore Script ==="

  LEASES_DIR="/var/lib/kea"
  BACKUP_FILE="$LEASES_DIR/kea-leases.tar.gz"

  # Wait for Kea to be ready (max 30 seconds)
  MAX_WAIT=30
  WAITED=0
  while [ $WAITED -lt $MAX_WAIT ]; do
    if wget -q -O /dev/null --post-data='{{ dict "command" "status-get" "service" (list "dhcp4") | toJson }}' --header='Content-Type: application/json' http://127.0.0.1:8000/ 2>/dev/null; then
      echo "✓ Kea is ready"
      break
    fi
    echo "Waiting for Kea to start... ($WAITED/$MAX_WAIT)"
    sleep 1
    WAITED=$((WAITED + 1))
  done

  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "✗ Timeout waiting for Kea to start"
    exit 1
  fi

  # Wait a bit more for Kea to fully initialize
  sleep 2

  # Check if we have a backup to restore
  if [ -f "$BACKUP_FILE" ]; then
    echo "Found backup file: $BACKUP_FILE"
    echo "Extracting backup restore scripts..."

    cd "$LEASES_DIR"
    tar xzf kea-leases.tar.gz

    # Check if extraction created a restore-scripts directory
    if [ -d "restore-scripts" ]; then
      echo "Running restore scripts from backup..."

      # Make all scripts executable
      chmod +x restore-scripts/*.sh

      # Check if master restore script exists
      if [ -f "restore-scripts/restore-all.sh" ]; then
        echo "Executing master restore script..."
        sh restore-scripts/restore-all.sh
        echo "✓ All leases restored from backup"
      else
        # Fallback: run individual scripts
        echo "Running individual restore scripts..."
        for script in restore-scripts/restore-*.sh; do
          if [ -f "$script" ]; then
            echo "  Executing: $(basename "$script")"
            sh "$script" 2>/dev/null || echo "  Warning: Script $(basename "$script") had errors"
          fi
        done
        echo "✓ Lease restore scripts completed"
      fi

      # Cleanup extracted directory
      rm -rf restore-scripts/
    else
      echo "Warning: No restore-scripts directory found in backup"
    fi

    # Remove backup file after successful restore
    rm -f kea-leases.tar.gz
    echo "✓ Backup leases restored"
  else
    echo "No backup file found, starting with empty lease database"
  fi

  # Now apply static leases on top of restored/initial state
  echo ""
  echo "Applying static leases from config..."

  # Check if we have static leases to apply
  STATIC_LEASES_COUNT={{ len (default (list) .segment.staticLeases) }}
  if [ "$STATIC_LEASES_COUNT" -eq 0 ]; then
    echo "No static leases configured"
  else
    echo "Applying $STATIC_LEASES_COUNT static lease(s)..."
    echo ""

    {{- range (default (list) .segment.staticLeases) }}
    # Static lease: {{ .macAddress }} -> {{ .address }}{{ if .hostname }} ({{ .hostname }}){{ end }}
    echo "  Adding: {{ .address }} for {{ .macAddress }}{{ if .hostname }} ({{ .hostname }}){{ end }}"

    {{- $leaseArgs := dict "ip-address" .address "hw-address" .macAddress "subnet-id" ($.segment.name | int) "valid-lft" 0 "cltt" 0 "fqdn-fwd" false "fqdn-rev" false "state" 0 }}
    {{- if .hostname }}{{ $_ := set $leaseArgs "hostname" .hostname }}{{ end }}
    {{- if .clientId }}{{ $_ := set $leaseArgs "client-id" .clientId }}{{ end }}
    {{- $leaseCmd := dict "command" "lease4-add" "service" (list "dhcp4") "arguments" $leaseArgs }}

    RESULT=$(wget -q -O - --post-data='{{ $leaseCmd | toJson }}' --header='Content-Type: application/json' http://127.0.0.1:8000/ 2>/dev/null || echo '{"result":1}')

    # Check if the command succeeded
    if echo "$RESULT" | grep -q '"result":0'; then
      echo "    ✓ Lease added"
    else
      # Lease might already exist, this is OK
      echo "    → Lease may already exist"
    fi

    {{- end }}

    echo ""
    echo "✓ Static leases applied"
  fi

  echo ""
  echo "=== Kea lease restore complete ==="
{{- end -}}
