import { applicationRepos, applicationGuild, applicationId, requireApplicationMember } from "../../utils/applications";
export default defineEventHandler(async event => {
  const guildId = applicationGuild(getQuery(event).guild_id);
  const formId = applicationId(getQuery(event).form_id, "form ID");
  await requireApplicationMember(event, guildId);
  if (!await applicationRepos().guildConfigs.isModuleEnabled(guildId, "applications")) {
    throw createError({ statusCode: 403, statusMessage: "Applications are disabled on this server." });
  }
  const form = await applicationRepos().applications.getForm(guildId, formId);
  if (!form || !form.open) throw createError({ statusCode: 404, statusMessage: "Application form not available." });
  return { form: { id: form.id, guildId: form.guildId, title: form.title,
    description: form.description, questions: form.questions, open: form.open } };
});
