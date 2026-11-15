/** Run the same advisory-locked migrations locally as the production bot startup. */
import { resolve } from "node:path";
import { runMigrations } from "../src/migrations";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

runMigrations({
  connectionString,
  directory: resolve(__dirname, "../migrations"),
}).catch((error) => {
  console.error("[migrations] failed:", error);
  process.exitCode = 1;
});
