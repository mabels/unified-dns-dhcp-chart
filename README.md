# Unified DNS-DHCP Helm Chart

Kubernetes Helm chart providing unified DNS and DHCP services for network segments with centralized Stork monitoring.

## Features

- **DNS Services**
  - Unbound recursive resolver
  - BIND9 or Knot authoritative DNS
  - Dynamic DNS (DDNS) support
  - DNSSEC support
  - Journal file persistence

- **DHCP Services**
  - Kea DHCP4 server
  - Kea DHCP-DDNS integration
  - IPv4 and IPv6 support
  - Lease database persistence
  - Host reservations

- **Monitoring**
  - ISC Stork centralized monitoring
  - Real-time DHCP statistics
  - DNS zone monitoring
  - Split deployment architecture
  - Web UI with Ingress support

- **Architecture**
  - Multi-segment support
  - Separate server and segment deployments
  - StatefulSet-based with persistent storage
  - Multus network attachment support

## Version

- **Chart Version**: 1.1.0
- **App Version**: 1.0
- **Stork**: Latest
- **BIND**: 9.x
- **Knot**: 3.x
- **Kea**: 2.x
- **Unbound**: Latest

## Architecture

```
┌─────────────────────────────────────────┐
│  Stork Server (Deployed ONCE)          │
│  ─────────────────────────────────────  │
│  - Web UI (Ingress/Port-Forward)       │
│  - PostgreSQL Backend                   │
│  - Centralized Monitoring               │
└─────────────────────────────────────────┘
                    ▲
                    │ Agent → Server (gRPC)
         ┌──────────┴──────────┐
         │                     │
┌────────▼──────┐     ┌────────▼──────┐
│ Segment 128   │     │ Segment 129   │
│ ────────────  │     │ ────────────  │
│ StatefulSet:  │     │ StatefulSet:  │
│ - Unbound     │     │ - Unbound     │
│ - BIND/Knot   │     │ - BIND/Knot   │
│ - Kea DHCP    │     │ - Kea DHCP    │
│ - Kea DDNS    │     │ - Kea DDNS    │
│ - Stork Agent │     │ - Stork Agent │
│               │     │               │
│ PVCs:         │     │ PVCs:         │
│ - zones       │     │ - zones       │
│ - bind-cache  │     │ - bind-cache  │
│ - kea-leases  │     │ - kea-leases  │
└───────────────┘     └───────────────┘
```

## Prerequisites

1. **Kubernetes Cluster** (tested on K3s)
2. **Multus CNI** (for multiple network interfaces)
3. **PostgreSQL** (for Stork monitoring)
4. **StorageClass** (e.g., local-path)
5. **Optional**: cert-manager, external-dns for Ingress

## Quick Start

### 1. Deploy PostgreSQL

```bash
cd ../postgresql
./deploy.sh
```

### 2. Create Stork Database

```bash
cd ../postgresql
./create-database.sh stork stork_user
# Save the password!
```

### 3. Create Database Secret

```bash
kubectl --context=mam-hh-dns1 create secret generic stork-db-credentials \
  --from-literal=password='YOUR_STORK_PASSWORD' \
  -n dns-dhcp
```

### 4. Deploy Stork Server

```bash
cd ../unified-dns-dhcp
./deploy-stork-server.sh
```

### 5. Deploy Segments

```bash
# Create segment configuration
cp values-segment-example.yaml values-segment-128.yaml
# Edit: segment name, IPs, domain, etc.

# Deploy
./deploy-segment.sh 128
```

### 6. Access Stork UI

```bash
kubectl --context=mam-hh-dns1 port-forward -n dns-dhcp svc/stork-server 8080:8080
# Open: http://localhost:8080
# Login: admin / admin
```

Or via Ingress: https://stork.example.com

## Deployment Modes

This chart supports two deployment modes:

### Mode 1: Server-Only (Deploy Once)

**Purpose**: Deploy Stork monitoring server

**Command**:
```bash
helm upgrade --install stork-server . \
  --namespace dns-dhcp \
  --kube-context mam-hh-dns1 \
  --values values-stork-server.yaml
```

**What deploys**:
- Stork Server (Web UI)
- Stork Service
- Ingress (optional)
- Database secret

