import { randomBytes } from "node:crypto";
import { requireModuleAccess } from "../../../utils/session";
import { requireTwitchConfig } from "../../../utils/twitch-sync";

export default defineEventHandler(async event => {
  const guildId = String(getQuery(event).guild_id || "");
  if (!/^\d{15,22}$/.test(guildId)) throw createError({ statusCode: 400, statusMessage: "Invalid server ID" });
  await requireModuleAccess(event, guildId, "twitch-sync");
  const { clientId, baseUrl } = requireTwitchConfig();
  const nonce = randomBytes(24).toString("hex");
  setCookie(event, "twitch_sync_broadcaster_oauth", guildId + ":" + nonce, {
    httpOnly: true, secure: baseUrl.startsWith("https:"), sameSite: "lax", maxAge: 600,
    path: "/api/twitch-sync/broadcaster",
  });
  const qs = new URLSearchParams({
    client_id: clientId, response_type: "code",
    redirect_uri: baseUrl + "/api/twitch-sync/broadcaster/callback", state: nonce,
    scope: "channel:read:editors channel:read:vips moderation:read moderator:read:followers channel:read:subscriptions",
    force_verify: "true",
  });
  return sendRedirect(event, "https://id.twitch.tv/oauth2/authorize?" + qs.toString());
});
