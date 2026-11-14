import { requireModuleAccess } from "../../utils/session";
import { applicationRepos, applicationGuild, applicationId } from "../../utils/applications";
export default defineEventHandler(async event => {
  const guildId = applicationGuild(getQuery(event).guild_id);
  const submissionId = applicationId(getQuery(event).submission_id, "submission ID");
  await requireModuleAccess(event, guildId, "applications");
  const repos = applicationRepos();
  return { audit: await repos.applications.listAudit(guildId, submissionId) };
});
