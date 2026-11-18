import { requireAuthedUserId } from "../../../utils/session";

/**
 * Signed-in Discord member details for the configured Chaos SMP guild only.
 * Never accepts a userId or guildId from the browser.
 * Role ownership is rechecked with Discord on each request.
 */
export default defineEventHandler(async (event) => {
  setHeader(event, "Cache-Control", "private, no-store");
  const identity = await requireAuthedUserId(event);
  const config = useRuntimeConfig();
  const guild = String(config.chaosSmpGuildId || "");
  const botToken = String(config.discordBotToken || "");
  const whitelistRoleId = String(config.chaosSmpWhitelistRoleId || "");
  const verifiedRoleId = String(config.chaosSmpVerifiedRoleId || "");
  if (!/^\d{17,22}$/.test(guild) || !botToken) {
    throw createError({ statusCode: 503, statusMessage: "CHAOS HQ Discord integration is not configured." });
  }
  const configured = /^\d{17,22}$/.test(whitelistRoleId) && /^\d{17,22}$/.test(verifiedRoleId);
  let data: { roles?: string[]; pending?: boolean; nick?: string | null } | null = null;
  try {
    data = await $fetch("https://discord.com/api/v10/guilds/" + guild + "/members/" + identity.userId, {
      headers: { Authorization: "Bot " + botToken },
      timeout: 6000,
    });
  } catch (err: any) {
    const code = err?.status || err?.statusCode || err?.response?.status;
    if (Number(code) !== 404) {
      throw createError({ statusCode: 503, statusMessage: "Discord membership verification is temporarily unavailable." });
    }
  }
  const isMember = !!data && !data.pending;
  const roles = isMember && Array.isArray(data?.roles) ? data.roles : [];
  return {
    inGuild: isMember,
    roleConfigurationReady: configured,
    // These are Discord roles, not the in-game Minecraft whitelist.
    hasWhitelistRole: configured && roles.includes(whitelistRoleId),
    hasVerifiedRole: configured && roles.includes(verifiedRoleId),
    canViewMemberResources: configured && (roles.includes(verifiedRoleId) || roles.includes(whitelistRoleId)),
    discordDisplayName: isMember ? data?.nick || identity.actorDisplay : identity.actorDisplay,
    checkedAt: new Date().toISOString(),
  };
});
