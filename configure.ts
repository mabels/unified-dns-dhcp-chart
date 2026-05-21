#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

/**
 * Technitium DNS + DHCP configurator — runs on every pod startup.
 *
 * Runs as a Deno sidecar container alongside the Technitium pod.
 * Reads /config/segment.json (Helm-generated data), applies all
 * configuration via the Technitium REST API, then sleeps forever.
 *
 * Authentication (in priority order):
 *   1. API_TOKEN env var — pre-created non-expiring token, no password needed.
 *   2. ADMIN_PASSWORD env var — falls back to password login (first-boot).
 */

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

interface RangeConfig {
  readonly start: string;
  readonly end: string;
}

interface ZoneConfig {
  readonly forward: string;
  readonly reverseV4: string;
  readonly reverseV6: string;
}

interface Ipv4Config {
  readonly subnet: string;
  readonly dns: string;
  readonly dhcp: string;
  readonly gateway: string;
  readonly range?: RangeConfig; // omit to disable DHCP scope entirely
}

interface Ipv6Config {
  readonly dns: string;
  readonly dhcp: string;
  readonly gateway: string;
}

interface UpstreamConfig {
  readonly protocol: string;
  readonly nameServer: string;
  readonly dohPath: string;
}

interface StaticRecord {
  readonly hostname: string;
  readonly ipv4: string;
  readonly ipv6: string;
}

interface StaticLease {
  readonly hostname: string;
  readonly mac: string;
  readonly ipv4: string;
}

interface PostgresQueryLogsConfig {
  readonly enabled: boolean;
  readonly appUrl: string;
  readonly connectionString: string;
  readonly databaseName: string;
  readonly maxLogDays: number;
  readonly maxLogRecords: number;
}

