{{- define "containers.stork.agent" -}}
- name: stork-agent
  image: {{ .images.storkAgent }}
  env:
  - name: STORK_AGENT_HOST
    valueFrom:
      fieldRef:
        fieldPath: status.podIP
  - name: STORK_AGENT_SERVER_URL
    value: {{ .stork.agent.serverUrl | quote }}
  - name: STORK_AGENT_PORT
    value: "8080"
  - name: STORK_AGENT_LISTEN_PROMETHEUS_ONLY
    value: "false"
  - name: STORK_AGENT_SKIP_TLS_CERT_VERIFICATION
    value: "false"
  {{- if .stork.agent.serverToken }}
  - name: STORK_AGENT_SERVER_TOKEN
    valueFrom:
      secretKeyRef:
        name: stork-agent-token-{{ .segmentName }}
        key: token
  {{- end }}
  ports:
  - containerPort: 8080
    name: agent
    protocol: TCP
  volumeMounts:
  - name: kea-sockets
    mountPath: /var/run/kea
  - name: stork-agent-data
    mountPath: /var/lib/stork-agent
  resources:
    {{- toYaml .stork.agent.resources | nindent 4 }}
{{- end -}}
