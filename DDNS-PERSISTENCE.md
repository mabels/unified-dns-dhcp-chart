# Dynamic DNS Persistence

## Problem

Without persistent storage, DDNS (Dynamic DNS) updates are lost when pods restart. This happens because:

1. **BIND**: Journal files (`.jnl`) containing dynamic updates are stored in memory
2. **Knot**: Journal and timer files in `/var/lib/knot` are ephemeral
3. **Kea DHCP**: Lease database needs persistence (already handled)

## Solution

The chart now includes **persistent volumes** for DNS journal files and dynamic updates.

### BIND Storage (Default)

```yaml
# volumeClaimTemplates
- name: bind-cache      # NEW!
  size: 200Mi
  mountPath: /var/cache/bind
  contains:
    - Journal files (.jnl)
    - Managed keys
    - Session files
    - Dynamic zone updates

- name: zones
  size: 100Mi
  mountPath: /etc/bind/zones
  contains:
    - Static zone files
    - Zone configuration
```

**What's Persistent:**
- ✅ All DDNS updates via journal files
- ✅ DNSSEC managed keys
- ✅ Zone serial numbers
- ✅ Dynamic zone content

### Knot Storage (Alternative)

```yaml
# volumeClaimTemplates  
- name: knot-storage    # NEW!
  size: 200Mi
  mountPath: /var/lib/knot
  contains:
    - Journal files
    - Zone timers (refresh, expire)
    - KASP database (DNSSEC)
    - Zone content

- name: zones
  size: 100Mi
  mountPath: /var/lib/knot/zones
  contains:
    - Zone files
```

## How It Works

### BIND Flow

1. **Kea DHCP** gets a lease → sends DDNS update to Kea-DDNS
2. **Kea-DDNS** forwards update to BIND (port 5353) with TSIG auth
3. **BIND** receives update:
   - Writes to journal file: `/var/cache/bind/dynamic/<zone>.jnl`
   - Updates in-memory zone
   - Journal is persistent (PVC)
4. **Pod restarts**:
   - BIND reads journal file on startup
   - Replays all DDNS updates
   - Zone is restored with all dynamic records

### Knot Flow

1. **Kea DHCP** → **Kea-DDNS** → **Knot** (same as BIND)
2. **Knot** receives update:
   - Writes to journal: `/var/lib/knot/journal/<zone>.journal`
   - Updates zone file automatically
   - Both persistent (PVC)
3. **Pod restarts**:
   - Knot reads journal and zone files
   - All dynamic records restored

## Configuration

### Enable BIND (Default)

```yaml
# values.yaml
global:
  authDNS:
    type: bind  # Uses bind-cache PVC automatically
```

### Enable Knot

```yaml
# values.yaml
global:
  authDNS:
    type: knot  # Uses knot-storage PVC automatically
```

### Storage Size

Adjust PVC sizes if needed:

```yaml
# values.yaml
global:
  storage:
    className: "local-path"
    
# Sizes are hardcoded in StatefulSet, but can be templated:
# bind-cache: 200Mi (recommended for ~10k dynamic records)
# knot-storage: 200Mi
# zones: 100Mi
# kea-leases: 100Mi
```

## Verification

### Check Persistent Volumes

```bash
kubectl --context=mam-hh-dns1 get pvc -n dns-dhcp
```

Expected output:
```
NAME                                STATUS   VOLUME                  CAPACITY
bind-cache-unified-dns-dhcp-128-0   Bound    pvc-xxx                 200Mi
zones-unified-dns-dhcp-128-0        Bound    pvc-yyy                 100Mi
kea-leases-unified-dns-dhcp-128-0   Bound    pvc-zzz                 100Mi
```

### Test DDNS Persistence

1. **Create a DHCP lease** (triggers DDNS):
```bash
# From a client in the segment network
dhclient eth0
```

2. **Verify DNS record created**:
```bash
dig @192.168.128.5 client-hostname.seg128.local A
```

3. **Restart the pod**:
```bash
kubectl --context=mam-hh-dns1 delete pod unified-dns-dhcp-128-0 -n dns-dhcp
```

4. **Wait for pod to restart**, then check again:
```bash
dig @192.168.128.5 client-hostname.seg128.local A
```

Record should **still exist**! ✅

### Check BIND Journal Files

```bash
kubectl --context=mam-hh-dns1 exec -it unified-dns-dhcp-128-0 -n dns-dhcp -c bind -- \
  ls -lah /var/cache/bind/dynamic/
```

Expected:
```
-rw-r--r-- 1 bind bind  1.2K seg128.local.jnl
-rw-r--r-- 1 bind bind  800  128.168.192.in-addr.arpa.jnl
```

### Check Knot Storage

```bash
kubectl --context=mam-hh-dns1 exec -it unified-dns-dhcp-128-0 -n dns-dhcp -c knot -- \
  ls -lah /var/lib/knot/
```

