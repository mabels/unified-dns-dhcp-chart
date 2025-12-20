# DNS/DHCP Backup and Restore Architecture

## Overview

The backup and restore system uses a combination of backup scripts, init containers, and lifecycle hooks to manage DNS zones and DHCP leases with proper merging of static records from Helm values.

## Architecture Components

### 1. Backup Scripts

#### `backup-knot-zones.ts` (TypeScript with zx and cmd-ts)
- Uses `knotc zone-backup` to create official Knot backups
- Creates two archives:
  - **Full backup**: `knot-zones-{statefulset}-{timestamp}.tar.gz` (includes metadata and timers)
  - **Zone files only**: `zones.tar.gz` (for postStart hook restore)
- Proper error handling and colored output
- Type-safe with full IDE support

#### `backup-kea-leases.sh` (Shell script)
- Backs up all lease files from `/var/lib/kea`
- Creates two archives:
  - **Timestamped**: `kea-leases-{statefulset}-{timestamp}.tar.gz`
  - **Init container compatible**: `kea-leases.tar.gz`

### 2. Restore Process

#### Zone Restore (Knot DNS)
**Location**: postStart lifecycle hook on `knot-auth` container
**Script**: `restore-and-merge-zones.sh` (mounted from ConfigMap)

**Process**:
1. Wait for Knot to be ready
2. Check for `/var/lib/knot/zones/zones.tar.gz`
3. If found:
   - Extract backup zones
   - Move zone files from `zonefiles/` to `/var/lib/knot/zones/`
   - Use `knotc zone-reload` to load zones from disk
   - Remove backup tar file
4. Merge static records from values.yaml:
   - Use `knotc zone-begin` to start transaction
   - Use `knotc zone-set` to add/update each static record
   - Use `knotc zone-commit` to commit changes
   - Use `knotc zone-flush` to persist to disk

**Benefits**:
- Backup zones are restored first
- Static records from values.yaml are merged on top
- Changes to staticRecords in values.yaml take effect on pod restart
- Uses official Knot commands for proper zone management
- Runs in knot-auth container which has `knotc` available

#### Lease Restore (Kea DHCP)
**Location**: `init-kea-leases` init container
**Process**:
1. Check for `/var/lib/kea/kea-leases.tar.gz`
2. If found:
   - Extract lease files
   - Remove backup tar file
3. Kea loads leases from disk on startup

### 3. Container Configuration

#### Init Container: `init-zones`
**Image**: `busybox`
**Purpose**: Copy initial zone files if they don't exist
**Note**: No longer handles backup restore (moved to postStart hook)

#### Init Container: `init-kea-leases`
**Image**: `busybox`
**Purpose**: Restore DHCP leases from backup if present

#### Container: `knot-auth`
**postStart Hook**: Runs `restore-and-merge-zones.sh`
**Purpose**: Restore zones from backup and merge static records

## Workflow Diagrams

### Backup Workflow
```
┌─────────────────────────────────┐
│  Run backup-knot-zones.ts       │
│  - Uses knotc zone-backup       │
│  - Creates zones.tar.gz         │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  Run backup-kea-leases.sh       │
│  - Backs up lease files         │
│  - Creates kea-leases.tar.gz    │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  Store backups locally           │
│  - backups/zones.tar.gz         │
│  - backups/kea-leases.tar.gz    │
└─────────────────────────────────┘
```

### Restore Workflow
```
┌─────────────────────────────────┐
│  Run restore-dns-dhcp-pvc.sh    │
│  - Copy zones.tar.gz to pod     │
│  - Copy kea-leases.tar.gz       │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  Delete pod (kubectl delete)    │
│  StatefulSet recreates pod      │
└────────────┬────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼──────────┐ ┌───▼──────────────┐
│ init-zones   │ │ init-kea-leases  │
│ (busybox)    │ │ (busybox)        │
│              │ │                  │
│ Copy initial │ │ Extract          │
│ zones if     │ │ kea-leases.tar.gz│
│ needed       │ │ if present       │
└──────────────┘ └──────────────────┘
             │
┌────────────▼────────────────────┐
│  Containers start               │
│  - knot-auth                    │
│  - kea-dhcp4                    │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  knot-auth postStart hook       │
│  (restore-and-merge-zones.sh)   │
│                                 │
│  1. Wait for Knot ready         │
│  2. Check for zones.tar.gz      │
│  3. Extract and reload zones    │
│  4. Merge staticRecords         │
│     using knotc zone-set        │
└─────────────────────────────────┘
```

### Normal Startup (No Backup)
```
┌─────────────────────────────────┐
│  Pod starts                     │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  init-zones                     │
│  - Copy initial zones from      │
│    ConfigMap if not exist       │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  knot-auth starts               │
│  - Loads zones from disk        │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  postStart hook runs            │
│  - No backup found              │
│  - Merges staticRecords         │
│    using knotc zone-set         │
└─────────────────────────────────┘
```

## Key Features

### Proper Merge of Static Records
- Static records defined in `values.yaml` are always applied
- Uses `knotc zone-set` for atomic updates
- Changes to staticRecords take effect on pod restart

### Clean Separation of Concerns
- **Init containers**: Setup and initial file operations (busybox)
- **postStart hook**: Zone management using Knot tools (knotc)
- **Backup scripts**: External tooling for data extraction

### Idempotent Operations
- Scripts can be run multiple times safely
- Static records are updated/added, not duplicated
- Failed operations can be retried

### Type Safety (Zones Backup)
- TypeScript with zx provides better error handling
- cmd-ts validates CLI arguments
- Easier to maintain and extend

## Usage

### Create Backups
```bash
# Backup Knot zones
cd scripts
pnpm backup:knot -c my-cluster -s unified-dns-dhcp -n dns-dhcp -b ../backups

# Or directly
./backup-knot-zones.ts -c my-cluster -s unified-dns-dhcp

# Backup Kea leases
cd ..
./backup-kea-leases.sh my-cluster unified-dns-dhcp dns-dhcp ./backups
```

### Restore from Backups
```bash
./restore-dns-dhcp-pvc.sh ./backups/zones.tar.gz ./backups/kea-leases.tar.gz my-cluster unified-dns-dhcp dns-dhcp
```

### Update Static Records
Simply update `staticRecords` in your values file and upgrade the Helm release:
```bash
helm upgrade unified-dns-dhcp ../unified-dns-dhcp \
  -f values.yaml \
  -n dns-dhcp \
  --kube-context my-cluster
```

Then restart the pod for the postStart hook to merge the new records:
```bash
kubectl --context=my-cluster delete pod unified-dns-dhcp-0 -n dns-dhcp
```

## Files Modified

### Helm Templates
- `templates/configmaps.yaml` - Added `restore-and-merge-zones.sh` script
- `templates/configs/_merge-static-records.tpl` - New template for the restore script
- `templates/containers/_knot-auth.tpl` - Added postStart lifecycle hook
- `templates/containers/_init-zones.tpl` - Simplified (removed backup restore logic)

### Backup Tools
- `scripts/backup-knot-zones.ts` - TypeScript backup script
- `scripts/package.json` - Dependencies (zx, cmd-ts, tsx, typescript)
- `backup-kea-leases.sh` - Shell script for DHCP backup

### Restore Tools
- `restore-dns-dhcp-pvc.sh` - Updated to work with separate backup files

## Migration from Old System

The old system used init containers to extract and replace zone files. The new system:
1. Extracts zones in the same way
2. But then uses `knotc` to properly load and merge them
3. Always applies staticRecords from values.yaml

**No data migration needed** - the backup format is compatible.
