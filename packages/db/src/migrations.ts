/**
 * Apply all MODUS migrations before the Discord bot starts.
 *
 * Drizzle is the canonical schema migration system. The legacy raw-SQL
 * migrations are retained for already-deployed instances and migration 0005.
 * A session-level Postgres advisory lock serializes the complete preflight
 * across concurrent bot replicas or deployment restarts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient } from "pg";

export interface MigrationOptions {
  connectionString: string;
  directory: string;
  drizzleDirectory: string;
  log?: (message: string) => void;
}

export async function runMigrations(options: MigrationOptions): Promise<void> {
  const log = options.log ?? console.log;
  // Never start the bot if the Docker build omitted either migration system.
  for (const dir of [options.directory, options.drizzleDirectory]) {
    if (!statSync(dir).isDirectory()) {
      throw new Error(`Migration path is not a directory: ${dir}`);
    }
  }
  const legacyFiles = readdirSync(options.directory)
    .filter((file) => /^\d+_[\w-]+\.sql$/.test(file))
    .sort();
  if (legacyFiles.length === 0) {
    throw new Error(`No legacy SQL migrations found at ${options.directory}`);
  }

  const pool = new Pool({ connectionString: options.connectionString, max: 1 });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("SELECT pg_advisory_lock(hashtext('modus:schema-migrations'))");
    try {
      // An existing legacy database must be baselined before applying Drizzle's
      // historical migrations. Otherwise 0000 would try to recreate live tables.
      const marker = await client.query<{ exists: string | null }>(
        "SELECT to_regclass('drizzle.__drizzle_migrations')::text AS exists",
      );
      if (!marker.rows[0]?.exists) {
        const existing = await client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM pg_tables WHERE schemaname = 'public'",
        );
        if (Number(existing.rows[0]?.count ?? 0) > 0) {
          throw new Error(
            "Existing schema has no Drizzle migration history. " +
            "Run the one-time db:baseline procedure after validating the schema " +
            "before enabling automatic migrations. Refusing to re-create live tables.",
          );
        }
      }

      log("[migrations] checking Drizzle schema migrations");
      // Use the locked PostgreSQL connection, not another pool connection.
      await migrate(drizzle(client), { migrationsFolder: options.drizzleDirectory });
      log("[migrations] Drizzle migrations up to date");

      // Retain legacy history for older deployments and the already-released
      // suggestions migration. Every raw-SQL file and its tracking record
      // commit in a single transaction, skipping files previously applied.
      await client.query(`
        CREATE TABLE IF NOT EXISTS _db_migrations (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      for (const file of legacyFiles) {
        const { rows } = await client.query(
          "SELECT 1 FROM _db_migrations WHERE name = $1",
          [file],
        );
        if (rows.length > 0) {
          log(`[migrations] skip ${file} (already applied)`);
          continue;
        }
        const sql = readFileSync(join(options.directory, file), "utf-8");
        log(`[migrations] apply legacy ${file}`);
        try {
          await client.query("BEGIN");
          await client.query(sql);
          await client.query("INSERT INTO _db_migrations (name) VALUES ($1)", [file]);
          await client.query("COMMIT");
          log(`[migrations] applied ${file}`);
        } catch (error) {
          await client.query("ROLLBACK");
          throw new Error(`Legacy migration ${file} failed`, { cause: error });
        }
      }
      log("[migrations] database schema is up to date");
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('modus:schema-migrations'))");
    }
  } finally {
    client?.release();
    await pool.end();
  }
}
