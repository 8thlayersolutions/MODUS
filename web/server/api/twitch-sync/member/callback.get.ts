import {
  discordIdentity, discordTwitchConnection, encryptTokens,
  exchangeDiscordMember, requireGuildMembership, twitchRepo,
} from "../../../utils/twitch-sync";

export default defineEventHandler(async event => {
  const payload = getCookie(event, "twitch_sync_member_oauth") || "";
  deleteCookie(event, "twitch_sync_member_oauth", { path: "/api/twitch-sync/member" });
  const [guildId, nonce] = payload.split(":");
  const query = getQuery(event);
  if (!guildId || !nonce || query.state !== nonce) {
    throw createError({ statusCode: 403, statusMessage: "Invalid or expired account-link request" });
  }
  if (query.error) return sendRedirect(event, "/twitch-linked?status=denied");
  if (typeof query.code !== "string") throw createError({ statusCode: 400, statusMessage: "Missing OAuth code" });
  try {
    const tokens = await exchangeDiscordMember(query.code);
    if (!tokens.scopes.includes("connections") || !tokens.scopes.includes("identify")) {
      throw new Error("Required Discord permissions were not granted");
    }
    const identity = await discordIdentity(tokens.accessToken);
    await requireGuildMembership(guildId, identity.id);
    const linked = await discordTwitchConnection(tokens.accessToken);
    if (!linked) return sendRedirect(event, "/twitch-linked?status=no-connection");
    // Discord returns the Twitch platform ID. We never accept usernames supplied in a form.
    await twitchRepo().setMember({
      guildId, discordId: identity.id, twitchId: linked.id, twitchLogin: linked.name,
      encryptedToken: encryptTokens(tokens), expiresAt: new Date(tokens.expiresAt),
    });
    return sendRedirect(event, "/twitch-linked?status=success");
  } catch (error) {
    console.error("[TwitchSync] Member linking rejected:", error instanceof Error ? error.message : "unknown error");
    return sendRedirect(event, "/twitch-linked?status=error");
  }
});
