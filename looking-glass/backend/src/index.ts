// Looking Glass Backend - Node.js + Hono + Drizzle
// Provides REST API to query Kea DHCP leases

import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { loadConfig } from './config.js'
import health from './routes/health.js'
import segments from './routes/segments.js'
import leases, { cleanupExpiredLeases } from './routes/leases.js'

const app = new Hono()
const config = loadConfig()

console.log('Looking Glass Backend starting...')
console.log(`Port: ${config.port}`)
console.log(`Database: ${config.dbPath}`)
console.log(`Configured endpoints:`)
config.endpoints.forEach((e) => console.log(`  - ${e.name}: ${e.url}`))

// Middleware - CORS
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}))

// API Routes
app.route('/api/health', health)
app.route('/api/segments', segments)
app.route('/api/leases', leases)

// Serve frontend static files (SPA mode)
app.use('/*', serveStatic({
  root: config.staticDir,
}))

// Cleanup old leases on startup
await cleanupExpiredLeases(30)

// Start server
serve({
  fetch: app.fetch,
  port: config.port,
}, (info) => {
  console.log(`Server running on http://localhost:${info.port}`)
})
