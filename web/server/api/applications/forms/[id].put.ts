import { requireModuleAccess } from "../../../utils/session";
import { applicationRepos, applicationGuild, applicationId, applicationFormInput } from "../../../utils/applications";
export default defineEventHandler(async event => {
  const body = await readBody(event);
  const guildId = applicationGuild(body?.guild_id);
  const id = applicationId(getRouterParam(event, "id"));
  await requireModuleAccess(event, guildId, "applications");
  const form = await applicationRepos().applications.updateForm(
    guildId, id, applicationFormInput(body));
  if (!form) throw createError({ statusCode: 404, statusMessage: "Form not found." });
  return { form };
});
