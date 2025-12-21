# Cloudflare Workers/Wrangler Option

## Overview

The current setup uses Deno, but you could also deploy this to **Cloudflare Workers** for a serverless, globally distributed solution.

## Pros of Cloudflare Workers

- ✅ **Serverless** - No infrastructure to manage
- ✅ **Global CDN** - Deployed to 300+ edge locations worldwide
- ✅ **Fast cold starts** - Sub-millisecond response times
- ✅ **Free tier** - 100k requests/day for free
- ✅ **Built-in D1 SQLite** - Serverless SQLite database
- ✅ **Integrated with Vite** - `wrangler dev` works with Vite

## Cons / Considerations

- ❌ **Network isolation** - Workers run in Cloudflare's network, can't directly access your local Kea API
  - Would need to expose Kea API publicly (with auth) or use Cloudflare Tunnel
- ❌ **Runtime differences** - Workers API is different from Node/Deno
  - Need to rewrite backend to use Workers API
  - SQLite → D1 migration
- ❌ **Development complexity** - Need to set up Cloudflare Tunnel for local dev

## Migration Path (if you want to go this route)

### 1. Convert Backend to Workers

```typescript
// backend/src/index.ts (Cloudflare Workers version)
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle API routes
    const url = new URL(request.url);

    if (url.pathname === '/api/leases') {
      // Query D1 database
      const { results } = await env.DB.prepare(
        'SELECT * FROM leases ORDER BY created_at DESC'
      ).all();

      return Response.json({ leases: results });
    }

    // Serve static assets from Workers Assets
    return env.ASSETS.fetch(request);
  }
}
```

### 2. Use D1 for SQLite

```bash
# Create D1 database
wrangler d1 create looking-glass-db

# Run migrations
wrangler d1 execute looking-glass-db --file=./schema.sql
```

### 3. Access Kea API via Cloudflare Tunnel

```bash
# On your network, run tunnel to expose Kea
cloudflared tunnel create kea-tunnel
cloudflared tunnel route dns kea-tunnel kea.yourdomain.com
cloudflared tunnel run kea-tunnel --url http://localhost:8000
```

Then your Worker can access: `https://kea.yourdomain.com`

### 4. Development with Wrangler

```json
// wrangler.toml
name = "looking-glass"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "looking-glass-db"
database_id = "xxx"

[vars]
KEA_API_URL = "https://kea.yourdomain.com"
```

```bash
# Dev mode (auto-starts backend)
wrangler dev

# Deploy
wrangler deploy
```

## Current Recommendation

**Stick with Deno for now** because:
1. You're running locally or in your cluster
2. Kea API is not publicly exposed (security)
3. Simpler development workflow
4. Already working!

**Consider Cloudflare Workers if:**
1. You want to expose this dashboard publicly
2. You're willing to set up Cloudflare Tunnel for Kea API access
3. You want global distribution and CDN caching
4. You want serverless auto-scaling

## Hybrid Approach

You could also:
- Keep Deno backend for local/cluster use
- Deploy static frontend to Cloudflare Pages (free)
- Use Cloudflare Access for authentication

This gives you the best of both worlds: fast global static site delivery but backend stays secure in your network.
