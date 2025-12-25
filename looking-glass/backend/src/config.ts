// Configuration for the Looking Glass backend

import type { Config, LeaseEndpointConfig, ZoneEndpointConfig } from './types.js'

// Load configuration from environment variables
export function loadConfig(): Config {
  const port = parseInt(process.env.PORT || '3000', 10)
  const dbPath = process.env.DB_PATH || './leases.db'
  const staticDir = process.env.STATIC_DIR || '../frontend/dist'

  // Parse lease endpoints from environment variable (JSON array)
  // Format: ENDPOINTS='[{"name":"128","url":"http://localhost:8000"},{"name":"129","url":"http://localhost:8001"}]'
  const endpointsEnv = process.env.ENDPOINTS

  let endpoints: LeaseEndpointConfig[] = []

  if (endpointsEnv) {
    try {
      const parsed = JSON.parse(endpointsEnv)
      endpoints = parsed.map((e: any) => ({
        name: e.name,
        url: e.url,
      }))
    } catch (error) {
      console.error('Failed to parse ENDPOINTS environment variable:', error)
    }
  }

  // Default endpoint if not configured (single localhost)
  if (endpoints.length === 0) {
    endpoints = [
      {
        name: 'default',
        url: 'http://127.0.0.1:8000',
      },
    ]
  }

  // Parse zone endpoints from environment variable (JSON array)
  // Format: ZONE_ENDPOINTS='[{"name":"example.com","endpoint":"dns://dns-server:5353"}]'
  const zoneEndpointsEnv = process.env.ZONE_ENDPOINTS

  let zoneEndpoints: ZoneEndpointConfig[] = []

  if (zoneEndpointsEnv) {
    try {
      const parsed = JSON.parse(zoneEndpointsEnv)
      zoneEndpoints = parsed.map((e: any) => ({
        name: e.name,
        endpoint: e.endpoint,
      }))
    } catch (error) {
      console.error('Failed to parse ZONE_ENDPOINTS environment variable:', error)
    }
  }

  return {
    port,
    endpoints,
    zoneEndpoints,
    dbPath,
    staticDir,
  }
}
