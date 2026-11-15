import { randomBytes } from "node:crypto";
import { requireDiscordConfig } from "../../../utils/twitch-sync";

export default defineEventHandler(async event => {
  const guildId = String(getQuery(event).guild_id || "");
  if (!/^\d{15,22}$/.test(guildId)) throw createError({ statusCode: 400, statusMessage: "Invalid server ID" });
  const { clientId, baseUrl } = requireDiscordConfig();
  const nonce = randomBytes(24).toString("hex");
  const action = getQuery(event).action === "disconnect" ? "disconnect" : "connect";
  const secure = baseUrl.startsWith("https:");
  setCookie(event, "twitch_sync_member_oauth", guildId + ":" + nonce + ":" + action, {
    httpOnly: true, secure, sameSite: "lax", maxAge: 600, path: "/api/twitch-sync/member",
  });
  const qs = new URLSearchParams({
    client_id: clientId, response_type: "code", scope: action === "disconnect" ? "identify" : "identify connections",
    redirect_uri: baseUrl + "/api/twitch-sync/member/callback", state: nonce, prompt: "consent",
  });
  return sendRedirect(event, "https://discord.com/oauth2/authorize?" + qs.toString());
});