## BIND Configuration Requirements

For DDNS persistence to work, BIND configuration must include:

```bind
zone "seg128.local" {
    type master;
    file "/etc/bind/zones/seg128.local.zone";
    
    // CRITICAL: Journal file location (persistent)
    journal "/var/cache/bind/dynamic/seg128.local.jnl";
    
    // Allow DDNS updates from Kea
    allow-update { key "ddns_key"; };
    
    // Write zone changes back to file (optional)
    // ixfr-from-differences yes;
};
```

**Note:** The `configmaps.yaml` template should generate this automatically.

## Knot Configuration Requirements

```yaml
zone:
  - domain: seg128.local
    storage: /var/lib/knot
    file: zones/seg128.local.zone
    
    # Journal is automatic in Knot
    # Stored at: /var/lib/knot/journal/seg128.local.journal
    
    acl: allow_ddns
```

## Troubleshooting

### Journal Files Not Created

**BIND:**
```bash
# Check BIND logs
kubectl --context=mam-hh-dns1 logs unified-dns-dhcp-128-0 -n dns-dhcp -c bind

# Check permissions
kubectl --context=mam-hh-dns1 exec -it unified-dns-dhcp-128-0 -n dns-dhcp -c bind -- \
  ls -la /var/cache/bind/
```

Should be owned by `bind:bind` (UID 100:101).

**Knot:**
```bash
# Check Knot logs
kubectl --context=mam-hh-dns1 logs unified-dns-dhcp-128-0 -n dns-dhcp -c knot

# Check storage
kubectl --context=mam-hh-dns1 exec -it unified-dns-dhcp-128-0 -n dns-dhcp -c knot -- \
  ls -la /var/lib/knot/journal/
```

### DDNS Updates Lost After Restart

1. **Check PVC exists and is bound**:
```bash
kubectl --context=mam-hh-dns1 get pvc -n dns-dhcp | grep bind-cache
```

2. **Verify mount in pod**:
```bash
kubectl --context=mam-hh-dns1 describe pod unified-dns-dhcp-128-0 -n dns-dhcp | grep -A 5 "Mounts:"
```

3. **Check journal file persists across restarts**:
```bash
# Before restart
kubectl exec ... -c bind -- ls -l /var/cache/bind/dynamic/
# Note the timestamp

# After restart
kubectl exec ... -c bind -- ls -l /var/cache/bind/dynamic/
# Timestamp should be old (file persisted)
```

### Permission Errors

If BIND can't write to `/var/cache/bind`:

```bash
# Check init-container logs
kubectl logs unified-dns-dhcp-128-0 -n dns-dhcp -c init-zones

# Manually fix (temporary)
kubectl exec -it unified-dns-dhcp-128-0 -n dns-dhcp -c bind -- \
  chown -R bind:bind /var/cache/bind
```

### Storage Full

If journal files grow too large:

```bash
# Check usage
kubectl exec unified-dns-dhcp-128-0 -n dns-dhcp -c bind -- \
  du -sh /var/cache/bind/*

# Increase PVC size (requires recreation)
# Edit statefulset.yaml: bind-cache storage: 500Mi
```

## Best Practices

1. **Regular Backups**: Backup PVCs periodically
2. **Monitor Storage**: Alert on >80% usage
3. **Journal Rotation**: BIND/Knot handle this automatically
4. **Zone Freezing**: Use `rndc freeze/thaw` for manual zone edits in BIND
5. **Monitoring**: Check Stork dashboard for DDNS activity

## Storage Requirements Estimate

**Per Segment:**
- **Zones**: ~1-10 MB (static zone files)
- **Journal**: ~100 KB per 1000 DDNS updates
- **Kea Leases**: ~10 KB per 100 leases

**Example (1000 dynamic records):**
- bind-cache: ~150 MB used
- zones: ~5 MB used
- kea-leases: ~50 MB used

**Recommended PVC Sizes:**
- Small networks (<100 devices): 100Mi each
- Medium networks (<1000 devices): 200Mi (default)
- Large networks (>1000 devices): 500Mi+

## Migration from Previous Version

If upgrading from chart version <1.1.0 without persistent storage:

1. **All DDNS updates will be lost** on first deployment
2. New PVCs will be created automatically
3. Future updates will be persistent
4. Recommendation: **Renew all DHCP leases** after upgrade to repopulate DNS

## References

- [BIND 9 Dynamic Update](https://bind9.readthedocs.io/en/latest/reference.html#dynamic-update)
- [Knot DNS Dynamic Updates](https://www.knot-dns.cz/docs/latest/singlehtml/#dynamic-updates)
- [Kea DHCP DDNS](https://kea.readthedocs.io/en/latest/arm/ddns.html)
