{{- define "configs.merge-static-records" -}}
restore-and-merge-zones.sh: |
  #!/bin/sh
  set -e

  echo "=== Zone Restore and Merge Script ==="

  # Zone configuration
  FORWARD_ZONE="{{ .segment.zone.forward }}."
  REVERSE_V4_ZONE="{{ .segment.zone.reverseV4 }}."
  {{- if .segment.zone.reverseV6 }}
  REVERSE_V6_ZONE="{{ .segment.zone.reverseV6 }}."
  HAS_V6_REVERSE="yes"
  {{- else }}
  HAS_V6_REVERSE="no"
  {{- end }}
  ZONES_DIR="/var/lib/knot/zones"
  BACKUP_FILE="$ZONES_DIR/zones.tar.gz"

  # Wait for Knot to be ready (max 30 seconds)
  MAX_WAIT=30
  WAITED=0
  while [ $WAITED -lt $MAX_WAIT ]; do
    if knotc status > /dev/null 2>&1; then
      echo "✓ Knot is ready"
      break
    fi
    echo "Waiting for Knot to start... ($WAITED/$MAX_WAIT)"
    sleep 1
    WAITED=$((WAITED + 1))
  done

  if [ $WAITED -ge $MAX_WAIT ]; then
    echo "✗ Timeout waiting for Knot to start"
    exit 1
  fi

  # Wait a bit more for zones to fully load
  sleep 2

  # Check if we have a backup to restore
  if [ -f "$BACKUP_FILE" ]; then
    echo "Found backup file: $BACKUP_FILE"
    echo "Extracting backup restore scripts..."

    cd "$ZONES_DIR"
    tar xzf zones.tar.gz

    # Check if extraction created a restore-scripts directory
    if [ -d "restore-scripts" ]; then
      echo "Running restore scripts from backup..."

      # Make all scripts executable
      chmod +x restore-scripts/*.sh

      # Check if master restore script exists
      if [ -f "restore-scripts/restore-all.sh" ]; then
        echo "Executing master restore script..."
        sh restore-scripts/restore-all.sh
        echo "✓ All zones restored from backup"
      else
        # Fallback: run individual scripts
        echo "Running individual restore scripts..."
        for script in restore-scripts/restore-*.sh; do
          if [ -f "$script" ]; then
            echo "  Executing: $(basename "$script")"
            sh "$script" 2>/dev/null || echo "  Warning: Script $(basename "$script") had errors"
          fi
        done
        echo "✓ Zone restore scripts completed"
      fi

      # Cleanup extracted directory
      rm -rf restore-scripts/
    else
      echo "Warning: No restore-scripts directory found in backup"
    fi

    # Remove backup file after successful restore
    rm -f zones.tar.gz
    echo "✓ Backup zones restored"
  else
    echo "No backup file found, zones loaded from initial config"
  fi

  # Now merge static records on top of restored/initial zones
  echo ""
  echo "Merging static records into zones..."

  # Check if we have static records to merge
  STATIC_RECORDS_COUNT={{ len .segment.staticRecords }}
  if [ "$STATIC_RECORDS_COUNT" -eq 0 ]; then
    echo "No static records to merge"
  else
    # Add forward records
    {{- range .segment.staticRecords }}
    {{- $parts := splitList " IN " . }}
    {{- $owner := index $parts 0 | trim }}
    {{- $rest := index $parts 1 }}
    {{- $typeValue := splitList " " $rest }}
    {{- $type := index $typeValue 0 | trim }}
    {{- $value := index $typeValue 1 | trim }}

    echo "  Adding: {{ $owner }} IN {{ $type }} {{ $value }}"
    knotc zone-begin "$FORWARD_ZONE" 2>/dev/null || true
    knotc zone-set "$FORWARD_ZONE" "{{ $owner }}" "3600" "IN" "{{ $type }}" "{{ $value }}" 2>/dev/null || echo "  Warning: Failed to set {{ $owner }} {{ $type }}"
    knotc zone-commit "$FORWARD_ZONE" 2>/dev/null || true

    {{- if eq $type "A" }}
    # Add reverse PTR for IPv4
    LAST_OCTET=$(echo "{{ $value }}" | awk -F. '{print $4}')
    echo "  Adding reverse: $LAST_OCTET PTR {{ $owner }}.${FORWARD_ZONE}"
    knotc zone-begin "$REVERSE_V4_ZONE" 2>/dev/null || true
    knotc zone-set "$REVERSE_V4_ZONE" "$LAST_OCTET" "3600" "IN" "PTR" "{{ $owner }}.${FORWARD_ZONE}" 2>/dev/null || echo "  Warning: Failed to set reverse PTR"
    knotc zone-commit "$REVERSE_V4_ZONE" 2>/dev/null || true
    {{- end }}

    {{- if eq $type "AAAA" }}
    # Add reverse PTR for IPv6
    if [ "$HAS_V6_REVERSE" = "yes" ]; then
      # Extract last nibble from compressed IPv6 (simplified for ::N notation)
      ADDR="{{ $value }}"
      if echo "$ADDR" | grep -q "::"; then
        # Handle :: notation by extracting last part
        LAST_PART=$(echo "$ADDR" | awk -F:: '{print $NF}')
        # Convert hex to nibble format (reverse)
        NIBBLES=$(printf "%04x" "0x$LAST_PART" | sed 's/./&./g' | rev | sed 's/^.//')
        echo "  Adding reverse: $NIBBLES PTR {{ $owner }}.${FORWARD_ZONE}"
        knotc zone-begin "$REVERSE_V6_ZONE" 2>/dev/null || true
        knotc zone-set "$REVERSE_V6_ZONE" "$NIBBLES" "3600" "IN" "PTR" "{{ $owner }}.${FORWARD_ZONE}" 2>/dev/null || echo "  Warning: Failed to set IPv6 reverse PTR"
        knotc zone-commit "$REVERSE_V6_ZONE" 2>/dev/null || true
      fi
    fi
    {{- end }}
    {{- end }}

    # Flush zones to disk to persist changes
    knotc zone-flush "$FORWARD_ZONE" 2>/dev/null || true
    knotc zone-flush "$REVERSE_V4_ZONE" 2>/dev/null || true
    if [ "$HAS_V6_REVERSE" = "yes" ]; then
      knotc zone-flush "$REVERSE_V6_ZONE" 2>/dev/null || true
    fi

    echo "✓ Static records and reverse PTRs merged successfully"
  fi

  echo ""
  echo "=== Zone restore and merge complete ==="
{{- end -}}
