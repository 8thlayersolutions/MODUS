/** Public roster endpoint for website embeds. Only opt-in public content is returned. */
import { parseStaffListSettings } from "@modus/db";
import { getRepos } from "../../utils/db";
import { getStaffDirectory } from "../../utils/staff-list";

export default defineEventHandler(async event => {
  const guildId = getRouterParam(event, "guild_id");
  if (!guildId || !/^\d{16,22}$/.test(guildId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid server ID." });
  }
  const repos = getRepos();
  if (!repos) throw createError({ statusCode: 503, statusMessage: "Database unavailable." });
  const enabled = await repos.guildConfigs.isModuleEnabled(guildId, "staff-list");
  const settings = parseStaffListSettings(await repos.guildConfigs.getModuleSettings(guildId, "staff-list"));
  if (!enabled || !settings.publicEnabled) {
    throw createError({ statusCode: 404, statusMessage: "Staff list is not public." });
  }
  const token = useRuntimeConfig().discordBotToken as string;
  if (!token) throw createError({ statusCode: 503, statusMessage: "Discord unavailable." });
  try {
    const { sections } = await getStaffDirectory(guildId, settings, token);
    setHeader(event, "Cache-Control", "public, max-age=30, stale-while-revalidate=30");
    setHeader(event, "Access-Control-Allow-Origin", "*");
    return {
      title: settings.title,
      description: settings.description,
      theme: {
        layout: settings.layout,
        accentColor: settings.accentColor,
        backgroundColor: settings.backgroundColor,
        cardColor: settings.cardColor,
        textColor: settings.textColor,
        showAvatars: settings.showAvatars,
        showRoleBadges: settings.showRoleBadges,
      },
      sections: sections.map(section => ({
        id: section.id,
        title: section.title,
        description: section.description,
        members: section.members.map(member => ({
          id: member.id,
          name: member.name,
          avatarUrl: settings.showAvatars ? member.avatarUrl : null,
          badges: member.badges.map(role => ({ id: role.id, name: role.name, color: role.color })),
        })),
      })),
    };
  } catch (error: any) {
    if (error?.statusCode) throw error;
    console.error("[staff-list] public directory failed:", error);
    throw createError({ statusCode: 503, statusMessage: "Staff directory temporarily unavailable." });
  }
});
