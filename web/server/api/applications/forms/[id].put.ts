import { requireGuildManager } from "../../../utils/session";
import { applicationRepos, applicationGuild, applicationId, applicationFormInput, validateApplicationRoutingTargets } from "../../../utils/applications";
export default defineEventHandler(async event => {
  const body = await readBody(event);
  const guildId = applicationGuild(body?.guild_id);
  const id = applicationId(getRouterParam(event, "id"));
  await requireGuildManager(event, guildId);
  const parsed = applicationFormInput(body);
  await validateApplicationRoutingTargets(guildId, parsed);
  const form = await applicationRepos().applications.updateForm(
    guildId, id, parsed);
  if (!form) throw createError({ statusCode: 404, statusMessage: "Form not found." });
  return { form };
});