interface SegmentConfig {
  readonly name: string;
  readonly zone: ZoneConfig;
  readonly ipv4: Ipv4Config;
  readonly ipv6: Ipv6Config;
  readonly upstream?: UpstreamConfig; // omit to use recursive resolution (root hints)
  readonly staticRecords: ReadonlyArray<StaticRecord>;
  readonly staticLeases: ReadonlyArray<StaticLease>;
  readonly queryLogs?: { readonly postgres?: PostgresQueryLogsConfig };
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

function expandIPv6(addr: string): string {
  const halves = addr.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const fill = Array(8 - left.length - right.length).fill("0000");
  return [...left, ...fill, ...right].map((g) => g.padStart(4, "0")).join(":");
}

function ipv6ToArpa(addr: string): string {
  const nibbles = expandIPv6(addr).replace(/:/g, "").split("").reverse();
  return `${nibbles.join(".")}.ip6.arpa`;
}

function ipv4LastOctet(addr: string): string {
  return addr.split(".")[3];
}

// ---------------------------------------------------------------------------
// Technitium API
// ---------------------------------------------------------------------------

const BASE_URL = "http://127.0.0.1:5380/api";

interface ApiResponse {
  readonly status: string;
  readonly token?: string;
}

async function techGet(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<ApiResponse> {
  const url = new URL(`${BASE_URL}/${path}`);
  url.searchParams.set("token", token);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const resp = await fetch(url.toString());
  return resp.json() as Promise<ApiResponse>;
}

/** Idempotent GET call — logs warnings but never throws. */
async function api(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<void> {
  try {
    await techGet(path, token, params);
  } catch (err) {
    console.warn(`  [warn] ${path}: ${err instanceof Error ? err.message : err}`);
  }
}

/** Idempotent POST call (form-encoded body) — logs warnings but never throws. */
async function apiPost(
  path: string,
  token: string,
  params: Record<string, string> = {},
): Promise<void> {
  try {
    const body = new URLSearchParams({ token, ...params });
    const resp = await fetch(`${BASE_URL}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    await resp.json();
  } catch (err) {
    console.warn(`  [warn] POST ${path}: ${err instanceof Error ? err.message : err}`);
  }
}

// ---------------------------------------------------------------------------
// Login / wait for API
// ---------------------------------------------------------------------------

async function tryLogin(password: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `${BASE_URL}/user/login?user=admin&pass=${encodeURIComponent(password)}`,
    );
    if (!resp.ok) return null;
    const data = await resp.json() as ApiResponse;
    return data.status === "ok" && data.token ? data.token : null;
  } catch {
    return null;
  }
}

async function waitForApiWithToken(apiToken: string): Promise<string> {
  console.log("Waiting for Technitium API (pre-created token)...");
  for (let i = 1; i <= 150; i++) {
    try {
      const data = await techGet("settings/get", apiToken);
      if (data.status === "ok") {
        console.log(`API ready after ${i} attempt(s) (token auth)`);
        return apiToken;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Technitium API unavailable after 300 s — giving up.");
}

async function waitForApiWithPassword(adminPassword: string): Promise<string> {
  console.log("Waiting for Technitium API (password login)...");
  const candidates = [...new Set([adminPassword, "admin"])];
  for (let i = 1; i <= 150; i++) {
    for (const pass of candidates) {
      const token = await tryLogin(pass);
      if (token) {
        const label = pass === adminPassword ? "configured" : "default";
        console.log(`API ready after ${i} attempt(s) (pass=${label})`);
        return token;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Technitium API unavailable after 300 s — giving up.");
}


// ---------------------------------------------------------------------------
// Main configuration logic
// ---------------------------------------------------------------------------

const CONFIG_PATH = "/config/segment.json";

async function configure(): Promise<void> {
  const cfg: SegmentConfig = JSON.parse(
    await Deno.readTextFile(CONFIG_PATH),
  );
  const apiToken = Deno.env.get("API_TOKEN");
  const adminPassword = Deno.env.get("ADMIN_PASSWORD") ?? "admin";

  console.log(`=== Technitium configurator: segment ${cfg.name} ===`);
  const usingPreCreatedToken = !!apiToken;
  const token = usingPreCreatedToken
    ? await waitForApiWithToken(apiToken)
    : await waitForApiWithPassword(adminPassword);

  // 1. Upstream forwarder (optional — omit for recursive root-hints resolution)
  if (cfg.upstream) {
    await api("settings/set", token, {
      forwarders: cfg.upstream.nameServer,
      forwarderProtocol: cfg.upstream.protocol,
    });
    console.log(`Forwarder: ${cfg.upstream.nameServer} (${cfg.upstream.protocol})`);
  } else {
    await api("settings/set", token, { forwarders: "" });
    console.log("Forwarder: none (recursive resolution)");
  }

  // 2. Forward zone
  await api("zones/create", token, { zone: cfg.zone.forward, type: "Primary" });
  await api("zones/records/add", token, {
    domain: cfg.zone.forward,
    type: "NS",
    ttl: "3600",
    nameServer: `ns1.${cfg.zone.forward}`,
  });
  await api("zones/records/add", token, {
    domain: `ns1.${cfg.zone.forward}`,
    type: "A",
    ttl: "3600",
    ipAddress: cfg.ipv4.dns,
  });
  await api("zones/options/set", token, {
    zone: cfg.zone.forward,
    notify: "None",
  });
  console.log(`Zone: ${cfg.zone.forward}`);

  for (const rec of cfg.staticRecords) {
    await api("zones/records/add", token, {
      domain: `${rec.hostname}.${cfg.zone.forward}`,
      type: "A",
      ttl: "3600",
      ipAddress: rec.ipv4,
    });
    await api("zones/records/add", token, {
      domain: `${rec.hostname}.${cfg.zone.forward}`,
      type: "AAAA",
      ttl: "3600",
      ipAddress: rec.ipv6,
    });
    console.log(`  A/AAAA: ${rec.hostname} → ${rec.ipv4} / ${rec.ipv6}`);
  }

  // 3. Reverse zones + PTR records
  for (const revZone of [cfg.zone.reverseV4, cfg.zone.reverseV6]) {
    await api("zones/create", token, { zone: revZone, type: "Primary" });
    await api("zones/options/set", token, { zone: revZone, notify: "None" });
    console.log(`Reverse zone: ${revZone}`);
  }

  for (const rec of cfg.staticRecords) {
    const ptrTarget = `${rec.hostname}.${cfg.zone.forward}`;
    await api("zones/records/add", token, {
      domain: `${ipv4LastOctet(rec.ipv4)}.${cfg.zone.reverseV4}`,
      type: "PTR",
      ttl: "3600",
      ptrName: ptrTarget,
    });
    await api("zones/records/add", token, {
      domain: ipv6ToArpa(rec.ipv6),
      type: "PTR",
      ttl: "3600",
      ptrName: ptrTarget,
    });
    console.log(`  PTR: ${rec.ipv4} / ${rec.ipv6} → ${ptrTarget}`);
  }

  // 4. DHCP scope (skipped if ipv4.range is not defined)
  if (cfg.ipv4.range) {
    const [netAddr] = cfg.ipv4.subnet.split("/");
    await api("dhcp/scopes/set", token, {
      name: `segment-${cfg.name}`,
      newName: `segment-${cfg.name}`,
      networkAddress: netAddr,
      startingAddress: cfg.ipv4.range.start,
      endingAddress: cfg.ipv4.range.end,
      subnetMask: "255.255.255.0",
      leaseTimeDays: "1",
      leaseTimeHours: "0",
      leaseTimeMinutes: "0",
      offerDelayTime: "0",
      pingCheckEnabled: "true",
      pingCheckTimeout: "1000",
      pingCheckRetries: "2",
      domainName: cfg.zone.forward,
      dnsTtl: "900",
      serverAddress: cfg.ipv4.dhcp,
      routerAddress: cfg.ipv4.gateway,
      useThisDnsServer: "true",
      dnsServers: cfg.ipv4.dns,
      ddnsEnabled: "true",
      ddnsHostNameFormat: "{idn-hostname}",
    });
    await api("dhcp/scopes/enable", token, { name: `segment-${cfg.name}` });
    console.log(
      `DHCP scope: ${netAddr}/24 range ${cfg.ipv4.range.start}–${cfg.ipv4.range.end}`,
    );

    for (const lease of cfg.staticLeases) {
      await api("dhcp/scopes/addReservation", token, {
        name: `segment-${cfg.name}`,
        hardwareAddress: lease.mac,
        ipAddress: lease.ipv4,
        hostName: lease.hostname,
      });
      console.log(`  Static lease: ${lease.hostname} ${lease.mac} → ${lease.ipv4}`);
    }
  } else {
    console.log("DHCP scope: disabled (no range configured)");
  }

  // 5. Query Logs (PostgreSQL)
  const pg = cfg.queryLogs?.postgres;
  if (pg?.enabled && pg.connectionString) {
    await api("apps/downloadAndInstall", token, {
      name: "Query Logs (PostgreSQL)",
      url: pg.appUrl,
    });
    console.log("Query Logs (PostgreSQL): installing...");
    await new Promise((r) => setTimeout(r, 3000));
    await apiPost("apps/config/set", token, {
      name: "Query Logs (PostgreSQL)",
      config: JSON.stringify({
        enableLogging: true,
        maxQueueSize: 1000000,
        maxLogDays: pg.maxLogDays,
        maxLogRecords: pg.maxLogRecords,
        databaseName: pg.databaseName,
        connectionString: pg.connectionString,
      }),
    });
    console.log(`Query Logs (PostgreSQL): logging to ${pg.databaseName}`);
  }

  // 6. Admin password — only set when using password-based login.
  //    Pre-created token auth means password management is out-of-band.
  if (!usingPreCreatedToken) {
    await api("user/changePassword", token, { password: adminPassword });
    console.log("Admin password set.");
  }

  console.log("=== Configuration complete ===");
}

// ---------------------------------------------------------------------------
// Entry point — configure once, then sleep (sidecar stays Running)
// ---------------------------------------------------------------------------

await configure().catch((err) => {
  console.error("FATAL:", err);
  Deno.exit(1);
});

console.log("Configurator idle — sleeping.");
// Deno exits if the event loop empties — keep it alive with a recurring timer.
while (true) {
  await new Promise((r) => setTimeout(r, 3_600_000)); // wake every hour, do nothing
}
