import { buildStreamWeek, normalizeStreamSchedule } from "@modus/db/stream-schedule";
import { getRepos } from "../../../utils/db";

/**
 * Public read-only feed for a single guild. Never return the raw settings blob:
 * it may gain private fields in the future. Only the safe schedule projection
 * goes over the wire. The dashboard editor remains OAuth-protected.
 */
export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, "guild_id") || "";
  if (!/^\d{16,22}$/.test(guildId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid Discord server ID" });
  }
  const week = Number(getQuery(event).week ?? 0);
  if (!Number.isInteger(week) || week < 0 || week > 12) {
    throw createError({ statusCode: 400, statusMessage: "Week must be an integer between 0 and 12" });
  }
  const repos = getRepos();
  if (!repos) throw createError({ statusCode: 503, statusMessage: "Database unavailable" });
  const [enabled, stored] = await Promise.all([
    repos.guildConfigs.isModuleEnabled(guildId, "stream-schedule"),
    repos.guildConfigs.getModuleSettings(guildId, "stream-schedule"),
  ]);
  const settings = normalizeStreamSchedule(stored);
  if (!enabled || !settings.public) {
    throw createError({ statusCode: 404, statusMessage: "This schedule is not published" });
  }
  setHeader(event, "Cache-Control", "public, max-age=60");
  setHeader(event, "Access-Control-Allow-Origin", "*");
  return {
    title: settings.title,
    description: settings.description,
    timezone: settings.timezone,
    twitchUrl: settings.twitchChannel ? "https://www.twitch.tv/" + settings.twitchChannel : "",
    schedule: buildStreamWeek(settings, new Date(), week),
    generatedAt: new Date().toISOString(),
  };
});
