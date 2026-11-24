import { getRepos } from "../../utils/db";
import { requireBotAdmin } from "../../utils/session";
import { readMinecraftDashboardVisibility } from "../../utils/minecraft-dashboard-visibility";

export default defineEventHandler(async (event) => {
  await requireBotAdmin(event);
  setHeader(event, "Cache-Control", "private, no-store");
  const repos = getRepos();
  if (!repos) throw createError({ statusCode: 503, statusMessage: "Database unavailable." });
  return readMinecraftDashboardVisibility(repos);
});
