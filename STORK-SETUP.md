# Stork Monitoring Setup

Stork provides a web-based dashboard for monitoring and managing Kea DHCP and BIND/Knot DNS servers.

## Architecture

```
┌──────────────────────────────────────┐
│  Stork Server (Web UI)               │
│  Port: 8080                          │
│  Namespace: dns-dhcp                 │
│  Database: PostgreSQL                │
└────────────┬─────────────────────────┘
             │ gRPC
       ┌─────┴─────┬─────────┬─────────┐
       │           │         │         │
   ┌───▼───┐   ┌──▼───┐  ┌──▼───┐  ┌──▼───┐
   │Agent  │   │Agent │  │Agent │  │Agent │
   │Seg100 │   │Seg128│  │Seg130│  │Seg131│
   │       │   │      │  │      │  │      │
   │Kea+   │   │Kea+  │  │Kea+  │  │Kea+  │
   │BIND   │   │BIND  │  │BIND  │  │BIND  │
   └───────┘   └──────┘  └──────┘  └──────┘
```

## Prerequisites

### 1. PostgreSQL Database

Stork requires PostgreSQL. If not already deployed:

```bash
cd /Users/menabe/Software/mam-hh-bb/gw-to-earth-ng/postgresql
./deploy.sh
```

### 2. Create Stork Database

```bash
cd /Users/menabe/Software/mam-hh-bb/gw-to-earth-ng/postgresql
./create-database.sh stork stork_user
```

Save the password output!

### 3. Update Stork Secret

Edit the Stork database password in the chart:

```yaml
# In templates/stork-server.yaml or create a separate secret
apiVersion: v1
kind: Secret
metadata:
  name: stork-db-credentials
stringData:
  password: "YOUR_STORK_DB_PASSWORD_HERE"
```

Or apply directly:
```bash
kubectl --context=mam-hh-dns1 create secret generic stork-db-credentials \
  --from-literal=password='YOUR_PASSWORD' \
  -n dns-dhcp
```

## Configuration

### Enable Stork (default: enabled)

```yaml
# values.yaml
stork:
  enabled: true
  
  server:
    enabled: true
    port: 8080
    database:
      host: "postgresql.postgresql.svc.cluster.local"
      port: 5432
      name: "stork"
      user: "stork_user"
      passwordSecret:
        name: "stork-db-credentials"
        key: "password"
  
  agent:
    enabled: true  # Enable for all segments by default
```

### Disable Stork Globally

```yaml
stork:
  enabled: false
```

### Disable Agent for Specific Segment

```yaml
segments:
  - name: "100"
    storkAgent:
      enabled: false  # Override for this segment only
```

## Deployment

### 1. Deploy Chart with Stork

```bash
helm upgrade --install my-segment ./unified-dns-dhcp \
  --namespace dns-dhcp \
  --kube-context mam-hh-dns1 \
  --values my-values.yaml
```

### 2. Verify Stork Server

```bash
kubectl --context=mam-hh-dns1 get pods -n dns-dhcp -l app=stork-server
kubectl --context=mam-hh-dns1 logs -n dns-dhcp -l app=stork-server -f
```

### 3. Verify Stork Agents

```bash
# Check agents in segment pods
kubectl --context=mam-hh-dns1 get pods -n dns-dhcp -l app=unified-dns-dhcp
kubectl --context=mam-hh-dns1 logs -n dns-dhcp unified-dns-dhcp-128-0 -c stork-agent
```

## Accessing Stork Web UI

### Port Forward (Development)

```bash
kubectl --context=mam-hh-dns1 port-forward -n dns-dhcp svc/stork-server 8080:8080
```

Then open: http://localhost:8080

### Ingress (Production)

Create an Ingress for Stork:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: stork-ingress
  namespace: dns-dhcp
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: traefik
  tls:
  - hosts:
    - stork.example.com
    secretName: stork-tls
  rules:
  - host: stork.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: stork-server
            port:
              number: 8080
```

Apply:
```bash
kubectl --context=mam-hh-dns1 apply -f stork-ingress.yaml
```

Access: https://stork.example.com

### Default Credentials

First login:
- Username: `admin`
- Password: `admin`

**Change immediately after first login!**

## Features

### Dashboard
- Server status overview
- Pool utilization
- High availability status
- Lease statistics

### DHCP Management
- View active leases (IPv4/IPv6)
- Manage host reservations
- Subnet overview
- Pool utilization graphs

### DNS Management (BIND/Knot)
- Zone information (read-only for now)
- Server status
- Query statistics

### Grafana Integration

Stork includes Prometheus exporter. Configure Grafana dashboard for:
- DHCP leases per second
- Pool utilization trends
- DNS query rates
- Server health metrics

## Troubleshooting

### Stork Server Not Starting

Check logs:
```bash
kubectl --context=mam-hh-dns1 logs -n dns-dhcp -l app=stork-server
```

Common issues:
- Database connection failed → Check PostgreSQL credentials
- Port already in use → Check service configuration

### Agent Not Connecting

Check agent logs:
```bash
kubectl --context=mam-hh-dns1 logs -n dns-dhcp unified-dns-dhcp-128-0 -c stork-agent
```

Common issues:
- Cannot reach server → Check server URL in agent config
- Permission denied → Check RBAC permissions

### Database Connection Issues

Test PostgreSQL connection:
```bash
kubectl --context=mam-hh-dns1 exec -it -n dns-dhcp deployment/stork-server -- \
  psql -h postgresql.postgresql.svc.cluster.local -U stork_user -d stork
```

## Monitoring

### Health Checks

Stork Server:
```bash
curl http://localhost:8080/api/version
```

Stork Agent:
```bash
kubectl --context=mam-hh-dns1 exec -it -n dns-dhcp unified-dns-dhcp-128-0 -c stork-agent -- \
  wget -O- http://localhost:8080/api/version
```

### Resource Usage

```bash
kubectl --context=mam-hh-dns1 top pods -n dns-dhcp -l app=stork-server
kubectl --context=mam-hh-dns1 top pods -n dns-dhcp -l app=unified-dns-dhcp
```

## Backup

### Database Backup

```bash
cd /Users/menabe/Software/mam-hh-bb/gw-to-earth-ng/postgresql
./backup-database.sh stork
```

### Configuration Backup

```bash
kubectl --context=mam-hh-dns1 get deployment stork-server -n dns-dhcp -o yaml > stork-server-backup.yaml
```

## Security

- Change default admin password immediately
- Use HTTPS with valid certificates for production
- Restrict network access to Stork UI
- Regular database backups
- Keep Stork updated

## Resources

- [Stork Documentation](https://stork.readthedocs.io/)
- [ISC Stork GitHub](https://github.com/isc-projects/stork)
- [Kea Documentation](https://kea.readthedocs.io/)
- [BIND Documentation](https://bind9.readthedocs.io/)
