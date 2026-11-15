import { requireModuleAccess } from "../../../utils/session";
import { encryptTokens, exchangeTwitch, twitchSelf, twitchRepo } from "../../../utils/twitch-sync";
import { getRepos } from "../../../utils/db";

export default defineEventHandler(async event => {
  const payload = getCookie(event, "twitch_sync_broadcaster_oauth") || "";
  deleteCookie(event, "twitch_sync_broadcaster_oauth", { path: "/api/twitch-sync/broadcaster" });
  const [guildId, nonce] = payload.split(":");
  if (!guildId || !nonce || getQuery(event).state !== nonce) {
    throw createError({ statusCode: 403, statusMessage: "Invalid or expired broadcaster authorization" });
  }
  await requireModuleAccess(event, guildId, "twitch-sync");
  const redirect = "/dashboard/server/" + guildId + "/modules/twitch-sync";
  const query = getQuery(event);
  if (query.error || typeof query.code !== "string") return sendRedirect(event, redirect + "?oauth=denied");
  try {
    const tokens = await exchangeTwitch(query.code);
    const scopes = [
      "channel:read:editors", "channel:read:vips", "moderation:read",
      "moderator:read:followers", "channel:read:subscriptions",
    ];
    if (!scopes.every(scope => tokens.scopes.includes(scope))) throw new Error("Required Twitch read-only scopes missing");
    const self = await twitchSelf(tokens.accessToken);
    const saved = await getRepos()?.guildConfigs.getModuleSettings(guildId, "twitch-sync");
    if (saved?.channelLogin && saved.channelLogin.toLowerCase() !== self.login.toLowerCase()) {
      return sendRedirect(event, redirect + "?oauth=channel-mismatch");
    }
    await twitchRepo().setBroadcaster({
      guildId, twitchId: self.id, twitchLogin: self.login,
      encryptedToken: encryptTokens(tokens), expiresAt: new Date(tokens.expiresAt),
    });
    return sendRedirect(event, redirect + "?oauth=success");
  } catch (error) {
    console.error("[TwitchSync] Broadcaster connection failed:", error instanceof Error ? error.message : "unknown");
    return sendRedirect(event, redirect + "?oauth=error");
  }
});
