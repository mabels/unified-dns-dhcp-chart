// Looking Glass Deno Backend
// Provides REST API to query Kea DHCP leases via kubectl exec
// Also serves static frontend files in production

import { loadConfig } from "./config.ts";
import { handleHealth } from "./routes/health.ts";
import { handleSegments } from "./routes/segments.ts";
import { handleGetAllLeases, handleGetSegmentLeases } from "./routes/leases.ts";
import { serveDir } from "jsr:@std/http@1.0.10/file-server";
import { LeaseDatabase } from "./services/database.ts";

const config = loadConfig();
const STATIC_DIR = "../frontend/dist";

// Initialize database
const dbPath = Deno.env.get("DB_PATH") || "./leases.db";
const db = new LeaseDatabase(dbPath);

console.log("Looking Glass Backend starting...");
console.log(`Port: ${config.port}`);
console.log(`Database: ${dbPath}`);
console.log(`Configured endpoints:`);
config.endpoints.forEach((e) => console.log(`  - ${e.name}: ${e.url}`));

// Cleanup old leases on startup (optional)
db.cleanupExpiredLeases(30); // Remove leases not seen in 30 days

// CORS headers
function corsHeaders(): Headers {
  return new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
}

// Check if static directory exists
async function hasStaticFiles(): Promise<boolean> {
  try {
    const stat = await Deno.stat(STATIC_DIR);
    return stat.isDirectory;
  } catch {
    return false;
  }
}

// Router
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // API routes
  if (path.startsWith("/api/")) {
    let response: Response;

    if (path === "/api/health") {
      response = handleHealth(req);
    } else if (path === "/api/segments") {
      response = handleSegments(req, config);
    } else if (path === "/api/leases") {
      response = await handleGetAllLeases(req, config, db);
    } else if (path.startsWith("/api/leases/")) {
      const segmentName = path.split("/").pop();
      if (segmentName) {
        response = await handleGetSegmentLeases(req, config, db, segmentName);
      } else {
        response = new Response("Not Found", { status: 404 });
      }
    } else {
      response = new Response("Not Found", { status: 404 });
    }

    // Add CORS headers to API responses
    const headers = new Headers(response.headers);
    corsHeaders().forEach((value, key) => {
      headers.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  // Serve static files if available (production mode)
  if (await hasStaticFiles()) {
    try {
      // Try to serve the static file
      const response = await serveDir(req, {
        fsRoot: STATIC_DIR,
        quiet: true,
      });

      // If file not found and not an asset, serve index.html for SPA routing
      if (response.status === 404 && !path.includes(".")) {
        const indexPath = `${STATIC_DIR}/index.html`;
        const file = await Deno.readFile(indexPath);
        return new Response(file, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
          },
        });
      }

      return response;
    } catch (error) {
      console.error("Error serving static file:", error);
    }
  }

  // Development mode - show API info
  return new Response("Looking Glass API - see /api/health", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// Start server
Deno.serve({ port: config.port }, handler);
console.log(`Server running on http://localhost:${config.port}`);
