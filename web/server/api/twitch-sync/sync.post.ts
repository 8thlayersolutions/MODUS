/**
 * POST /api/twitch-sync/sync
 * Authenticated bot-side reconciliation, never exposed to members or dashboard users.
 * All Twitch/Discord role changes occur only after complete and successful verification.
 */
import { getRepos } from "../../utils/db";
import {
  activeTwitchToken, decryptTokens, encryptTokens, refreshDiscordMember,
  discordTwitchConnection, requireTwitchConfig,
} from "../../utils/twitch-sync";
import { parseTwitchSyncSettings, TWITCH_ROLE_TYPES, planTwitchRoleChanges } from "@modus/db/twitch-sync";

interface DiscordMember { roles: string[]; user?: { id: string } }
interface DiscordRole { id: string; managed: boolean; position: number }
interface TwitchResponse { data: Array<Record<string, string>> }
const verifiedTypes = TWITCH_ROLE_TYPES.filter(type => type.automatic).map(type => type.id);

export default defineEventHandler(async event => {
  const secret = useRuntimeConfig().botApiSecret as string;
  if (!secret || getHeader(event, "authorization") !== "Bearer " + secret) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }
  const body = await readBody<{ guildId?: string }>(event);
  const guildId = body?.guildId || "";
  if (!/^\d{15,22}$/.test(guildId)) throw createError({ statusCode: 400, statusMessage: "Invalid guild" });
  const repos = getRepos();
  if (!repos) throw createError({ statusCode: 503, statusMessage: "Database unavailable" });
  if (!(await repos.guildConfigs.isModuleEnabled(guildId, "twitch-sync"))) return { skipped: "disabled" };
  const settings = parseTwitchSyncSettings(await repos.guildConfigs.getModuleSettings(guildId, "twitch-sync"));
  if (!settings.channelLogin || !verifiedTypes.some(type => !!settings.mappings[type])) {
    return { skipped: "no mappings or channel" };
  }
  const broadcaster = await activeTwitchToken(guildId);
  if (!broadcaster) return { skipped: "broadcaster authorization required" };
  if (broadcaster.twitchLogin.toLowerCase() !== settings.channelLogin.toLowerCase()) {
    return { skipped: "configured channel and authorized broadcaster differ" };
  }
  const cfg = useRuntimeConfig();
  const botToken = cfg.discordBotToken as string;
  const clientId = cfg.public.discordClientId as string;
  const twitchClient = requireTwitchConfig().clientId;
  if (!botToken || !clientId) throw createError({ statusCode: 503, statusMessage: "Discord bot not configured" });
  const discordHeaders = { Authorization: "Bot " + botToken };
  const guildUrl = "https://discord.com/api/v10/guilds/" + guildId;
  // Check bot role hierarchy once before any mutation.
  const [roles, botMember] = await Promise.all([
    $fetch<DiscordRole[]>(guildUrl + "/roles", { headers: discordHeaders }),
    $fetch<DiscordMember>(guildUrl + "/members/" + clientId, { headers: discordHeaders }),
  ]);
  const top = roles.filter(r => botMember.roles.includes(r.id)).reduce((max, r) => Math.max(max, r.position), 0);
  const grantable = new Set(roles.filter(r =>
    !r.managed && r.id !== guildId && r.position < top).map(r => r.id));

  const twitchHeaders = { Authorization: "Bearer " + broadcaster.accessToken, "Client-Id": twitchClient };
  const twitchUrl = (path: string, params: Record<string, string>) =>
    "https://api.twitch.tv/helix/" + path + "?" + new URLSearchParams({
      broadcaster_id: broadcaster.twitchId, ...params,
    }).toString();
  // Editors API has no user_id filter; fetch once for the entire guild run.
  // If it fails, abort the entire run: never infer a lack of permission.
  const shouldCheck = (type: string) => !!settings.mappings[type as keyof typeof settings.mappings];
  const editors = shouldCheck("editor")
    ? await $fetch<TwitchResponse>(twitchUrl("channels/editors", {}), { headers: twitchHeaders })
    : { data: [] };
  const editorIds = new Set(editors.data.map(entry => entry.user_id));
  let verified = 0, assigned = 0, removed = 0, failed = 0;
  const linkedMembers = await repos.twitchSync.listMembers(guildId);
  for (const link of linkedMembers) {
    try {
      // Resolve the current Discord member before attempting Twitch checks.
      // A transient 404/503 leaves previous grant records unchanged.
      const member = await $fetch<DiscordMember>(
        guildUrl + "/members/" + link.discordId, { headers: discordHeaders },
      );
      let discordTokens = decryptTokens(link.encryptedToken);
      if (discordTokens.expiresAt < Date.now() + 60_000) {
        discordTokens = await refreshDiscordMember(discordTokens);
        await repos.twitchSync.refreshMemberTokens(
          guildId, link.discordId, link.twitchId,
          encryptTokens(discordTokens), new Date(discordTokens.expiresAt),
        );
      }
      const connection = await discordTwitchConnection(discordTokens.accessToken);
      // A changed, verified Discord Twitch connection invalidates channel-specific
      // entitlements from the formerly linked Twitch ID. Keep only the generic
      // Connected entitlement until the member explicitly re-authorizes.
      const changedConnection = !!connection && connection.id !== link.twitchId;
      const statuses = new Set<string>();
      if (connection) statuses.add("connected");
      if (connection && !changedConnection) {
        if (connection.id === broadcaster.twitchId) statuses.add("broadcaster");
        if (editorIds.has(connection.id)) statuses.add("editor");
        // All four endpoint responses must succeed. A Twitch HTTP error is NOT a negative role check.
        const subsEnabled = ["subscriber", "tier1", "tier2", "tier3"].some(shouldCheck);
        const checked = (enabled: boolean, path: string) => enabled
          ? $fetch<TwitchResponse>(twitchUrl(path, { user_id: connection.id }), { headers: twitchHeaders })
          : Promise.resolve({ data: [] } as TwitchResponse);
        const [mods, vips, followers, subs] = await Promise.all([
          checked(shouldCheck("moderator"), "moderation/moderators"),
          checked(shouldCheck("vip"), "channels/vips"),
          checked(shouldCheck("follower"), "channels/followers"),
          checked(subsEnabled, "subscriptions"),
        ]);
        if (mods.data.some(entry => entry.user_id === connection.id)) statuses.add("moderator");
        if (vips.data.some(entry => entry.user_id === connection.id)) statuses.add("vip");
        if (followers.data.some(entry => entry.user_id === connection.id)) statuses.add("follower");
        const subscription = subs.data.find(entry => entry.user_id === connection.id);
        if (subscription) {
          statuses.add("subscriber");
          // 1000/2000/3000 are Twitch's documented tier values.
          if (subscription.tier === "1000") statuses.add("tier1");
          if (subscription.tier === "2000") statuses.add("tier2");
          if (subscription.tier === "3000") statuses.add("tier3");
        }
      }
      // Role mapping applies a union: a role linked to multiple statuses is
      // retained if ANY one qualifying status still matches.
      const current = new Set(member.roles);
      const grants = await repos.twitchSync.getGrants(guildId, link.discordId);
      const plan = planTwitchRoleChanges({
        settings,
        verifiedStatuses: statuses,
        grantableRoleIds: grantable,
        heldRoleIds: current,
        recordedGrantRoleIds: new Set(grants.map(grant => grant.roleId)),
      });
      // Do not record roles already present; they may have been assigned manually.
      for (const roleId of plan.toGrant) {
        await $fetch(guildUrl + "/members/" + link.discordId + "/roles/" + roleId, {
          method: "PUT", headers: discordHeaders,
        });
        await repos.twitchSync.addGrant(guildId, link.discordId, roleId);
        assigned++;
      }
      for (const grant of grants) {
        if (!plan.toRevoke.includes(grant.roleId)) continue;
        if (current.has(grant.roleId)) {
          await $fetch(guildUrl + "/members/" + link.discordId + "/roles/" + grant.roleId, {
            method: "DELETE", headers: discordHeaders,
          });
          removed++;
        }
        await repos.twitchSync.removeGrant(guildId, link.discordId, grant.roleId);
      }
      verified++;
    } catch (error) {
      // OAuth revocation, API errors, timeouts and rate limits never revoke roles.
      failed++;
      console.warn("[TwitchSync] Member sync skipped", guildId, link.discordId,
        error instanceof Error ? error.message : "unknown");
    }
  }
  return { verified, assigned, removed, failed };
});
