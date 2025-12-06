#!/usr/bin/env -S deno run --allow-run --allow-env

/**
 * Fast DHCP Request Monitor with DNS Caching
 * Usage: ./tail-dhcp-requests.ts [segment]
 * Example: ./tail-dhcp-requests.ts 128
 */

const NAMESPACE = "dns-dhcp";
const DEFAULT_SEGMENT = "128";
const CONTAINER = "kea-dhcp4";
const CACHE_TTL_MS = 30000; // Cache for 30 seconds
const LEASE_REFRESH_INTERVAL_MS = 5000; // Refresh lease cache every 5 seconds

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[0;32m",
  yellow: "\x1b[1;33m",
  blue: "\x1b[0;34m",
  cyan: "\x1b[0;36m",
  magenta: "\x1b[0;35m",
  red: "\x1b[0;31m",
};

interface CacheEntry {
  hostname: string;
  timestamp: number;
}

interface LeaseEntry {
  address: string;
  hwaddr: string;
  clientId: string;
  validLifetime: string;
  expire: string;
  subnetId: string;
  fqdnFwd: string;
  fqdnRev: string;
  hostname: string;
  state: string;
  userContext: string;
  poolId: string;
}

class HostnameCache {
  private cache = new Map<string, CacheEntry>();
  private leaseCache = new Map<string, LeaseEntry>();
  private podName: string;
  private refreshTimer?: number;

  constructor(podName: string) {
    this.podName = podName;
  }

  async start() {
    // Initial load
    await this.refreshLeaseCache();

    // Set up periodic refresh
    this.refreshTimer = setInterval(
      () => this.refreshLeaseCache(),
      LEASE_REFRESH_INTERVAL_MS
    );
  }

  stop() {
    if (this.refreshTimer !== undefined) {
      clearInterval(this.refreshTimer);
    }
  }

  private async refreshLeaseCache() {
    try {
      const cmd = new Deno.Command("kubectl", {
        args: [
          "exec",
          this.podName,
          "-n",
          NAMESPACE,
          "-c",
          CONTAINER,
          "--",
          "cat",
          "/var/lib/kea/dhcp4.leases",
        ],
        stdout: "piped",
        stderr: "piped",
      });

      const { stdout, stderr, success } = await cmd.output();

      if (!success) {
        const errorText = new TextDecoder().decode(stderr);
        console.error(
          `${colors.red}Warning: Failed to read lease file: ${errorText}${colors.reset}`
        );
        return;
      }

      const leaseData = new TextDecoder().decode(stdout);
      const lines = leaseData.split("\n");

      // Clear old cache
      this.leaseCache.clear();

      for (const line of lines) {
        if (!line.trim() || line.startsWith("#")) continue;

        const fields = line.split(",");
        if (fields.length >= 12) {
          const lease: LeaseEntry = {
            address: fields[0],
            hwaddr: fields[1],
            clientId: fields[2],
            validLifetime: fields[3],
            expire: fields[4],
            subnetId: fields[5],
            fqdnFwd: fields[6],
            fqdnRev: fields[7],
            hostname: fields[8],
            state: fields[9],
            userContext: fields[10],
            poolId: fields[11],
          };

          // Only cache active leases (state=0)
          if (lease.state === "0" && lease.hostname) {
            this.leaseCache.set(lease.address, lease);
          }
        }
      }
    } catch (error) {
      console.error(
        `${colors.red}Error refreshing lease cache: ${error}${colors.reset}`
      );
    }
  }

  getHostname(ip: string): string | null {
    if (!ip || ip === "unknown") return null;

    // Check memory cache first
    const cached = this.cache.get(ip);
    const now = Date.now();

    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.hostname;
    }

    // Check lease cache
    const lease = this.leaseCache.get(ip);
    if (lease && lease.hostname) {
      // Update memory cache
      this.cache.set(ip, { hostname: lease.hostname, timestamp: now });
      return lease.hostname;
    }

    return null;
  }
}

function extractMac(line: string): string {
  const match = line.match(/\[hwtype=1 ([0-9a-fA-F:]*)\]/);
  return match ? match[1] : "unknown";
}

function extractIp(line: string, pattern: RegExp): string {
  const match = line.match(pattern);
  return match ? match[1] : "unknown";
}

function extractDuration(line: string): string {
  const match = line.match(/for (\d+) seconds/);
  return match ? match[1] : "unknown";
}

function formatWithHostname(
  baseMessage: string,
  ip: string,
  cache: HostnameCache
): string {
  const hostname = cache.getHostname(ip);
  if (hostname) {
    return `${baseMessage} (${colors.cyan}${hostname}${colors.reset})`;
  }
  return baseMessage;
}

async function checkPodExists(podName: string): Promise<boolean> {
  try {
    const cmd = new Deno.Command("kubectl", {
      args: ["get", "pod", podName, "-n", NAMESPACE],
      stdout: "null",
      stderr: "null",
    });

    const { success } = await cmd.output();
    return success;
  } catch {
    return false;
  }
}

