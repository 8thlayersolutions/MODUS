import { requireModuleAccess } from "../../utils/session";
import { applicationRepos, applicationGuild } from "../../utils/applications";
export default defineEventHandler(async event => {
  const guildId = applicationGuild(getQuery(event).guild_id);
  await requireModuleAccess(event, guildId, "applications");
  return { forms: await applicationRepos().applications.listForms(guildId) };
});
