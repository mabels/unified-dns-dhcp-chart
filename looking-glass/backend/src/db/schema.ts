// Drizzle ORM schema for Looking Glass database

import { sqliteTable, integer, text, index, unique } from 'drizzle-orm/sqlite-core'

export const leases = sqliteTable('leases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  endpoint: text('endpoint').notNull(),
  ipAddress: text('ip_address').notNull(),
  hwAddress: text('hw_address').notNull(),
  hostname: text('hostname'),
  subnetId: integer('subnet_id').notNull(),
  validLft: integer('valid_lft').notNull(),
  cltt: integer('cltt').notNull(),
  state: integer('state').notNull(),
  fqdnFwd: integer('fqdn_fwd').notNull().default(0),
  fqdnRev: integer('fqdn_rev').notNull().default(0),
  clientId: text('client_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  uniqueLeaseIdx: unique().on(table.endpoint, table.ipAddress, table.hwAddress),
  createdIdx: index('idx_leases_created').on(table.createdAt),
  endpointIdx: index('idx_leases_endpoint').on(table.endpoint),
  ipIdx: index('idx_leases_ip').on(table.ipAddress),
}))

export type Lease = typeof leases.$inferSelect
export type NewLease = typeof leases.$inferInsert
