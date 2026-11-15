import { requireModuleAccess } from "../../../utils/session";
import { twitchRepo } from "../../../utils/twitch-sync";
export default defineEventHandler(async event => {
  const guildId = String(getQuery(event).guild_id || "");
  if (!/^\d{15,22}$/.test(guildId)) throw createError({ statusCode: 400 });
  await requireModuleAccess(event, guildId, "twitch-sync");
  const link = await twitchRepo().getBroadcaster(guildId);
  return { connected: !!link, login: link?.twitchLogin || null };
});
