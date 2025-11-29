# Unified DNS/DHCP Helm Chart

This Helm chart deploys a unified DNS forwarder, authoritative DNS server, and DHCP server across multiple network segments in your Kubernetes cluster.

## Features

- **DNS Forwarding**: Knot Resolver for caching and forwarding DNS queries
- **Authoritative DNS**: Knot DNS server for managing local zones
- **DHCP**: Kea DHCP server with dynamic DNS updates
- **Multi-segment**: Easily deploy across multiple network segments
- **Template-driven**: All configuration managed through `values.yaml`

## Architecture

Each network segment gets:
- A unified pod containing:
  - Knot Resolver (DNS forwarder on port 53)
  - Knot Auth (Authoritative DNS on port 5353)
  - Kea DHCP4 server
  - Kea DHCP-DDNS server

Plus a central authoritative DNS server accessible via ClusterIP service for inter-segment communication.

## Installation

### From Helm Repository

Add the Helm repository:

```bash
helm repo add unified-dns-dhcp https://mabels.github.io/unified-dns-dhcp-chart/
helm repo update
```

Install the chart:

```bash
# Create namespace
kubectl create namespace dns-dhcp

# Install with default values
helm install my-dns-dhcp unified-dns-dhcp/unified-dns-dhcp -n dns-dhcp

# Install with custom values
helm install my-dns-dhcp unified-dns-dhcp/unified-dns-dhcp \
  -n dns-dhcp \
  --values custom-values.yaml
```

### From Source

```bash
# Clone the repository
git clone https://github.com/mabels/unified-dns-dhcp-chart.git
cd unified-dns-dhcp-chart

# Create namespace
kubectl create namespace dns-dhcp

# Install the chart
helm install my-dns-dhcp . -n dns-dhcp

# Upgrade with custom values
helm upgrade my-dns-dhcp . -n dns-dhcp --values custom-values.yaml
```

### Uninstall

```bash
helm uninstall my-dns-dhcp -n dns-dhcp
```

## Configuration

All configuration is done through `values.yaml`. Key sections:

### Segments
Define your network segments:
```yaml
segments:
  - name: "128"
    displayName: "example-network"
    ipv4:
      subnet: "192.168.128.0/24"
      dns: "192.168.128.5"
      dhcp: "192.168.128.6"
      range:
        start: "192.168.128.50"
        end: "192.168.128.200"
    zone:
      forward: "example.local"
      reverseV4: "128.168.192.in-addr.arpa"
```

### Global Configuration
```yaml
global:
  namespace: "dns-dhcp"
  upstreamDNS:
    - "8.8.8.8"
    - "1.1.1.1"
  ddns:
    key: "your-base64-key"
    keyName: "ddns_key"
```

## Testing

### Test DNS resolution
```bash
dig @192.168.128.5 www.google.com
dig @192.168.128.5 test.example.local
```

### Test DHCP
Request a DHCP lease on the network and check:
```bash
kubectl logs -f unified-dns-dhcp-128-xxx -n dns-dhcp -c kea-dhcp4
kubectl logs -f unified-dns-dhcp-128-xxx -n dns-dhcp -c kea-ddns
```

### Check authoritative DNS
```bash
kubectl logs -f knot-auth-xxx -n dns-dhcp
```

## Monitoring

### Real-time DHCP Activity Monitor

A monitoring script is included to watch DHCP activity in real-time with hostname resolution:

```bash
./scripts/tail-dhcp-requests.sh <segment>

# Examples:
./scripts/tail-dhcp-requests.sh 128
./scripts/tail-dhcp-requests.sh 129
```

This displays:
- **DISCOVER**: Clients searching for DHCP servers
- **OFFER**: Server offering IP addresses
- **REQUEST**: Clients requesting IPs
- **ACK**: Server acknowledging leases
- **Hostnames**: Resolved from lease database

Example output:
```
[2025-11-29 14:39:54.543] DISCOVER from MAC: aa:0e:20:6a:78:14
[2025-11-29 14:39:54.543] OFFER    192.168.128.38 to aa:0e:20:6a:78:14
[2025-11-29 14:39:54.544] REQUEST  from MAC: aa:0e:20:6a:78:14
[2025-11-29 14:39:54.545] ACK      192.168.128.38 to aa:0e:20:6a:78:14 (server.example.local) for 3600s
```

## Troubleshooting

### View logs for a specific segment
```bash
# DNS resolver
kubectl logs -f unified-dns-dhcp-129-0 -n dns-dhcp -c unbound

# Authoritative DNS
kubectl logs -f unified-dns-dhcp-129-0 -n dns-dhcp -c knot-auth

# DHCP
kubectl logs -f unified-dns-dhcp-129-0 -n dns-dhcp -c kea-dhcp4

# DDNS
kubectl logs -f unified-dns-dhcp-129-0 -n dns-dhcp -c kea-ddns
```

### Check network attachments
```bash
kubectl get network-attachment-definitions -n dns-dhcp
```

### Verify PVC
```bash
kubectl get pvc -n dns-dhcp
kubectl get pv
```

### Check DHCP leases
```bash
kubectl exec unified-dns-dhcp-128-0 -n dns-dhcp -c kea-dhcp4 -- cat /var/lib/kea/dhcp4.leases
```
