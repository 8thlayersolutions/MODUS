import { getRepos } from "../../../utils/db";
import { requireAuthedUserId } from "../../../utils/session";
import {
  minecraftVisibleInGuild,
  readMinecraftDashboardVisibility,
  validGuildId,
} from "../../../utils/minecraft-dashboard-visibility";

/**
 * Guild-scoped navigation decision. Only returns a boolean; it does not expose
 * the global allowlist or any private member/role data.
 */
export default defineEventHandler(async (event) => {
  await requireAuthedUserId(event);
  setHeader(event, "Cache-Control", "private, no-store");
  const guildId = getQuery(event).guild_id;
  if (!validGuildId(guildId)) {
    throw createError({ statusCode: 400, statusMessage: "Valid guild_id is required." });
  }
  const repos = getRepos();
  if (!repos) throw createError({ statusCode: 503, statusMessage: "Database unavailable." });
  const config = await readMinecraftDashboardVisibility(repos);
  return { visible: minecraftVisibleInGuild(config, guildId) };
});
