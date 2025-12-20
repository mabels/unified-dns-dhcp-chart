{{- define "containers.init.routes" -}}
- name: init-routes
  image: busybox
  command: ['sh', '-c']
  args:
  - |
    # Remove the default route via eth0
    ip route del default via {{ .network.podGateway }} dev eth0 || true
    # Re-add it with a higher metric (100) so it's only used as backup
    ip route add default via {{ .network.podGateway }} dev eth0 metric 100
    # Add route for Kubernetes Service CIDR (for Stork Server, etc)
    ip route add {{ .network.serviceCIDR }} via {{ .network.podGateway }} dev eth0 || true
    echo "Routes configured:"
    ip route
  securityContext:
    capabilities:
      add: ["NET_ADMIN"]
{{- end -}}
