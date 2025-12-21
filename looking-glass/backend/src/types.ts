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
export interface EndpointConfig {
  name: string
  url: string
}

export interface Config {
  port: number
  endpoints: EndpointConfig[]
  dbPath: string
  staticDir: string
}

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
