import { applicationRepos, applicationGuild, applicationId, requireApplicationMember, applicationInputError, publishApplicationLog } from "../../utils/applications";
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
    const form = await repos.applications.getForm(guildId, formId);
    // Never post private answers to a Discord log channel.
    if (form) await publishApplicationLog(guildId, form.submissionLogChannelId,
      `New **${form.title.replace(/[@\`]/g, "").slice(0, 100)}** application from Discord user ${identity.userId}. Submission ID: \`${submission.id}\``);
    return { submission: { id: submission.id, status: submission.status } };
  } catch (error) { throw applicationInputError(error); }
});