async function main() {
  const segment = Deno.args[0] || DEFAULT_SEGMENT;
  const podName = `unified-dns-dhcp-${segment}-0`;

  console.log(`${colors.cyan}================================================${colors.reset}`);
  console.log(`${colors.cyan}DHCP Request Monitor - Segment ${segment}${colors.reset}`);
  console.log(`${colors.cyan}================================================${colors.reset}`);
  console.log();

  // Check if pod exists
  const podExists = await checkPodExists(podName);
  if (!podExists) {
    console.error(
      `${colors.red}Error: Pod ${podName} not found in namespace ${NAMESPACE}${colors.reset}`
    );
    Deno.exit(1);
  }

  console.log(`${colors.green}Monitoring DHCP requests on segment ${segment}...${colors.reset}`);
  console.log(`${colors.yellow}Press Ctrl+C to stop${colors.reset}`);
  console.log();

  // Initialize hostname cache
  const cache = new HostnameCache(podName);
  await cache.start();

  // Handle cleanup on exit
  const cleanup = () => {
    cache.stop();
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", cleanup);
  Deno.addSignalListener("SIGTERM", cleanup);

  // Tail logs
  const cmd = new Deno.Command("kubectl", {
    args: ["logs", "-f", podName, "-n", NAMESPACE, "-c", CONTAINER],
    stdout: "piped",
    stderr: "piped",
  });

  const process = cmd.spawn();
  const reader = process.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        processLogLine(line, cache);
      }
    }
  } catch (error) {
    console.error(`${colors.red}Error reading logs: ${error}${colors.reset}`);
  } finally {
    cleanup();
  }
}

function processLogLine(line: string, cache: HostnameCache) {
  const timestampMatch = line.match(/^(\S+\s+\S+)/);
  const timestamp = timestampMatch ? timestampMatch[1] : "";

  // DHCPDISCOVER - Client looking for DHCP server
  if (line.includes("DHCP4_PACKET_RECEIVED") && line.includes("DHCPDISCOVER")) {
    const mac = extractMac(line);
    console.log(
      `${colors.blue}[${timestamp}]${colors.reset} ${colors.cyan}DISCOVER${colors.reset} from MAC: ${colors.yellow}${mac}${colors.reset}`
    );
  }
  // DHCPOFFER - Server offering an IP
  else if (line.includes("DHCP4_LEASE_OFFER")) {
    const mac = extractMac(line);
    const ip = extractIp(line, /lease ([0-9.]+)/);
    const message = `${colors.blue}[${timestamp}]${colors.reset} ${colors.green}OFFER${colors.reset}    ${ip} to ${colors.yellow}${mac}${colors.reset}`;
    console.log(formatWithHostname(message, ip, cache));
  }
  // DHCPREQUEST - Client requesting specific IP
  else if (line.includes("DHCP4_PACKET_RECEIVED") && line.includes("DHCPREQUEST")) {
    const mac = extractMac(line);
    console.log(
      `${colors.blue}[${timestamp}]${colors.reset} ${colors.magenta}REQUEST${colors.reset}  from MAC: ${colors.yellow}${mac}${colors.reset}`
    );
  }
  // DHCPACK - Server acknowledging lease
  else if (line.includes("DHCP4_LEASE_ALLOC")) {
    const mac = extractMac(line);
    const ip = extractIp(line, /lease ([0-9.]+) has/);
    const duration = extractDuration(line);
    const message = `${colors.blue}[${timestamp}]${colors.reset} ${colors.green}ACK${colors.reset}      ${ip} to ${colors.yellow}${mac}${colors.reset}`;
    const withHostname = formatWithHostname(message, ip, cache);
    console.log(`${withHostname} for ${duration}s`);
  }
  // DHCP INIT-REBOOT - Client requesting existing lease
  else if (line.includes("DHCP4_INIT_REBOOT")) {
    const ip = extractIp(line, /requests address ([0-9.]+)/);
    console.log(
      `${colors.blue}[${timestamp}]${colors.reset} ${colors.cyan}REBOOT${colors.reset}   requesting ${ip}`
    );
  }
  // DHCPNAK - Server denying request
  else if (line.includes("DHCPNAK")) {
    const mac = extractMac(line);
    console.log(
      `${colors.blue}[${timestamp}]${colors.reset} ${colors.red}NAK${colors.reset}      to ${colors.yellow}${mac}${colors.reset}`
    );
  }
  // DHCPRELEASE - Client releasing IP
  else if (line.includes("DHCP4_RELEASE")) {
    const mac = extractMac(line);
    const ip = extractIp(line, /address ([0-9.]+)/);
    console.log(
      `${colors.blue}[${timestamp}]${colors.reset} ${colors.yellow}RELEASE${colors.reset}  ${ip} from ${colors.yellow}${mac}${colors.reset}`
    );
  }
  // Lease renewals
  else if (line.includes("DHCP4_LEASE_RENEW")) {
    const mac = extractMac(line);
    const ip = extractIp(line, /lease ([0-9.]+)/);
    console.log(
      `${colors.blue}[${timestamp}]${colors.reset} ${colors.cyan}RENEW${colors.reset}    ${ip} by ${colors.yellow}${mac}${colors.reset}`
    );
  }
  // Errors
  else if (line.includes("ERROR")) {
    const errorMsg = line.substring(line.indexOf("ERROR"));
    console.log(
      `${colors.blue}[${timestamp}]${colors.reset} ${colors.red}ERROR:${colors.reset} ${errorMsg}`
    );
  }
}

if (import.meta.main) {
  main();
}
