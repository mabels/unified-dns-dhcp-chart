// Kea DHCP API client using direct HTTP endpoints

import type { KeaResponse, KeaApiResult } from '../types.js'

export async function getLeasesDirect(url: string): Promise<KeaApiResult> {
  const keaCommand = {
    command: 'lease4-get-all',
    service: ['dhcp4'],
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(keaCommand),
    })

    if (!response.ok) {
      return {
        success: false,
        leases: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const data = await response.json() as KeaResponse[]

    if (!data || data.length === 0) {
      return {
        success: false,
        leases: [],
        error: 'Empty response from Kea API',
      }
    }

    const firstResponse = data[0]

    if (firstResponse.result !== 0) {
      return {
        success: false,
        leases: [],
        error: firstResponse.text || 'Kea API error',
      }
    }

    const leases = firstResponse.arguments?.leases || []

    return {
      success: true,
      leases,
    }
  } catch (error) {
    return {
      success: false,
      leases: [],
      error: error instanceof Error ? error.message : 'Failed to connect to Kea API',
    }
  }
}
