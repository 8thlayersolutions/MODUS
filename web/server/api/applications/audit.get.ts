import { applicationRepos, applicationGuild, applicationId, requireApplicationReviewer } from "../../utils/applications";
export default defineEventHandler(async event => {
  const guildId = applicationGuild(getQuery(event).guild_id);
  const submissionId = applicationId(getQuery(event).submission_id, "submission ID");
  const repos = applicationRepos();
  const submission = await repos.applications.getSubmission(guildId, submissionId);
  if (!submission) throw createError({ statusCode: 404, statusMessage: "Submission not found." });
  await requireApplicationReviewer(event, guildId, submission.formId);
  return { audit: await repos.applications.listAudit(guildId, submissionId) };
});
