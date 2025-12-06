# Deployment Modes

The unified-dns-dhcp chart supports **two deployment modes**:

1. **Server-Only Deployment** - Stork monitoring server
2. **Segment Deployment** - DNS/DHCP services with Stork Agent

## Architecture Overview

```
┌─────────────────────────────────────────┐
│  Stork Server Deployment (ONCE)        │
│  ────────────────────────────────────   │
│  - Stork Server (Web UI)                │
│  - PostgreSQL connection                │
│  - Ingress (optional)                   │
│  - No DNS/DHCP services                 │
└─────────────────────────────────────────┘
                    ▲
                    │ gRPC
         ┌──────────┴──────────┐
         │                     │
┌────────▼──────┐     ┌────────▼──────┐
│ Segment 128   │     │ Segment 129   │
│ ────────────  │     │ ────────────  │
│ - Unbound     │     │ - Unbound     │
│ - BIND/Knot   │     │ - BIND/Knot   │
│ - Kea DHCP    │     │ - Kea DHCP    │
│ - Kea DDNS    │     │ - Kea DDNS    │
│ - Stork Agent │     │ - Stork Agent │
└───────────────┘     └───────────────┘
```

## Mode 1: Server-Only Deployment

Deploy the **Stork Server** once per cluster.

### Configuration

**values-stork-server.yaml:**
```yaml
stork:
  enabled: true
  server:
    enabled: true      # ← Enable server
  ingress:
    enabled: true      # ← Expose Web UI
    hosts:
      - stork.example.com
  agent:
    enabled: false     # ← No agent needed

segments: []           # ← No segments!
```

### Deploy

```bash
helm upgrade --install stork-server . \
  --namespace dns-dhcp \
  --kube-context mam-hh-dns1 \
  --values values-stork-server.yaml
```

### What Gets Deployed

- ✅ Stork Server (Deployment)
- ✅ Stork Server Service (ClusterIP)
- ✅ Ingress (optional)
- ✅ Database Secret
- ❌ No DNS/DHCP services
- ❌ No segment StatefulSets
- ❌ No Stork Agents

### Access Web UI

**Via Port-Forward:**
```bash
kubectl --context=mam-hh-dns1 port-forward -n dns-dhcp svc/stork-server 8080:8080
# Open: http://localhost:8080
# Login: admin / admin
```

**Via Ingress:**
```bash
# https://stork.example.com
# (requires cert-manager + external-dns)
```

---

## Mode 2: Segment Deployment

Deploy **multiple times** - once per network segment.

### Configuration

**values-segment-128.yaml:**
```yaml
stork:
  enabled: true
  server:
    enabled: false     # ← Server deployed separately
    port: 8080         # ← Server URL for agent
  agent:
    enabled: true      # ← Enable agent sidecar

segments:
  - name: "128"        # ← ONE segment per deployment
    domain: seg128.local
    ipv4:
      network: 192.168.128.0/24
      # ... etc
```

### Deploy

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

# Segment 130
helm upgrade --install segment-130 . \
  --namespace dns-dhcp \
  --kube-context mam-hh-dns1 \
  --values values-segment-130.yaml
```

### What Gets Deployed

- ✅ StatefulSet (1 per segment)
  - Unbound (recursive resolver)
  - BIND or Knot (authoritative)
  - Kea DHCP + DDNS
  - **Stork Agent** (sidecar)
- ✅ ConfigMap (segment config)
- ✅ Service (DNS/DHCP endpoints)
- ✅ PVCs (zones, bind-cache, kea-leases)
- ❌ No Stork Server
- ❌ No Ingress

---

## Complete Deployment Workflow

### Prerequisites

1. **PostgreSQL running:**
```bash
cd ../postgresql
./deploy.sh
```

2. **Create Stork database:**
```bash
./create-database.sh stork stork_user
# Save password!
```

3. **Create database secret:**
```bash
kubectl --context=mam-hh-dns1 create secret generic stork-db-credentials \
  --from-literal=password='YOUR_STORK_PASSWORD' \
  -n dns-dhcp
```

### Step 1: Deploy Stork Server

```bash
cd /path/to/unified-dns-dhcp

helm upgrade --install stork-server . \
  --namespace dns-dhcp \
  --create-namespace \
  --kube-context mam-hh-dns1 \
  --values values-stork-server.yaml
```

**Verify:**
```bash
kubectl --context=mam-hh-dns1 get pods -n dns-dhcp -l app=stork-server
kubectl --context=mam-hh-dns1 get ingress -n dns-dhcp
```

### Step 2: Deploy Segments

```bash
# Customize values for each segment
cp values-segment-example.yaml values-segment-128.yaml
# Edit: name: "128", ipv4/ipv6 config, etc.

helm upgrade --install segment-128 . \
  --namespace dns-dhcp \
  --kube-context mam-hh-dns1 \
  --values values-segment-128.yaml
```

**Verify:**
```bash
kubectl --context=mam-hh-dns1 get statefulsets -n dns-dhcp
kubectl --context=mam-hh-dns1 get pods -n dns-dhcp
```

### Step 3: Check Stork Dashboard

```bash
kubectl --context=mam-hh-dns1 port-forward -n dns-dhcp svc/stork-server 8080:8080
```

Open http://localhost:8080, you should see:
- All segments registered
- DHCP statistics
- DNS zone info
- Server health status

---

## Ingress Configuration

### Example 1: cert-manager + external-dns

**values-stork-server.yaml:**
```yaml
stork:
  ingress:
    enabled: true
    className: "nginx"  # or "traefik"
    
    hosts:
      - stork.mam-hh-dns1.example.com
    
    annotations:
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
      external-dns.alpha.kubernetes.io/hostname: "stork.mam-hh-dns1.example.com"
    
    tls:
      enabled: true  # Auto-generates secret name from hostname
