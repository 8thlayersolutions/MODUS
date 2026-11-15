/** Post or update the configured staff directory in a guild channel. */
import { buildStaffDiscordPayload, parseStaffListSettings } from "@modus/db";
import { getRepos } from "../../utils/db";
import { requireModuleAccess } from "../../utils/session";
import { getStaffDirectory } from "../../utils/staff-list";

export default defineEventHandler(async event => {
  const body = await readBody<{ guildId?: string; channelId?: string }>(event);
  const guildId = body?.guildId;
  const channelId = body?.channelId;
  if (!guildId || !channelId || !/^\d{16,22}$/.test(guildId) || !/^\d{16,22}$/.test(channelId)) {
    throw createError({ statusCode: 400, statusMessage: "Missing or invalid guild/channel." });
  }
  await requireModuleAccess(event, guildId, "staff-list");
  const repos = getRepos();
  if (!repos) throw createError({ statusCode: 503, statusMessage: "Database unavailable." });
  if (!(await repos.guildConfigs.isModuleEnabled(guildId, "staff-list"))) {
    throw createError({ statusCode: 403, statusMessage: "Staff List is disabled." });
  }
  const settings = parseStaffListSettings(await repos.guildConfigs.getModuleSettings(guildId, "staff-list"));
  const token = useRuntimeConfig().discordBotToken as string;
  if (!token) throw createError({ statusCode: 503, statusMessage: "Discord unavailable." });
  const headers = { Authorization: "Bot " + token };
  const channel = await $fetch<{ guild_id: string; type: number }>(
    "https://discord.com/api/v10/channels/" + channelId, { headers },
  );
  if (channel.guild_id !== guildId || ![0, 5].includes(channel.type)) {
    throw createError({ statusCode: 403, statusMessage: "Channel does not belong to this server or is not a text channel." });
  }
  const { sections } = await getStaffDirectory(guildId, settings, token);
  const payload = buildStaffDiscordPayload(settings, sections);
  const previousId = settings.publishedChannelId === channelId ? settings.publishedMessageId : null;
  let message: { id: string } | null = null;
  let action: "updated" | "posted" = "posted";
  if (previousId) {
    try {
      message = await $fetch<{ id: string }>(
        "https://discord.com/api/v10/channels/" + channelId + "/messages/" + previousId,
        { method: "PATCH", headers, body: payload },
      );
      action = "updated";
    } catch (error: any) {
      if ((error?.status || error?.statusCode) !== 404) throw error;
    }
  }
  if (!message) {
    message = await $fetch<{ id: string }>(
      "https://discord.com/api/v10/channels/" + channelId + "/messages",
      { method: "POST", headers, body: payload },
    );
  }
  await repos.guildConfigs.setModuleSettings(guildId, "staff-list", {
    ...settings,
    publishedChannelId: channelId,
    publishedMessageId: message.id,
  });
  return { success: true, action, channelId, messageId: message.id };
});
