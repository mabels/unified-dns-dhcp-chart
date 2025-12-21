// Database client using @libsql and Drizzle ORM

import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createClient } from '@libsql/client'
import * as schema from './schema.js'
import { existsSync, copyFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Get database path from environment or use default
const dbPath = process.env.DB_PATH || './leases.db'
const templateDbPath = './leases.db' // Template database in backend directory

// Initialize database directory
function initializeDatabase() {
  // Ensure directory exists
  const dir = dirname(dbPath)
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
    console.log(`Created database directory: ${dir}`)
  }

  // Check if database exists
  if (!existsSync(dbPath)) {
    console.log(`Database not found at ${dbPath}`)

    // Try to copy template database if it exists and is different from target
    if (templateDbPath !== dbPath && existsSync(templateDbPath)) {
      console.log(`Copying template database from ${templateDbPath}`)
      copyFileSync(templateDbPath, dbPath)
      console.log(`Template database copied to ${dbPath}`)
    } else {
      console.log(`Will create new database at ${dbPath}`)
    }
  }
}

// Initialize database before creating client
initializeDatabase()

// Create libsql client
const client = createClient({
  url: `file:${dbPath}`
})

// Create Drizzle instance with schema
export const db = drizzle(client, { schema })

// Run migrations to ensure schema is up to date
// The compiled code is in dist/db/, drizzle folder is at backend/drizzle
// From dist/db/client.js -> ../../drizzle
const migrationsFolder = join(__dirname, '../../drizzle')
console.log(`Running migrations from: ${migrationsFolder}`)
await migrate(db, { migrationsFolder })

console.log(`Database ready at: ${dbPath}`)
