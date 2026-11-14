import { requireModuleAccess } from "../../utils/session";
import { applicationRepos, applicationGuild, applicationId } from "../../utils/applications";
export default defineEventHandler(async event => {
  const guildId = applicationGuild(getQuery(event).guild_id);
  await requireModuleAccess(event, guildId, "applications");
  const status = getQuery(event).status;
  if (status !== undefined && !["pending", "in_review", "approved", "denied"].includes(String(status))) {
    throw createError({ statusCode: 400, statusMessage: "Invalid status filter." });
  }
  const repos = applicationRepos();
  const submissions = await repos.applications.listSubmissions(guildId, status as any);
  return { submissions };
});