```

**Generated TLS Secret:**
```
stork-mam-hh-dns1-abels-name
```

### Example 2: Custom TLS Secret

**values-stork-server.yaml:**
```yaml
stork:
  ingress:
    enabled: true
    
    hosts:
      - stork.example.com
    
    tls:
      enabled: true
      # Secret name auto-generated: stork-example-com
```

**Manually create secret:**
```bash
kubectl create secret tls stork-example-com \
  --cert=path/to/cert.pem \
  --key=path/to/key.pem \
  -n dns-dhcp
```

### Example 3: Multiple Hostnames

**values-stork-server.yaml:**
```yaml
stork:
  ingress:
    enabled: true
    
    hosts:
      - stork.example.com
      - stork-monitor.example.com
    
    annotations:
      cert-manager.io/cluster-issuer: "letsencrypt-prod"
    
    tls:
      enabled: true
      # Generates two secrets:
      # - stork-example-com
      # - stork-monitor-example-com
```

### Example 4: Disable TLS

**values-stork-server.yaml:**
```yaml
stork:
  ingress:
    enabled: true
    
    hosts:
      - stork.local
    
    tls:
      enabled: false  # HTTP only
```

---

## Per-Segment Stork Agent Control

You can disable Stork Agent for specific segments:

**values-segment-dmz.yaml:**
```yaml
segments:
  - name: "dmz"
    domain: dmz.local
    # ... config ...
    
    # Disable Stork monitoring for this segment
    storkAgent:
      enabled: false
```

---

## Upgrade Existing Deployments

### From v1.0.x (No Stork)

1. **Deploy Stork Server first:**
```bash
helm upgrade --install stork-server . \
  --values values-stork-server.yaml
```

2. **Upgrade segments to enable agent:**
```bash
# Edit existing values file, add:
stork:
  enabled: true
  agent:
    enabled: true

helm upgrade segment-128 . \
  --values values-segment-128.yaml
```

Agents will automatically register with the server.

### From v1.1.0 (Stork in same pod - hypothetical)

If you had Stork Server in the same StatefulSet (wrong!), migrate:

1. **Delete old deployment:**
```bash
helm uninstall segment-128
```

2. **Deploy new architecture:**
```bash
# Server
helm upgrade --install stork-server . --values values-stork-server.yaml

# Segment
helm upgrade --install segment-128 . --values values-segment-128.yaml
```

---

## Troubleshooting

### Agents Not Showing Up

**Check agent logs:**
```bash
kubectl logs unified-dns-dhcp-128-0 -n dns-dhcp -c stork-agent
```

**Common issues:**
- Server URL wrong: Check `stork.server.port` matches actual server
- Network policy blocking: Ensure gRPC can reach server
- Agent disabled: Check `stork.agent.enabled: true`

### Server Not Accessible

**Check ingress:**
```bash
kubectl get ingress -n dns-dhcp stork-server -o yaml
```

**Check certificate:**
```bash
kubectl get certificate -n dns-dhcp
kubectl describe certificate stork-mam-hh-dns1-abels-name
```

### Database Connection Failed

**Check secret exists:**
```bash
kubectl get secret stork-db-credentials -n dns-dhcp
```

**Check PostgreSQL is reachable:**
```bash
kubectl run -it --rm debug --image=postgres:16-alpine --restart=Never -- \
  psql -h postgresql.postgresql.svc.cluster.local -U stork_user -d stork
```

---

## Best Practices

1. **Always deploy Server first**
   - Agents need server to register

2. **One segment per Helm release**
   - Easier to manage
   - Independent upgrades
   - Clear separation

3. **Use separate values files**
   - `values-stork-server.yaml`
   - `values-segment-128.yaml`
   - `values-segment-129.yaml`
   - etc.

4. **Enable Ingress for Server**
   - Much easier than port-forward
   - Use TLS + cert-manager
   - Add external-dns

5. **Monitor storage usage**
   - Stork database grows over time
   - Journal files in segments
   - Set up backups

---

## Files Reference

| File | Purpose |
|------|---------|
| `values.yaml` | Default values (reference) |
| `values-stork-server.yaml` | Server-only deployment |
| `values-segment-example.yaml` | Segment deployment template |
| `templates/stork-server.yaml` | Server Deployment + Service |
| `templates/stork-ingress.yaml` | Ingress for Web UI |
| `templates/statefulset.yaml` | Segment pods with agent sidecar |

---

## Summary

**Two deployment commands:**

```bash
# 1. Deploy Stork Server (ONCE)
helm upgrade --install stork-server . \
  --values values-stork-server.yaml \
  -n dns-dhcp

# 2. Deploy Segments (MULTIPLE TIMES)
helm upgrade --install segment-128 . \
  --values values-segment-128.yaml \
  -n dns-dhcp

helm upgrade --install segment-129 . \
  --values values-segment-129.yaml \
  -n dns-dhcp
```

**Result:**
- ✅ One Stork Server with Web UI
- ✅ Multiple segment pods with agents
- ✅ Centralized monitoring
- ✅ Flexible, scalable architecture
