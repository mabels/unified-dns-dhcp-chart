// Shared TypeScript types for Looking Glass backend

// Kea DHCP API types
export interface KeaLease {
  "ip-address": string
  "hw-address": string
  "hostname"?: string
  "subnet-id": number
  "valid-lft": number
  "cltt": number
  "state": number
  "fqdn-fwd"?: boolean
  "fqdn-rev"?: boolean
  "client-id"?: string
}

export interface KeaResponse {
  result: number
  text: string
  arguments?: {
    leases?: KeaLease[]
  }
}

export interface KeaApiResult {
  success: boolean
  leases: KeaLease[]
  error?: string
}

// Configuration types
export interface LeaseEndpointConfig {
  name: string
  url: string
}

export interface ZoneEndpointConfig {
  name: string  // Zone name (e.g., "mam-hh-dmz.adviser.com")
  endpoint: string  // DNS endpoint (e.g., "dns://unified-dns-dhcp-129-lg.dns-dhcp.svc.cluster.local:5353")
}

export interface Config {
  port: number
  endpoints: LeaseEndpointConfig[]
  zoneEndpoints: ZoneEndpointConfig[]
  dbPath: string
  staticDir: string
}

// Keep backward compatibility
export type EndpointConfig = LeaseEndpointConfig

// Stored lease (database model)
export interface StoredLease {
  id?: number
  endpoint: string
  ipAddress: string
  hwAddress: string
  hostname: string | null
  subnetId: number
  validLft: number
  cltt: number
  state: number
  fqdnFwd: number
  fqdnRev: number
  clientId: string | null
  createdAt: Date
  updatedAt: Date
}

// DNS Zone types
export interface DnsRecord {
  name: string
  type: string
  ttl?: number
  value: string
  // Metadata for PTR records
  forwardIp?: string  // Forward IP address (for PTR records)
  fqdn?: string       // FQDN from PTR value
}

export interface ZoneData {
  zone: string
  records: DnsRecord[]
  error?: string
}
