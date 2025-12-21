// Leases endpoints

import { Hono } from 'hono'
import { eq, and, lt, desc, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { leases } from '../db/schema.js'
import { getLeasesDirect } from '../services/kea.js'
import { loadConfig } from '../config.js'
import type { KeaLease } from '../types.js'

const leasesRouter = new Hono()

// Helper function to upsert a lease
async function upsertLease(endpoint: string, lease: KeaLease) {
  const now = new Date()

  const newLease = {
    endpoint,
    ipAddress: lease['ip-address'],
    hwAddress: lease['hw-address'],
    hostname: lease.hostname || null,
    subnetId: lease['subnet-id'],
    validLft: lease['valid-lft'],
    cltt: lease.cltt,
    state: lease.state,
    fqdnFwd: lease['fqdn-fwd'] ? 1 : 0,
    fqdnRev: lease['fqdn-rev'] ? 1 : 0,
    clientId: lease['client-id'] || null,
    createdAt: now,
    updatedAt: now,
  }

  await db
    .insert(leases)
    .values(newLease)
    .onConflictDoUpdate({
      target: [leases.endpoint, leases.ipAddress, leases.hwAddress],
      set: {
        hostname: newLease.hostname,
        subnetId: newLease.subnetId,
        validLft: newLease.validLft,
        cltt: newLease.cltt,
        state: newLease.state,
        fqdnFwd: newLease.fqdnFwd,
        fqdnRev: newLease.fqdnRev,
        clientId: newLease.clientId,
        updatedAt: now,
      },
    })
}

// GET /api/leases - Get all leases from all endpoints
leasesRouter.get('/', async (c) => {
  const config = loadConfig()

  // Query all configured endpoints and update database
  const results = await Promise.all(
    config.endpoints.map(async (endpoint) => {
      const result = await getLeasesDirect(endpoint.url)

      // Store leases in database
      if (result.success) {
        for (const lease of result.leases) {
          await upsertLease(endpoint.name, lease)
        }
      }

      return {
        endpoint: endpoint.name,
        ...result,
      }
    })
  )

  // Get all leases from database with created/updated timestamps
  const storedLeases = await db
    .select()
    .from(leases)
    .orderBy(desc(leases.createdAt))

  // Convert to API format
  const allLeases = storedLeases.map((stored) => ({
    'ip-address': stored.ipAddress,
    'hw-address': stored.hwAddress,
    'hostname': stored.hostname || undefined,
    'subnet-id': stored.subnetId,
    'valid-lft': stored.validLft,
    'cltt': stored.cltt,
    'state': stored.state,
    'fqdn-fwd': stored.fqdnFwd === 1,
    'fqdn-rev': stored.fqdnRev === 1,
    'client-id': stored.clientId || undefined,
    'segment': stored.endpoint,
    'created-at': stored.createdAt.getTime() / 1000,
    'updated-at': stored.updatedAt.getTime() / 1000,
  }))

  const errors = results
    .filter((r) => !r.success)
    .map((r) => ({ segment: r.endpoint, error: r.error }))

  return c.json({
    leases: allLeases,
    errors: errors.length > 0 ? errors : undefined,
    timestamp: new Date().toISOString(),
  })
})

// GET /api/leases/:segment - Get leases for a specific segment
leasesRouter.get('/:segment', async (c) => {
  const config = loadConfig()
  const segmentName = c.req.param('segment')

  // Find the endpoint by name
  const endpoint = config.endpoints.find((e) => e.name === segmentName)

  if (!endpoint) {
    return c.json(
      {
        error: `Endpoint '${segmentName}' not found`,
      },
      404
    )
  }

  // Fetch fresh data from Kea API
  const result = await getLeasesDirect(endpoint.url)

  // Update database
  if (result.success) {
    for (const lease of result.leases) {
      await upsertLease(endpoint.name, lease)
    }
  }

  // Get leases from database for this endpoint
  const storedLeases = await db
    .select()
    .from(leases)
    .where(eq(leases.endpoint, segmentName))
    .orderBy(desc(leases.createdAt))

  // Convert to API format
  const leasesData = storedLeases.map((stored) => ({
    'ip-address': stored.ipAddress,
    'hw-address': stored.hwAddress,
    'hostname': stored.hostname || undefined,
    'subnet-id': stored.subnetId,
    'valid-lft': stored.validLft,
    'cltt': stored.cltt,
    'state': stored.state,
    'fqdn-fwd': stored.fqdnFwd === 1,
    'fqdn-rev': stored.fqdnRev === 1,
    'client-id': stored.clientId || undefined,
    'created-at': stored.createdAt.getTime() / 1000,
    'updated-at': stored.updatedAt.getTime() / 1000,
  }))

  return c.json({
    segment: segmentName,
    leases: leasesData,
    error: result.success ? undefined : result.error,
    timestamp: new Date().toISOString(),
  })
})

// Helper function to clean up expired leases
export async function cleanupExpiredLeases(olderThanDays: number = 30) {
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)
  const now = Math.floor(Date.now() / 1000)

  await db
    .delete(leases)
    .where(
      and(
        lt(leases.updatedAt, cutoffDate),
        lt(sql`${leases.cltt} + ${leases.validLft}`, now)
      )
    )

  console.log(`Cleaned up leases older than ${olderThanDays} days`)
}

export default leasesRouter