**What does NOT deploy**:
- DNS/DHCP services
- Segment StatefulSets
- Stork Agents

### Mode 2: Segment (Deploy Multiple Times)

**Purpose**: Deploy DNS/DHCP services per network segment

**Command**:
```bash
# Segment 128
helm upgrade --install segment-128 . \
  --namespace dns-dhcp \
  --kube-context mam-hh-dns1 \
  --values values-segment-128.yaml

# Segment 129
helm upgrade --install segment-129 . \
  --namespace dns-dhcp \
  --kube-context mam-hh-dns1 \
  --values values-segment-129.yaml
```

**What deploys**:
- StatefulSet (Unbound + BIND/Knot + Kea DHCP + DDNS + Stork Agent)
- ConfigMap (segment config)
- Service (DNS/DHCP)
- PVCs (zones, bind-cache, kea-leases)

**What does NOT deploy**:
- Stork Server
- Ingress

See [DEPLOYMENT-MODES.md](DEPLOYMENT-MODES.md) for detailed guide.

## Configuration

### Server Configuration

**values-stork-server.yaml**:
```yaml
stork:
  enabled: true
  server:
    enabled: true
    port: 8080
    database:
      host: postgresql.postgresql.svc.cluster.local
      port: 5432
      name: stork
      user: stork_user
      passwordSecret:
        name: stork-db-credentials
        key: password
  
  ingress:
    enabled: true
    className: "nginx"
    hosts:
      - stork.example.com
    annotations:
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
      external-dns.alpha.kubernetes.io/hostname: "stork.example.com"
    tls:
      enabled: true

segments: []  # No segments!
```

### Segment Configuration

**values-segment-128.yaml**:
```yaml
global:
  namespace: dns-dhcp
  authDNS:
    type: bind  # or "knot"

stork:
  enabled: true
  server:
    enabled: false  # Server deployed separately
  agent:
    enabled: true   # Enable agent sidecar

segments:
  - name: "128"
    domain: seg128.local
    ipv4:
      network: 192.168.128.0/24
      dns: 192.168.128.5
      dhcp: 192.168.128.5
      gateway: 192.168.128.1
      dhcpRange:
        start: 192.168.128.100
        end: 192.168.128.200
    ipv6:
      network: fd00:128::/64
      dns: fd00:128::5
      dhcp: fd00:128::5
      gateway: fd00:128::1
      dhcpRange:
        start: fd00:128::1000
        end: fd00:128::2000
    upstream:
      - 1.1.1.1
      - 8.8.8.8
```

## Ingress Configuration

### Example 1: cert-manager + external-dns

```yaml
stork:
  ingress:
    enabled: true
    className: "nginx"
    hosts:
      - stork.mam-hh-dns1.example.com
    annotations:
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
      external-dns.alpha.kubernetes.io/hostname: "stork.mam-hh-dns1.example.com"
    tls:
      enabled: true  # Auto-generates: stork-mam-hh-dns1-abels-name
```

### Example 2: Custom Annotations

```yaml
stork:
  ingress:
    enabled: true
    className: "traefik"
    hosts:
      - stork.local
    annotations:
      traefik.ingress.kubernetes.io/router.entrypoints: web,websecure
      traefik.ingress.kubernetes.io/router.tls: "true"
    tls:
      enabled: true
```

### Example 3: Multiple Hosts

```yaml
stork:
  ingress:
    enabled: true
    hosts:
      - stork.example.com
      - monitor.example.com
    tls:
      enabled: true
      # Auto-generates:
      # - stork-example-com
      # - monitor-example-com
```

## Storage

### Persistent Volumes (per segment)

| PVC | Size | Purpose |
|-----|------|---------|
| `zones` | 100Mi | Static zone files |
| `bind-cache` | 200Mi | BIND journal files (.jnl), managed keys |
| `knot-storage` | 200Mi | Knot journal, timers, KASP DB |
| `kea-leases` | 100Mi | DHCP lease database |

**DDNS Persistence**: Journal files persist across pod restarts! 🎉

See [DDNS-PERSISTENCE.md](DDNS-PERSISTENCE.md) for details.

## Monitoring

