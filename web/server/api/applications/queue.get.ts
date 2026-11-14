import { mayReviewApplication } from "@modus/db";
import { applicationRepos, applicationGuild, applicationId, applicationReviewerIdentity } from "../../utils/applications";
export default defineEventHandler(async event => {
  const guildId = applicationGuild(getQuery(event).guild_id);
  const status = getQuery(event).status;
  if (status !== undefined && !["pending", "in_review", "approved", "denied"].includes(String(status))) {
    throw createError({ statusCode: 400, statusMessage: "Invalid status filter." });
  }
  const access = await applicationReviewerIdentity(event, guildId);
  const queryFormId = getQuery(event).form_id;
  const selectedFormId = queryFormId === undefined ? null : applicationId(queryFormId, "form ID");
  const repos = applicationRepos();
  const forms = await repos.applications.listForms(guildId);
  const allowedIds = access.isGuildManager ? undefined
    : forms.filter(form => mayReviewApplication(form, access)).map(form => form.id);
  // Rows are filtered at SQL level; no other-form answers are ever returned.
  if (selectedFormId && allowedIds && !allowedIds.includes(selectedFormId)) {
    throw createError({ statusCode: 403, statusMessage: "Not assigned to this application." });
  }
  const filterIds = selectedFormId ? [selectedFormId] : allowedIds;
  const submissions = await repos.applications.listSubmissions(guildId, status as any, filterIds);
  return { submissions };
});
