// DNS service for fetching zone data via AXFR

import { exec } from 'child_process'
import { promisify } from 'util'
import { IPAddress } from 'ipaddress'
import type { ZoneData, DnsRecord } from '../types.js'

const execAsync = promisify(exec)

/**
 * Convert reverse DNS name to forward IP address
 * Handles both IPv4 (in-addr.arpa) and IPv6 (ip6.arpa)
 */
function reverseDnsToIp(reverseName: string): string | null {
  try {
    // Remove trailing dot if present
    const name = reverseName.endsWith('.') ? reverseName.slice(0, -1) : reverseName

    // IPv4: 100.129.168.192.in-addr.arpa -> 192.168.129.100
    if (name.endsWith('.in-addr.arpa')) {
      const octets = name.replace('.in-addr.arpa', '').split('.')
      return octets.reverse().join('.')
    }

    // IPv6: *.ip6.arpa -> full IPv6
    if (name.endsWith('.ip6.arpa')) {
      const nibbles = name.replace('.ip6.arpa', '').split('.').reverse()
      // Group into 4-character chunks and join with colons
      const groups: string[] = []
      for (let i = 0; i < nibbles.length; i += 4) {
        groups.push(nibbles.slice(i, i + 4).join(''))
      }
      return groups.join(':')
    }

    return null
  } catch (e) {
    return null
  }
}

/**
 * Parse DNS endpoint URL
 * Format: dns://host:port
 */
function parseDnsEndpoint(endpoint: string): { host: string; port: number } {
  const url = new URL(endpoint)
  return {
    host: url.hostname,
    port: parseInt(url.port) || 53,
  }
}

/**
 * Parse AXFR dig output into structured records
 */
function parseAxfrOutput(output: string, zoneName: string): DnsRecord[] {
  const records: DnsRecord[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith(';') || line.trim() === '') {
      continue
    }

    // Parse DNS record line
    // Format: name TTL class type value
    const parts = line.trim().split(/\s+/)
    if (parts.length < 5) {
      continue
    }

    const [name, ttlStr, recordClass, recordType, ...valueParts] = parts

    // Skip SOA and NS records for cleaner output
    if (recordType === 'SOA' || recordType === 'NS') {
      continue
    }

    const ttl = parseInt(ttlStr)
    const value = valueParts.join(' ')

    // Simplify the name display
    let displayName = name
    if (name.endsWith(zoneName + '.')) {
      displayName = name.slice(0, -(zoneName.length + 1))
      if (displayName === '') {
        displayName = '@'
      }
    } else if (name === zoneName + '.') {
      displayName = '@'
    }

    const record: DnsRecord = {
      name: displayName,
      type: recordType,
      ttl: isNaN(ttl) ? undefined : ttl,
      value,
    }

    // Add metadata for PTR records
    if (recordType === 'PTR') {
      const forwardIp = reverseDnsToIp(name)
      if (forwardIp) {
        record.forwardIp = forwardIp
      }
      // Store FQDN (remove trailing dot if present)
      record.fqdn = value.endsWith('.') ? value.slice(0, -1) : value
    }

    records.push(record)
  }

  return records
}

/**
 * Fetch zone data via AXFR using dig command
 */
export async function fetchZoneData(
  zoneName: string,
  endpoint: string
): Promise<ZoneData> {
  try {
    const { host, port } = parseDnsEndpoint(endpoint)

    // Use dig to perform AXFR
    const command = `dig @${host} -p ${port} AXFR ${zoneName} +noall +answer`

    const { stdout, stderr } = await execAsync(command, {
      timeout: 10000, // 10 second timeout
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large zones
    })

    if (stderr && !stderr.includes('Transfer failed')) {
      console.warn(`dig stderr for ${zoneName}:`, stderr)
    }

    const records = parseAxfrOutput(stdout, zoneName)

    return {
      zone: zoneName,
      records,
    }
  } catch (error) {
    console.error(`Failed to fetch zone ${zoneName} from ${endpoint}:`, error)
    return {
      zone: zoneName,
      records: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Fetch all configured zones
 */
export async function fetchAllZones(
  zoneEndpoints: Array<{ name: string; endpoint: string }>
): Promise<ZoneData[]> {
  return Promise.all(
    zoneEndpoints.map((ze) => fetchZoneData(ze.name, ze.endpoint))
  )
}
