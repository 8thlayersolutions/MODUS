import { applicationRepos, applicationGuild, requireApplicationMember } from "../../utils/applications";
export default defineEventHandler(async event => {
  const guildId = applicationGuild(getQuery(event).guild_id);
  const identity = await requireApplicationMember(event, guildId);
  const rows = await applicationRepos().applications.listMine(guildId, identity.userId);
  return { submissions: rows.map(row => ({ id: row.id, formId: row.formId,
    status: row.status, createdAt: row.createdAt, reason: row.reason })) };
});
