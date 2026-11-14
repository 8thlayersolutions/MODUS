import { requireGuildManager } from "../../utils/session";
import { applicationRepos, applicationGuild, applicationReviewerIdentity } from "../../utils/applications";
import { mayReviewApplication } from "@modus/db";
export default defineEventHandler(async event => {
  const guildId = applicationGuild(getQuery(event).guild_id);
  const access = await applicationReviewerIdentity(event, guildId);
  const forms = await applicationRepos().applications.listForms(guildId);
  return { canManage: access.isGuildManager, forms: access.isGuildManager
    ? forms : forms.filter(form => mayReviewApplication(form, access)) };
});
