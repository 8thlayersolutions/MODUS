import { requireModuleAccess } from "../../utils/session";
import { applicationRepos, applicationGuild, applicationId } from "../../utils/applications";
export default defineEventHandler(async event => {
  const body = await readBody(event);
  const guildId = applicationGuild(body?.guild_id);
  const formId = applicationId(body?.form_id);
  const channelId = typeof body?.channel_id === "string" && /^\d{16,22}$/.test(body.channel_id) ? body.channel_id : null;
  if (!channelId) throw createError({ statusCode: 400, statusMessage: "Invalid channel ID." });
  await requireModuleAccess(event, guildId, "applications");
  const repos = applicationRepos();
  const form = await repos.applications.getForm(guildId, formId);
  if (!form) throw createError({ statusCode: 404, statusMessage: "Form not found." });
  const token = useRuntimeConfig().discordBotToken as string;
  if (!token) throw createError({ statusCode: 503, statusMessage: "Discord bot token missing." });
  const headers = { Authorization: `Bot ${token}` };
  const channel = await $fetch<{ guild_id?: string; type?: number }>(
    `https://discord.com/api/v10/channels/${channelId}`, { headers });
  if (channel.guild_id !== guildId || ![0, 5].includes(channel.type ?? -1)) {
    throw createError({ statusCode: 400, statusMessage: "Channel must be a text/announcement channel in this server." });
  }
  const payload = {
    embeds: [{ title: form.title.slice(0, 256), description: form.description.slice(0, 4000),
      color: 0x8b5cf6 }],
    components: [{ type: 1, components: [{ type: 2, style: 1,
      label: "Apply Now", custom_id: `applications:apply:${form.id}` }] }],
    allowed_mentions: { parse: [] },
  };
  let messageId: string | null = null;
  if (form.panelChannelId === channelId && form.panelMessageId) {
    try {
      await $fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${form.panelMessageId}`, {
        method: "PATCH", headers, body: payload,
      });
      messageId = form.panelMessageId;
    } catch (error: any) {
      const code = error?.data?.code ?? error?.response?._data?.code;
      if (code !== 10008) throw error;
    }
  }
  if (!messageId) {
    const response = await $fetch<{ id: string }>(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST", headers, body: payload,
    });
    messageId = response.id;
  }
  await repos.applications.setPanel(guildId, form.id, channelId, messageId);
  return { ok: true, messageId };
});
