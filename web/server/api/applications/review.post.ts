import { requireModuleAccess } from "../../utils/session";
import { applicationRepos, applicationGuild, applicationId, notifyApplicationDecision } from "../../utils/applications";
export default defineEventHandler(async event => {
  const body = await readBody(event);
  const guildId = applicationGuild(body?.guild_id);
  const id = applicationId(body?.id, "submission ID");
  await requireModuleAccess(event, guildId, "applications");
  if (!["approved", "denied", "in_review"].includes(body?.status) ||
      (body.reason !== null && body.reason !== undefined &&
       (typeof body.reason !== "string" || body.reason.length > 1000))) {
    throw createError({ statusCode: 400, statusMessage: "Invalid review." });
  }
  const status = body.status as "approved" | "denied" | "in_review";
  const reviewer = await requireModuleAccess(event, guildId, "applications");
  const reviewed = await applicationRepos().applications.review({
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
  return { submission: reviewed.submission, roleAssigned, notified };
});
