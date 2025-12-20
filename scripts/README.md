# Backup Tools

TypeScript-based backup utilities for Kubernetes DNS/DHCP infrastructure.

## Installation

```bash
pnpm install
```

## Usage

### Backup Knot DNS Zones

Using pnpm script:
```bash
pnpm backup:knot -c my-cluster -s unified-dns-dhcp -n dns-dhcp -b ./backups
```

Direct execution:
```bash
./backup-knot-zones.ts --context my-cluster --statefulset unified-dns-dhcp --namespace dns-dhcp --backup-dir ../backups
```

Short form:
```bash
./backup-knot-zones.ts -c my-cluster -s unified-dns-dhcp -n dns-dhcp -b ../backups
```

### Options

- `-c, --context <str>` - Kubernetes context (default: `my-cluster`)
- `-s, --statefulset <str>` - StatefulSet name (default: `unified-dns-dhcp`)
- `-n, --namespace <str>` - Kubernetes namespace (default: `dns-dhcp`)
- `-b, --backup-dir <str>` - Backup directory (default: `./backups`)
- `-h, --help` - Show help

## Output

The script creates two backup files:

1. **Timestamped full backup**: `knot-zones-{statefulset}-{timestamp}.tar.gz`
   - Contains complete Knot backup including zone files and metadata
   - Can be restored using `knotc zone-restore +backupdir <dir>`

2. **Init container compatible backup**: `zones.tar.gz`
   - Contains only zone files in `zonefiles/` directory
   - Can be copied to `/zones` in the pod and will be automatically restored by the init container on pod restart

## Features

- Type-safe TypeScript implementation
- Proper error handling with detailed error messages
- Colored console output for better readability
- Uses official `knotc zone-backup` command
- Automatic cleanup of temporary files
- Human-readable file sizes
- Zone count validation
- Pod status verification

## Technology Stack

- **TypeScript** - Type-safe scripting
- **zx** - Shell command execution with proper error handling
- **cmd-ts** - CLI argument parsing and validation
- **tsx** - TypeScript execution