### Stork Dashboard Features

- **DHCP Statistics**
  - Active leases (IPv4/IPv6)
  - Pool utilization graphs
  - Lease expiration timeline
  - Host reservations

- **DNS Monitoring**
  - Zone information
  - Query statistics
  - DNSSEC status

- **Server Health**
  - All segments status
  - Resource usage
  - HA status (if configured)

### Access Methods

**Port-Forward**:
```bash
kubectl port-forward -n dns-dhcp svc/stork-server 8080:8080
# http://localhost:8080
```

**Ingress**:
```bash
# https://stork.example.com
```

**Default Login**:
- Username: `admin`
- Password: `admin`
- **Change immediately after first login!**

## Deployment Scripts

### Deploy Server

```bash
./deploy-stork-server.sh

# With custom context/namespace
KUBE_CONTEXT=my-cluster NAMESPACE=dns ./deploy-stork-server.sh
```

### Deploy Segment

```bash
./deploy-segment.sh 128 values-segment-128.yaml

# Shorter (uses values-segment-128.yaml by default)
./deploy-segment.sh 128
```

## Troubleshooting

### Stork Server Not Starting

**Check PostgreSQL**:
```bash
kubectl get statefulset -n postgresql postgresql
```

**Check Secret**:
```bash
kubectl get secret stork-db-credentials -n dns-dhcp
```

**Check Logs**:
```bash
kubectl logs -n dns-dhcp deployment/stork-server
```

### Agent Not Showing Up

**Check Agent Logs**:
```bash
kubectl logs unified-dns-dhcp-128-0 -n dns-dhcp -c stork-agent
```

**Check Connectivity**:
```bash
kubectl exec -it unified-dns-dhcp-128-0 -n dns-dhcp -c stork-agent -- \
  wget -O- http://stork-server:8080/api/version
```

### DDNS Updates Not Persisting

**Check PVC**:
```bash
kubectl get pvc -n dns-dhcp | grep bind-cache
```

**Check Journal Files**:
```bash
kubectl exec unified-dns-dhcp-128-0 -n dns-dhcp -c bind -- \
  ls -lah /var/cache/bind/dynamic/
```

See [DDNS-PERSISTENCE.md](DDNS-PERSISTENCE.md) for troubleshooting guide.

## Upgrade

### From 1.0.x → 1.1.0

**No breaking changes!** All features are optional.

**Steps**:

1. Deploy Stork Server (optional):
```bash
helm upgrade --install stork-server . --values values-stork-server.yaml
```

2. Upgrade segments:
```bash
# Edit values: add stork.enabled: true, stork.agent.enabled: true
helm upgrade segment-128 . --values values-segment-128.yaml
```

**Note**: First upgrade will lose existing DDNS records. Renew DHCP leases.

## Files

| File | Description |
|------|-------------|
| `Chart.yaml` | Chart metadata |
| `values.yaml` | Default values (reference) |
| `values-stork-server.yaml` | Server-only deployment |
| `values-segment-example.yaml` | Segment template |
| `templates/statefulset.yaml` | Segment pods |
| `templates/stork-server.yaml` | Server deployment |
| `templates/stork-ingress.yaml` | Ingress for Web UI |
| `templates/configmaps.yaml` | DNS/DHCP configs |
| `deploy-stork-server.sh` | Server deploy script |
| `deploy-segment.sh` | Segment deploy script |

## Documentation

- [DEPLOYMENT-MODES.md](DEPLOYMENT-MODES.md) - Split deployment guide
- [STORK-SETUP.md](STORK-SETUP.md) - Stork monitoring setup
- [DDNS-PERSISTENCE.md](DDNS-PERSISTENCE.md) - DDNS journal persistence
- [CHANGELOG.md](CHANGELOG.md) - Version history

## Support

- Issues: https://github.com/mabels/gw-to-earth-ng/issues
- Email: admin@example.com

## License

MIT License

## Credits

- **ISC Kea** - High-performance DHCP server
- **ISC BIND** - DNS server
- **CZ.NIC Knot** - Authoritative DNS
- **NLnet Labs Unbound** - Recursive resolver
- **ISC Stork** - DHCP/DNS monitoring
