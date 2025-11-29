{{/*
Convert DNS A/AAAA records to reverse PTR records
Usage: {{ include "dns.to.reverse" (dict "record" "hostname IN A 192.168.1.1" "zone" "example.com" "reverseZone" "1.168.192.in-addr.arpa") }}
*/}}
{{- define "dns.to.reverse" -}}
{{- $record := .record | trim -}}
{{- $zone := .zone -}}
{{- $reverseZone := .reverseZone -}}
{{- $parts := regexSplit "\\s+" $record -1 -}}
{{- if ge (len $parts) 4 -}}
  {{- $name := index $parts 0 -}}
  {{- $in := index $parts 1 -}}
  {{- $type := index $parts 2 -}}
  {{- $ip := index $parts 3 -}}
  {{- /* Make hostname FQDN if it's not already */ -}}
  {{- $fqdn := $name -}}
  {{- if not (hasSuffix "." $name) -}}
    {{- if contains "." $name -}}
      {{- /* Already has domain, just add trailing dot */ -}}
      {{- $fqdn = printf "%s." $name -}}
    {{- else -}}
      {{- /* Append zone and trailing dot */ -}}
      {{- $fqdn = printf "%s.%s." $name $zone -}}
    {{- end -}}
  {{- end -}}
  {{- if eq $type "A" -}}
    {{- $octets := splitList "." $ip -}}
    {{- if eq (len $octets) 4 -}}
      {{- /* Calculate relative name based on reverse zone */ -}}
      {{- $reverseZoneParts := splitList "." (trimSuffix ".in-addr.arpa" $reverseZone) -}}
      {{- $numPartsToKeep := sub 4 (len $reverseZoneParts) | int -}}
      {{- $keepParts := list -}}
      {{- range $i := untilStep 0 $numPartsToKeep 1 -}}
        {{- $keepParts = append $keepParts (index $octets (sub 3 $i)) -}}
      {{- end -}}
      {{- $reverseName := $keepParts | join "." -}}
    {{ $reverseName }} IN PTR {{ $fqdn }}
    {{- end -}}
  {{- else if eq $type "AAAA" -}}
    {{- $expanded := include "ipv6.expand" $ip -}}
    {{- $hex := regexReplaceAll ":" $expanded "" -}}
    {{- $chars := splitList "" $hex -}}
    {{- /* Calculate relative name based on reverse zone */ -}}
    {{- $reverseZoneParts := splitList "." (trimSuffix ".ip6.arpa" $reverseZone) -}}
    {{- $numPartsToKeep := sub 32 (len $reverseZoneParts) | int -}}
    {{- $keepParts := list -}}
    {{- range $i := untilStep 0 $numPartsToKeep 1 -}}
      {{- $keepParts = append $keepParts (index $chars (sub 31 $i)) -}}
    {{- end -}}
    {{- $reverseName := $keepParts | join "." -}}
    {{ $reverseName }} IN PTR {{ $fqdn }}
  {{- end -}}
{{- end -}}
{{- end -}}

{{/*
Expand compressed IPv6 addresses to full form
Usage: {{ include "ipv6.expand" "fd00:192:168:128::1" }}
*/}}
{{- define "ipv6.expand" -}}
{{- $ip := . -}}
{{- if contains "::" $ip -}}
  {{- $parts := splitList "::" $ip -}}
  {{- $left := index $parts 0 -}}
  {{- $right := "" -}}
  {{- if gt (len $parts) 1 -}}
    {{- $right = index $parts 1 -}}
  {{- end -}}
  {{- $leftGroups := list -}}
  {{- if ne $left "" -}}
    {{- $leftGroups = splitList ":" $left -}}
  {{- end -}}
  {{- $rightGroups := list -}}
  {{- if ne $right "" -}}
    {{- $rightGroups = splitList ":" $right -}}
  {{- end -}}
  {{- $missing := sub 8 (add (len $leftGroups) (len $rightGroups)) | int -}}
  {{- $leftExpanded := list -}}
  {{- range $leftGroups -}}
    {{- $leftExpanded = append $leftExpanded (printf "%04s" . | replace " " "0") -}}
  {{- end -}}
  {{- $middle := list -}}
  {{- range untilStep 0 $missing 1 -}}
    {{- $middle = append $middle "0000" -}}
  {{- end -}}
  {{- $rightExpanded := list -}}
  {{- range $rightGroups -}}
    {{- $rightExpanded = append $rightExpanded (printf "%04s" . | replace " " "0") -}}
  {{- end -}}
  {{- concat $leftExpanded $middle $rightExpanded | join ":" -}}
{{- else -}}
  {{- $groups := splitList ":" $ip -}}
  {{- $expanded := list -}}
  {{- range $groups -}}
    {{- $expanded = append $expanded (printf "%04s" . | replace " " "0") -}}
  {{- end -}}
  {{- $expanded | join ":" -}}
{{- end -}}
{{- end -}}
