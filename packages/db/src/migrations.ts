/**
 * Versioned Postgres schema migrations for MODUS.
 *
 * The bot container executes this before starting Discord. One PostgreSQL
 * advisory lock serializes migrations across simultaneous redeploys/replicas.
 * Each SQL file and its _db_migrations record commit atomically.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

export interface MigrationOptions {
  connectionString: string;
  directory: string;
  log?: (message: string) => void;
}

export async function runMigrations(options: MigrationOptions): Promise<void> {
  const log = options.log ?? console.log;
  // Fail closed rather than silently starting a bot with missing SQL files.
  if (!statSync(options.directory).isDirectory()) {
    throw new Error(`Migration path is not a directory: ${options.directory}`);
  }
  const files = readdirSync(options.directory)
    .filter((file) => /^\d+_[\w-]+\.sql$/.test(file))
    .sort();

  if (files.length === 0) {
    throw new Error(`No versioned SQL migrations found at ${options.directory}`);
  }

  const pool = new Pool({ connectionString: options.connectionString, max: 1 });
  let client;
  try {
    client = await pool.connect();
    // Connection-scoped lock covers metadata creation, discovery and execution.
    // It is automatically released if this process dies mid-migration.
    await client.query("SELECT pg_advisory_lock(hashtext('modus:schema-migrations'))");
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS _db_migrations (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      for (const file of files) {
        const { rows } = await client.query(
          "SELECT 1 FROM _db_migrations WHERE name = $1",
          [file],
        );
        if (rows.length > 0) {
          log(`[migrations] skip ${file} (already applied)`);
          continue;
        }

        const sql = readFileSync(join(options.directory, file), "utf-8");
        log(`[migrations] apply ${file}`);
        try {
          await client.query("BEGIN");
          await client.query(sql);
          await client.query("INSERT INTO _db_migrations (name) VALUES ($1)", [file]);
          await client.query("COMMIT");
          log(`[migrations] applied ${file}`);
        } catch (error) {
          await client.query("ROLLBACK");
          throw new Error(`Migration ${file} failed`, { cause: error });
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
