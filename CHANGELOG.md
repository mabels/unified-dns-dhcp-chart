# Changelog

All notable changes to the unified-dns-dhcp Helm chart will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-12-06

### Added

- **Split Deployment Architecture**
  - **Server-Only Mode**: Deploy Stork Server separately with `segments: []`
  - **Segment Mode**: Deploy DNS/DHCP services with Stork Agent sidecar
  - Flexible: One server deployment + multiple segment deployments
  - Independent scaling and updates per segment
  - New files: `values-stork-server.yaml`, `values-segment-example.yaml`
  - Documentation: `DEPLOYMENT-MODES.md`

- **Stork Monitoring Integration**
  - Stork Server for centralized monitoring web UI (separate deployment)
  - Stork Agent as sidecar in each segment pod
  - PostgreSQL backend for Stork data storage
  - Real-time DHCP lease statistics and pool utilization
  - DNS zone monitoring (BIND/Knot)
  - Host reservations management
  - Grafana integration via Prometheus exporter
  - Documentation: `STORK-SETUP.md`

- **Stork Ingress Support** (NEW!)
  - Configurable Ingress for Stork Web UI (`templates/stork-ingress.yaml`)
  - TLS enabled by default with auto-generated secret names
  - Custom annotations support (cert-manager, external-dns, etc.)
  - Multiple hostname support
  - Path and pathType configuration
  - IngressClassName support
  - Configuration: `stork.ingress.*` in values

- **DDNS Persistence** (CRITICAL!)
  - New PVC: `bind-cache` (200Mi) for BIND journal files
  - New PVC: `knot-storage` (200Mi) for Knot journal and timers
  - Dynamic DNS updates persist across pod restarts
  - Journal files (.jnl) stored on persistent volume
  - Init-container to fix permissions (bind:bind, 100:101)
  - Documentation: `DDNS-PERSISTENCE.md`

- **Configurable Authoritative DNS Server**
  - Choose between BIND9 or Knot DNS via `global.authDNS.type`
  - BIND: Better Stork integration, ISC standard
  - Knot: High performance, CZ.NIC
  - Unbound always handles recursive queries
  - Authoritative server handles local zones only (port 5353)

- **Per-Segment Stork Agent Control**
  - Global enable/disable: `stork.enabled`
  - Default agent behavior: `stork.agent.enabled`
  - Per-segment override: `segments[].storkAgent.enabled`

### Changed

- **StatefulSet Template** (`templates/statefulset.yaml`)
  - Added BIND container with persistent `/var/cache/bind` mount
  - Added Knot container with persistent `/var/lib/knot` mount
  - Added Stork Agent sidecar (conditional)
  - Added init-container for zone and permissions setup
  - Improved security context (runAsUser, runAsGroup)

- **Values Structure**
  - Added `stork.ingress.*` configuration block
  - Split `stork.server.enabled` for separate deployment control
  - Added `global.images.storkServer` and `storkAgent`
  - Default `stork.server.enabled: false` in base values.yaml

### Fixed

- DDNS updates now persist across pod restarts (via bind-cache PVC)
- BIND permissions issues (chown bind:bind in init-container)
- Stork Server now deployable independently from segments

### Documentation

- `DEPLOYMENT-MODES.md` - Complete guide for split deployment
- `DDNS-PERSISTENCE.md` - DDNS journal file persistence guide
- `STORK-SETUP.md` - Stork monitoring setup (updated)
- `values-stork-server.yaml` - Example for server-only deployment
- `values-segment-example.yaml` - Template for segment deployments
- Updated README.md with deployment workflow

### Migration Guide (from 1.0.x)

**BREAKING CHANGES:** None! All features are optional and backward compatible.

**To enable new features:**

1. **Deploy Stork Server** (optional):
   ```bash
   helm upgrade --install stork-server . \
     --values values-stork-server.yaml \
     -n dns-dhcp
   ```

2. **Upgrade segments** to enable Stork Agent:
   ```yaml
   # Add to your values:
   stork:
     enabled: true
     agent:
       enabled: true
   ```

3. **DDNS Persistence**: Automatic on upgrade
   - New PVCs created automatically
   - Existing DDNS records lost on first restart (renew DHCP leases)
   - Future updates will persist

## [1.0.2] - 2025-12-05

### Fixed

- Init-container routing fix for Multus networks
- Default route metric adjustment

### Changed

- Improved routing configuration for multi-interface pods

## [1.0.1] - 2025-12-04

### Added

- Initial release with unified DNS/DHCP services
- Unbound recursive resolver
- Kea DHCP4 server
- Kea DHCP-DDNS
- Multi-segment support
- Multus network attachment
- ConfigMap-based configuration

### Features

- DNS recursive resolution
- DHCP IPv4/IPv6 support
- Dynamic DNS updates
- Per-segment configuration
- StatefulSet-based deployment
- Persistent storage for zones and leases

---

## Unreleased

### Planned

- [ ] Prometheus metrics endpoint for Kea DHCP
- [ ] Kea High Availability (HA) support
- [ ] IPv6-only segment support
- [ ] DHCP relay agent support
- [ ] Advanced BIND/Knot zone management
- [ ] Automated backup/restore for zones and leases
- [ ] Health checks for DNS/DHCP services
- [ ] Horizontal pod autoscaling (HPA) support
- [ ] Custom resource definitions (CRDs) for easier management
