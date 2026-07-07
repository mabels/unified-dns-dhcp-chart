# Unified DNS-DHCP Helm Chart

Kubernetes Helm chart that runs [Technitium DNS Server](https://technitium.com/dns/) as a
combined authoritative DNS, recursive resolver, and DHCP server — one StatefulSet per
network segment.

## Why per-segment DNS servers?

A typical home or small-office network has a single uplink and a single DNS server.
This chart is designed for a different scenario: **multiple network segments, each
routing outbound traffic through a different uplink** — for example a dedicated VPN
tunnel per segment.

In that setup a shared, cluster-wide DNS server cannot work correctly. When a client in
segment A resolves `netflix.com`, the answer must be obtained through segment A's VPN
tunnel — not through the host network — so that the geo-DNS response reflects the
correct exit location. A DNS server that sits outside the segment's routing context will
resolve through the wrong uplink and return addresses for the wrong region.

The solution is a **local DNS server per segment**, bound to that segment's IP and
forwarding upstream through the same path as the segment's data traffic. This chart
deploys exactly that: one Technitium instance per segment, configured with the correct
upstream forwarder (protocol, nameserver, DoH path) for that segment's uplink.

DHCP is colocated in the same pod so that lease assignments and DNS registrations stay
consistent within the segment, and because DHCP broadcasts are link-local — the server
must be reachable on the same L2 network as the clients.

## Architecture

```
┌──────────────────────────┐   ┌──────────────────────────┐
│  Segment A               │   │  Segment B               │
│  StatefulSet             │   │  StatefulSet             │
│  ─────────────────────── │   │  ─────────────────────── │
│  technitium              │   │  technitium              │
│    DNS  (53/udp+tcp)     │   │    DNS  (53/udp+tcp)     │
│    DHCP (67/udp)         │   │    DHCP (67/udp)         │
│    Web UI (5380/tcp)     │   │    Web UI (5380/tcp)     │
│  configurator (Deno)     │   │  configurator (Deno)     │
│  metrics (optional)      │   │  metrics (optional)      │
│  ─────────────────────── │   │  ─────────────────────── │
│  PVC: technitium-data    │   │  PVC: technitium-data    │
│  ipvlan: <segment NIC>   │   │  ipvlan: <segment NIC>   │
└──────────────────────────┘   └──────────────────────────┘
           │                              │
    upstream A (VPN / ISP)        upstream B (VPN / ISP)
```

Each pod receives a secondary network interface via
[Multus CNI](https://github.com/k8snetworkplumbingwg/multus-cni) + ipvlan (L2 mode)
bound to the segment's physical or VLAN interface. This lets the pod source DNS queries
and DHCP responses directly on that network, through that segment's routing context.

### Configurator sidecar

All DNS zones, reverse zones, PTR records, DHCP scopes, static leases, upstream
forwarders, and app installations are applied at pod startup by a **Deno configurator
sidecar** (`configure.ts`). The sidecar calls the Technitium REST API, waits for the
server to become ready, and then applies the full desired state. The process is
idempotent — running it again on an already-configured server is safe.

This means there is no manual bootstrapping, no one-time setup script, and no state
stored outside the Technitium data volume. A fresh pod (e.g. after a node failure or a
PVC deletion) converges to the correct state automatically on startup.

The configurator script is kept in a shared ConfigMap (`unified-dns-dhcp-configurator-script`)
that is **not owned by any individual segment Helm release**, so it can be updated and
reapplied across all segments in a single step without triggering a Helm upgrade.

### Service CIDR routing

Kubernetes pods on dedicated nodes (e.g. nodes with a `NoSchedule` taint for DNS
workloads) may not have a route to the cluster's service CIDR by default, depending on
the CNI setup. An `init-routes` init container installs the service CIDR route through
the node-local pod gateway before any sidecar starts. This ensures the pod can reach
ClusterIP services — CoreDNS, PostgreSQL, etc. — even when its default route exits
through the segment's uplink rather than the cluster overlay.

### ConfigMap checksum annotations

The pod template carries `checksum/segment-config` and `checksum/configurator-script`
annotations computed from the ConfigMap contents. `helm upgrade` therefore triggers an
automatic rolling restart of affected StatefulSets whenever either ConfigMap changes —
without needing a manual `kubectl rollout restart`.

## Features

- **DNS** — authoritative zones, recursive forwarding (UDP/TCP/DoT/DoH/QUIC), PTR records, reverse zones
- **DHCP** — IPv4 scopes with lease ranges, static leases, IPv6 support
- **Deno configurator sidecar** — applies full DNS/DHCP state via the Technitium REST API on every pod start; idempotent
- **PostgreSQL query logging** — optional `Query Logs (PostgreSQL)` Technitium app; multiple segments share one database, rows are distinguished by the `server` column
- **Prometheus metrics** — optional exporter sidecar (`technitium-dns-prometheus-exporter`)
- **Ingress** — optional per-segment Technitium web UI exposure
- **RBAC** — ServiceAccount, Role, and RoleBinding per segment

## Prerequisites

| Requirement | Notes |
|---|---|
| Kubernetes (tested on K3s) | |
| [Multus CNI](https://github.com/k8snetworkplumbingwg/multus-cni) | secondary interfaces for segment NICs |
| StorageClass | default: `local-path`; `local-path-retain` recommended for production |
| PostgreSQL | optional, for DNS query logging |

## Quick Start

### 1. Apply the shared configurator ConfigMap

The `configure.ts` script lives outside Helm's template directory so it can be updated
independently of any segment release:

```bash
kubectl create configmap unified-dns-dhcp-configurator-script \
  --from-file=configure.ts=configure.ts -n dns-dhcp \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 2. Create an API token secret (optional but recommended)

A long-lived API token avoids password-based login in the configurator. Generate one
via the Technitium web UI after first boot, then:

```bash
kubectl create secret generic unified-dns-dhcp-<segment>-api-token \
  --from-literal=token=<value> -n dns-dhcp
```

The secret is optional (`optional: true` in the pod spec) — the configurator falls back
to password auth if it is absent.

### 3. Deploy a segment

```bash
helm upgrade --install my-segment . \
  --namespace dns-dhcp --create-namespace \
  --values values-my-segment.yaml
```

## Configuration

All configuration lives in `values.yaml`. The `segments` list is empty by default — add
one entry per segment you want to deploy.

### Minimal example

```yaml
global:
  namespace: dns-dhcp
  adminPassword: "changeme"
  dnsHostname: "dns"          # prepended to zone name → DNS_SERVER_DOMAIN

network:
  serviceCIDR: "10.43.0.0/16"
  podGateway: "10.42.X.1"    # node-local gateway — matches the pod subnet of the DNS node

segments:
  - name: "130"
    zone:
      forward: "vlan130.example.com"
      reverseV4: "130.168.192.in-addr.arpa"
      reverseV6: "0.3.1.0.8.6.1.0.2.9.1.0.0.0.d.f.ip6.arpa"
    ipv4:
      subnet: "192.168.130.0/24"
      dns:     "192.168.130.5"
      dhcp:    "192.168.130.5"
      gateway: "192.168.130.1"
      range:
        start: "192.168.130.50"
        end:   "192.168.130.200"
    ipv6:
      dns:     "fd00:192:168:130::5"
      dhcp:    "fd00:192:168:130::5"
      gateway: "fd00:192:168:130::1"
    network:
      attachment: "vlan.130"      # host NIC or VLAN subinterface for Multus
    upstream:
      # protocol: Udp | Tcp | Tls | Https | HttpsJson | Quic
      protocol:   Https
      nameServer: "doh.example.com"
      dohPath:    "/dns-query"
    staticRecords:
      - hostname: "my-router"
        ipv4: "192.168.130.1"
        ipv6: "fd00:192:168:130::1"
    staticLeases:
      - hostname: "my-device"
        mac:  "aa:bb:cc:dd:ee:ff"
        ipv4: "192.168.130.10"
```

### PostgreSQL query logging

Technitium's `Query Logs (PostgreSQL)` app is downloaded and configured automatically by
the configurator when enabled. All segment servers can log to the same database; the
`server` column distinguishes entries per instance.

```yaml
queryLogs:
  postgres:
    enabled: true
    appUrl: "https://download.technitium.com/dns/apps/QueryLogsPostgreSqlApp-v1.2.zip"
    connectionString: "Server=pg.example.com; Port=5432; Username=dns_logs; Password=secret;"
    databaseName: "dns-logs"
    maxLogDays: 0      # 0 = keep forever
    maxLogRecords: 0   # 0 = keep forever
```

> **Note**: the `connectionString` must **not** include a `Database=` key — Technitium
> reads the database name from the separate `databaseName` field.

### Prometheus metrics

```yaml
metrics:
  enabled: true   # deploys the metrics sidecar; requires the API token secret to exist
```

Prometheus scrape annotations (`prometheus.io/scrape`, `prometheus.io/port`,
`prometheus.io/path`) are added to the pod automatically when metrics are enabled.

### Node affinity / tolerations

```yaml
nodeSelector:
  kubernetes.io/hostname: my-dns-node

tolerations:
  - key: dedicated
    operator: Equal
    value: my-dns-node
    effect: NoSchedule
```

## Updating `configure.ts`

The configurator script is shared across all segment releases via a single ConfigMap and
is not owned by any individual Helm release. After editing `configure.ts`:

```bash
kubectl create configmap unified-dns-dhcp-configurator-script \
  --from-file=configure.ts=configure.ts -n dns-dhcp \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl rollout restart statefulset -n dns-dhcp -l app=unified-dns-dhcp
```

## Accessing the Web UI

```bash
# Port-forward
kubectl port-forward -n dns-dhcp statefulset/unified-dns-dhcp-130 5380:5380
# http://localhost:5380
```

Or configure ingress per segment:

```yaml
    ingress:
      enabled: true
      host: "dns-130.example.com"
      path: "/"
      externalIP: "203.0.113.1"
```

## Write-ups

- [It's always DNS](docs/blog/its-always-dns.md) — the story behind this
  chart: MikroTik/Pi-hole/DoH detours, the per-SSID region idea that broke
  VRF-based DHCP, and landing on Technitium. Also published at
  [mabels.github.io/unified-dns-dhcp-chart/writeups](https://mabels.github.io/unified-dns-dhcp-chart/writeups/).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

Apache License 2.0 — see [LICENSE](LICENSE).
