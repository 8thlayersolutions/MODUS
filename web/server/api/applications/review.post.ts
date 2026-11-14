import { applicationRepos, applicationGuild, applicationId, requireApplicationReviewer,
  notifyApplicationDecision, publishApplicationLog } from "../../utils/applications";
export default defineEventHandler(async event => {
  const body = await readBody(event);
  const guildId = applicationGuild(body?.guild_id);
  const id = applicationId(body?.id, "submission ID");
  if (!["approved", "denied", "in_review"].includes(body?.status) ||
      (body.reason !== null && body.reason !== undefined &&
       (typeof body.reason !== "string" || body.reason.length > 1000))) {
    throw createError({ statusCode: 400, statusMessage: "Invalid review." });
  }
  const status = body.status as "approved" | "denied" | "in_review";
  const repos = applicationRepos();
  const target = await repos.applications.getSubmission(guildId, id);
  if (!target) throw createError({ statusCode: 404, statusMessage: "Submission not found." });
  const reviewer = await requireApplicationReviewer(event, guildId, target.formId);
  const reviewed = await repos.applications.review({
    guildId, id, actorId: reviewer.userId, status, reason: body.reason?.trim() || null,
  });
  if (!reviewed) throw createError({ statusCode: 409, statusMessage: "Submission already decided or missing." });
  let roleAssigned: boolean | null = null;
  const token = useRuntimeConfig().discordBotToken as string;
  if (status === "approved" && reviewed.form.approvalRoleId) {
    roleAssigned = false;
    if (token) {
      try {
        await $fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${reviewed.submission.applicantId}/roles/${reviewed.form.approvalRoleId}`, {
          method: "PUT", headers: { Authorization: `Bot ${token}`, "X-Audit-Log-Reason": "MODUS application approved" },
        });
        roleAssigned = true;
      } catch (error) {
        console.error("[Applications] Approved, but role assignment failed", error);
      }
    }
  }
  const notified = await notifyApplicationDecision(guildId, reviewed.submission.applicantId,
    reviewed.form.title, status, body.reason?.trim() || null);
  await publishApplicationLog(guildId, reviewed.form.submissionLogChannelId,
    `**${reviewed.form.title.replace(/[@`]/g, "").slice(0, 100)}** · \`${id}\` · **${status}** by ${reviewer.userId}`);
  return { submission: reviewed.submission, roleAssigned, notified };
});
