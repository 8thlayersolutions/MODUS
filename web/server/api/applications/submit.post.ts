import { applicationRepos, applicationGuild, applicationId, requireApplicationMember, applicationInputError } from "../../utils/applications";
export default defineEventHandler(async event => {
  const body = await readBody(event);
  const guildId = applicationGuild(body?.guild_id);
  const formId = applicationId(body?.form_id, "form ID");
  const identity = await requireApplicationMember(event, guildId);
  const repos = applicationRepos();
  if (!await repos.guildConfigs.isModuleEnabled(guildId, "applications")) {
    throw createError({ statusCode: 403, statusMessage: "Applications are disabled on this server." });
  }
  try {
    const submission = await repos.applications.submit({
      guildId, formId, applicantId: identity.userId, answers: body.answers, source: "web",
    });
    // Notify staff without exposing answers in a public Discord channel.
    const settings = await repos.guildConfigs.getModuleSettings(guildId, "applications");
    const reviewChannelId = typeof settings?.reviewChannelId === "string" ? settings.reviewChannelId : "";
    const botToken = useRuntimeConfig().discordBotToken as string;
    if (reviewChannelId && /^\d{16,22}$/.test(reviewChannelId) && botToken) {
      try {
        const channel = await $fetch<{ guild_id?: string }>(
          `https://discord.com/api/v10/channels/${reviewChannelId}`,
          { headers: { Authorization: `Bot ${botToken}` } },
        );
        if (channel.guild_id === guildId) {
          await $fetch(`https://discord.com/api/v10/channels/${reviewChannelId}/messages`, {
            method: "POST", headers: { Authorization: `Bot ${botToken}` },
            body: { content: `New application from Discord user ${identity.userId}. Submission ID: ${submission.id}`,
              allowed_mentions: { parse: [] } },
          });
        }
      } catch (error) {
        console.warn("[Applications] Unable to notify review channel", error);
      }
    }
    return { submission: { id: submission.id, status: submission.status } };
  } catch (error) { throw applicationInputError(error); }
});
