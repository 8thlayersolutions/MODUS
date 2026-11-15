/**
 * Production startup preflight: apply pending schema migrations before login.
 * The Docker entrypoint only launches the bot if this exits successfully.
 */
import { resolve } from "node:path";
import { runMigrations } from "@modus/db";

const connectionString = process.env.DATABASE_URL;
const directory = process.env.MODUS_MIGRATIONS_DIR ?? resolve(__dirname, "../db-migrations");

if (!connectionString) {
  console.error("[migrations] DATABASE_URL is required; refusing to start MODUS");
  process.exitCode = 1;
} else {
  runMigrations({ connectionString, directory }).catch((error) => {
    console.error("[migrations] startup migration failed; bot will not start", error);
    process.exitCode = 1;
  });
}
