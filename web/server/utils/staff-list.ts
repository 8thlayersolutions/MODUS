/** Server-only Discord roster lookup; never expose the bot token to clients. */
import {
  buildStaffSections,
  type StaffListSettings,
  type StaffMember,
  type StaffRole,
} from "@modus/db";

interface DiscordMember {
  user?: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
  nick?: string | null;
  avatar?: string | null;
  roles: string[];
}
interface DiscordRole {
  id: string; name: string; color: number;
}
const cache = new Map<string, { expires: number; roles: StaffRole[]; members: StaffMember[] }>();
const MAX_PAGES = 25; // Fail visibly rather than silently publish a partial directory.

function apiHeaders(botToken: string) {
  return { Authorization: "Bot " + botToken };
}
function toMember(guildId: string, member: DiscordMember): StaffMember | null {
  const user = member.user;
  if (!user?.id) return null;
  const avatarUrl = member.avatar
    ? "https://cdn.discordapp.com/guilds/" + guildId + "/users/" + user.id + "/avatars/" + member.avatar + ".png?size=128"
    : user.avatar
      ? "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + ".png?size=128"
      : null;
  return {
    id: user.id,
    name: member.nick || user.global_name || user.username,
    avatarUrl,
    roleIds: Array.isArray(member.roles) ? member.roles : [],
    bot: user.bot === true,
  };
}

async function loadRoster(guildId: string, settings: StaffListSettings, botToken: string) {
  const cached = cache.get(guildId);
  if (cached && cached.expires > Date.now()) return cached;
  const headers = apiHeaders(botToken);
  const rolesRaw = await $fetch<DiscordRole[]>("https://discord.com/api/v10/guilds/" + guildId + "/roles", { headers });
  const roles = rolesRaw.map(role => ({ id: role.id, name: role.name, color: role.color }));

  const members = new Map<string, StaffMember>();
  if (settings.groups.some(group => group.roleIds.length)) {
    let after = "0";
    let completed = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const batch = await $fetch<DiscordMember[]>(
        "https://discord.com/api/v10/guilds/" + guildId + "/members",
        { headers, query: { limit: 1000, after } },
      );
      for (const member of batch) {
        const parsed = toMember(guildId, member);
        if (parsed) members.set(parsed.id, parsed);
      }
      if (batch.length < 1000) { completed = true; break; }
      const last = batch[batch.length - 1]?.user?.id;
      if (!last || last === after) break;
      after = last;
    }
    if (!completed) throw new Error("Server has too many members for the staff directory. Use explicit member IDs or reduce roster size.");
  }
  const selected = [...new Set(settings.groups.flatMap(group => group.memberIds))];
  await Promise.all(selected.filter(id => !members.has(id)).map(async id => {
    try {
      const member = await $fetch<DiscordMember>(
        "https://discord.com/api/v10/guilds/" + guildId + "/members/" + id,
        { headers },
      );
      const parsed = toMember(guildId, member);
      if (parsed) members.set(parsed.id, parsed);
    } catch (error: any) {
      if ((error?.statusCode || error?.status) !== 404) throw error;
    }
  }));
  const value = { expires: Date.now() + 30_000, roles, members: [...members.values()] };
  cache.set(guildId, value);
  return value;
}

export async function getStaffDirectory(guildId: string, settings: StaffListSettings, botToken: string) {
  const { roles, members } = await loadRoster(guildId, settings, botToken);
  return { sections: buildStaffSections(settings, members, roles), roles };
}
