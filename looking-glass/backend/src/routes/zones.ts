// Zones endpoints

import { Hono } from 'hono'
import { loadConfig } from '../config.js'
import { fetchAllZones, fetchZoneData } from '../services/dns.js'

const zonesRouter = new Hono()

// GET /api/zones - Get all zones
zonesRouter.get('/', async (c) => {
  const config = loadConfig()

  if (config.zoneEndpoints.length === 0) {
    return c.json({
      zones: [],
      message: 'No zone endpoints configured',
    })
  }

  const zones = await fetchAllZones(config.zoneEndpoints)

  return c.json({
    zones,
    timestamp: new Date().toISOString(),
  })
})

// GET /api/zones/:zoneName - Get a specific zone
zonesRouter.get('/:zoneName', async (c) => {
  const config = loadConfig()
  const zoneName = c.req.param('zoneName')

  // Find the zone endpoint
  const zoneEndpoint = config.zoneEndpoints.find((ze) => ze.name === zoneName)

  if (!zoneEndpoint) {
    return c.json(
      {
        error: `Zone '${zoneName}' not found in configuration`,
      },
      404
    )
  }

  const zoneData = await fetchZoneData(zoneEndpoint.name, zoneEndpoint.endpoint)

  return c.json({
    ...zoneData,
    timestamp: new Date().toISOString(),
  })
})

export default zonesRouter
