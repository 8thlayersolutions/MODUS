import { mayReviewApplication } from "@modus/db";
import { applicationRepos, applicationGuild, applicationReviewerIdentity } from "../../utils/applications";
export default defineEventHandler(async event => {
  const guildId = applicationGuild(getQuery(event).guild_id);
  const status = getQuery(event).status;
  if (status !== undefined && !["pending", "in_review", "approved", "denied"].includes(String(status))) {
    throw createError({ statusCode: 400, statusMessage: "Invalid status filter." });
  }
  const access = await applicationReviewerIdentity(event, guildId);
  const repos = applicationRepos();
  const forms = await repos.applications.listForms(guildId);
  const allowedIds = access.isGuildManager ? undefined
    : forms.filter(form => mayReviewApplication(form, access)).map(form => form.id);
  // Rows are filtered at SQL level; no other-form answers are ever returned.
  const submissions = await repos.applications.listSubmissions(guildId, status as any, allowedIds);
  return { submissions };
});
