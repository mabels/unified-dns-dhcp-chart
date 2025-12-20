{{- define "configs.kresd" -}}
kresd.conf: |

  -- Load DNSSEC trust anchors
  trust_anchors.add_file('/etc/knot-resolver/root.keys')
  modules = {
    'policy',
    'hints > iterate',
    'http',
    'prometheus',
  }

  -- Enable Prometheus metrics endpoint
  http.prometheus.namespace = 'kresd'

  net.listen('{{ .segment.ipv4.dns }}', 53, { kind = 'dns' })
  net.listen('{{ .segment.ipv6.dns }}', 53, { kind = 'dns' })
  net.listen('127.0.0.1', 200, { kind = 'dns' })

  -- HTTP endpoint for metrics (on localhost only for security)
  net.listen('::', 8453, { kind = 'webmgmt' })
  net.listen('0.0.0.0', 8453, { kind = 'webmgmt' })

  local target_ns_address = '{{ .global.authDNS.service }}@{{ .global.authDNS.port }}'

  policy.add(
     policy.suffix(
        policy.STUB(target_ns_address),
        policy.todnames({'{{ .segment.zone.forward }}'})
     )
  )
  policy.add(
     policy.suffix(
        policy.STUB(target_ns_address),
        policy.todnames({'{{ .segment.zone.reverseV4 }}'})
     )
  )
  {{- if .segment.zone.reverseV6 }}
  policy.add(
     policy.suffix(
        policy.STUB(target_ns_address),
        policy.todnames({'{{ .segment.zone.reverseV6 }}'})
     )
  )
  {{- end }}

  cache.size = 100 * MB
{{- end -}}
