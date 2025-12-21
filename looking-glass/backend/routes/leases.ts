// Leases endpoints

import { getLeasesDirect } from "../services/kea-local.ts";
import type { Config } from "../config.ts";
import type { LeaseDatabase } from "../services/database.ts";

export async function handleGetAllLeases(
  _req: Request,
  config: Config,
  db: LeaseDatabase,
): Promise<Response> {
  // Query all configured endpoints and update database
  const results = await Promise.all(
    config.endpoints.map(async (endpoint) => {
      const result = await getLeasesDirect(endpoint.url);

      // Store leases in database
      if (result.success) {
        for (const lease of result.leases) {
          db.upsertLease({
            endpoint: endpoint.name,
            ip_address: lease["ip-address"],
            hw_address: lease["hw-address"],
            hostname: lease.hostname || null,
            subnet_id: lease["subnet-id"],
            valid_lft: lease["valid-lft"],
            cltt: lease.cltt,
            state: lease.state,
            fqdn_fwd: lease["fqdn-fwd"] ? 1 : 0,
            fqdn_rev: lease["fqdn-rev"] ? 1 : 0,
            client_id: lease["client-id"] || null,
          });
        }
      }

      return {
        endpoint: endpoint.name,
        ...result,
      };
    }),
  );

  // Get all leases from database with created/updated timestamps
  const storedLeases = db.getAllLeases();

  // Convert to API format
  const allLeases = storedLeases.map((stored) => ({
    "ip-address": stored.ip_address,
    "hw-address": stored.hw_address,
    "hostname": stored.hostname || undefined,
    "subnet-id": stored.subnet_id,
    "valid-lft": stored.valid_lft,
    "cltt": stored.cltt,
    "state": stored.state,
    "fqdn-fwd": stored.fqdn_fwd === 1,
    "fqdn-rev": stored.fqdn_rev === 1,
    "client-id": stored.client_id || undefined,
    "segment": stored.endpoint,
    "created-at": stored.created_at,
    "updated-at": stored.updated_at,
  }));

  const errors = results
    .filter((r) => !r.success)
    .map((r) => ({ segment: r.endpoint, error: r.error }));

  return new Response(
    JSON.stringify({
      leases: allLeases,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

export async function handleGetSegmentLeases(
  _req: Request,
  config: Config,
  db: LeaseDatabase,
  segmentName: string,
): Promise<Response> {
  // Find the endpoint by name
  const endpoint = config.endpoints.find((e) => e.name === segmentName);

  if (!endpoint) {
    return new Response(
      JSON.stringify({
        error: `Endpoint '${segmentName}' not found`,
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  // Fetch fresh data from Kea API
  const result = await getLeasesDirect(endpoint.url);

  // Update database
  if (result.success) {
    for (const lease of result.leases) {
      db.upsertLease({
        endpoint: endpoint.name,
        ip_address: lease["ip-address"],
        hw_address: lease["hw-address"],
        hostname: lease.hostname || null,
        subnet_id: lease["subnet-id"],
        valid_lft: lease["valid-lft"],
        cltt: lease.cltt,
        state: lease.state,
        fqdn_fwd: lease["fqdn-fwd"] ? 1 : 0,
        fqdn_rev: lease["fqdn-rev"] ? 1 : 0,
        client_id: lease["client-id"] || null,
      });
    }
  }

  // Get leases from database for this endpoint
  const storedLeases = db.getLeasesByEndpoint(segmentName);

  // Convert to API format
  const leases = storedLeases.map((stored) => ({
    "ip-address": stored.ip_address,
    "hw-address": stored.hw_address,
    "hostname": stored.hostname || undefined,
    "subnet-id": stored.subnet_id,
    "valid-lft": stored.valid_lft,
    "cltt": stored.cltt,
    "state": stored.state,
    "fqdn-fwd": stored.fqdn_fwd === 1,
    "fqdn-rev": stored.fqdn_rev === 1,
    "client-id": stored.client_id || undefined,
    "created-at": stored.created_at,
    "updated-at": stored.updated_at,
  }));

  return new Response(
    JSON.stringify({
      segment: segmentName,
      leases,
      error: result.success ? undefined : result.error,
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}
