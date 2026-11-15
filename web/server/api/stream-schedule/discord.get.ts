import { getRepos } from "../../utils/db";
import { requireModuleAccess } from "../../utils/session";

export default defineEventHandler(async (event) => {
  const guildId = String(getQuery(event).guild_id || "");
  if (!/^\d{16,22}$/.test(guildId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid guild ID" });
  }
  await requireModuleAccess(event, guildId, "stream-schedule");
  const repos = getRepos();
  if (!repos) throw createError({ statusCode: 503, statusMessage: "Database unavailable" });
  const pub = await repos.guildConfigs.getModuleSettings(guildId, "stream-schedule-publication");
  const channelId = /^\d{16,22}$/.test(String(pub.channelId ?? "")) ? String(pub.channelId) : "";
  const messageId = /^\d{16,22}$/.test(String(pub.messageId ?? "")) ? String(pub.messageId) : "";
  return {
    published: Boolean(channelId && messageId),
    channelId,
    messageId,
    messageUrl: channelId && messageId
      ? "https://discord.com/channels/" + guildId + "/" + channelId + "/" + messageId
      : "",
    updatedAt: typeof pub.updatedAt === "string" ? pub.updatedAt : null,
  };
});
