# Looking Glass - Kea DHCP4 Lease Viewer

A React dashboard for visualizing Kea DHCP4 leases across multiple network segments.

## Architecture

- **Frontend**: React 19 + Vite + Tailwind CSS + Headless UI
- **Backend**: Deno 2.x with native HTTP server
- **Deployment**: Separate Kubernetes deployment with RBAC for kubectl exec

## Features

- View DHCP leases from Kea `lease4-get-all` API
- Multi-segment support (switch between network segments)
- Search and filter by IP, MAC address, or hostname
- Auto-refresh with configurable interval
- Export leases to CSV

## Development

### Prerequisites

- Deno 2.x installed
- Node.js 20+ (for frontend build)
- kubectl access to Kubernetes cluster (or port-forward to Kea API)

### Local Development (Unified - Single Command!)

```bash
cd frontend
npm install  # First time only
npm run dev

# That's it! This starts:
# - Deno backend on http://localhost:3000
# - Vite dev server on http://localhost:5173
# Access at http://localhost:5173
```

The Vite dev server automatically starts the Deno backend via a plugin. When you stop Vite (Ctrl+C), it also stops the backend.

### Configure Kea Endpoints

Set the `ENDPOINTS` environment variable before starting:

```bash
# Single endpoint (default)
npm run dev

# Multiple endpoints
ENDPOINTS='[{"name":"seg128","url":"http://localhost:8000"},{"name":"seg129","url":"http://localhost:8001"}]' npm run dev
```

### Configure Database Location

By default, the database is stored at `backend/leases.db`. To change the location:

```bash
# Custom database path
DB_PATH=/path/to/my/leases.db npm run dev

# Or for production
DB_PATH=/data/leases.db deno task prod
```

**Kubernetes**: The database is automatically configured to use a persistent volume at `/data/leases.db` (see `values.yaml` → `lookingGlass.persistence`).

### Production Build (Local Testing)

```bash
# Option 1: Single command (builds + starts)
deno task prod

# Option 2: Shell script
./start-prod.sh

# Access at http://localhost:3000
```

The production build:
- Compiles React with Vite → `frontend/dist/`
- Deno serves both static files AND API
- Single process on port 3000

### Build for Kubernetes

```bash
# Build Docker image
docker build -t looking-glass:latest .

# Deploy via Helm
helm upgrade unified-dns-dhcp .. -n dns-dhcp \
  --set lookingGlass.enabled=true
```

**Persistent Storage Configuration** (values.yaml):

```yaml
lookingGlass:
  enabled: true

  persistence:
    enabled: true              # Enable persistent volume
    size: 1Gi                  # Database size
    storageClassName: ""       # Use cluster default or specify (e.g., "local-path")
    mountPath: /data           # Mount point in container
    # Database will be at /data/leases.db
```

The persistent volume ensures your lease history survives pod restarts and redeployments.

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/segments` - List configured segments
- `GET /api/leases` - Get all leases from all segments
- `GET /api/leases/:segment` - Get leases for specific segment

## Configuration

Segments are configured via Kubernetes ConfigMap or environment variables. The backend uses `kubectl exec` to access the Kea Control Agent API running inside segment pods.

## License

Part of the unified-dns-dhcp project.
