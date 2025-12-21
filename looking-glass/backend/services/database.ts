// SQLite database for tracking lease history
// Maintains created/updated timestamps for each lease

import { Database } from "jsr:@db/sqlite@0.12";

export interface StoredLease {
  id?: number;
  endpoint: string;
  ip_address: string;
  hw_address: string;
  hostname: string | null;
  subnet_id: number;
  valid_lft: number;
  cltt: number;
  state: number;
  fqdn_fwd: number;
  fqdn_rev: number;
  client_id: string | null;
  created_at: number; // Unix timestamp when first seen
  updated_at: number; // Unix timestamp when last seen/renewed
}

export class LeaseDatabase {
  private db: Database;

  constructor(dbPath: string = "./leases.db") {
    this.db = new Database(dbPath);
    this.initDatabase();
  }

  private initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS leases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        hw_address TEXT NOT NULL,
        hostname TEXT,
        subnet_id INTEGER NOT NULL,
        valid_lft INTEGER NOT NULL,
        cltt INTEGER NOT NULL,
        state INTEGER NOT NULL,
        fqdn_fwd INTEGER NOT NULL DEFAULT 0,
        fqdn_rev INTEGER NOT NULL DEFAULT 0,
        client_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(endpoint, ip_address, hw_address)
      )
    `);

    // Create indexes for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_leases_created
      ON leases(created_at DESC)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_leases_endpoint
      ON leases(endpoint)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_leases_ip
      ON leases(ip_address)
    `);
  }

  upsertLease(lease: Omit<StoredLease, "id" | "created_at" | "updated_at">) {
    const now = Math.floor(Date.now() / 1000);

    // Try to find existing lease by endpoint + ip + mac
    const existing = this.db.prepare(`
      SELECT created_at FROM leases
      WHERE endpoint = ? AND ip_address = ? AND hw_address = ?
    `).get(lease.endpoint, lease.ip_address, lease.hw_address) as
      | { created_at: number }
      | undefined;

    if (existing) {
      // Update existing lease, preserve created_at
      this.db.prepare(`
        UPDATE leases SET
          hostname = ?,
          subnet_id = ?,
          valid_lft = ?,
          cltt = ?,
          state = ?,
          fqdn_fwd = ?,
          fqdn_rev = ?,
          client_id = ?,
          updated_at = ?
        WHERE endpoint = ? AND ip_address = ? AND hw_address = ?
      `).run(
        lease.hostname,
        lease.subnet_id,
        lease.valid_lft,
        lease.cltt,
        lease.state,
        lease.fqdn_fwd,
        lease.fqdn_rev,
        lease.client_id,
        now,
        lease.endpoint,
        lease.ip_address,
        lease.hw_address,
      );
    } else {
      // Insert new lease
      this.db.prepare(`
        INSERT INTO leases (
          endpoint, ip_address, hw_address, hostname, subnet_id,
          valid_lft, cltt, state, fqdn_fwd, fqdn_rev, client_id,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        lease.endpoint,
        lease.ip_address,
        lease.hw_address,
        lease.hostname,
        lease.subnet_id,
        lease.valid_lft,
        lease.cltt,
        lease.state,
        lease.fqdn_fwd,
        lease.fqdn_rev,
        lease.client_id,
        now,
        now,
      );
    }
  }

  getAllLeases(): StoredLease[] {
    return this.db.prepare(`
      SELECT * FROM leases ORDER BY created_at DESC
    `).all() as StoredLease[];
  }

  getLeasesByEndpoint(endpoint: string): StoredLease[] {
    return this.db.prepare(`
      SELECT * FROM leases WHERE endpoint = ? ORDER BY created_at DESC
    `).all(endpoint) as StoredLease[];
  }

  // Clean up expired leases (optional - run periodically)
  cleanupExpiredLeases(olderThanDays: number = 30) {
    const cutoff = Math.floor(Date.now() / 1000) - olderThanDays * 24 * 60 * 60;
    this.db.prepare(`
      DELETE FROM leases
      WHERE updated_at < ? AND (cltt + valid_lft) < ?
    `).run(cutoff, Math.floor(Date.now() / 1000));
  }

  close() {
    this.db.close();
  }
}
