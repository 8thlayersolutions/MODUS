import { requireGuildManager } from "../../utils/session";
import { applicationRepos, applicationGuild, applicationFormInput, validateApplicationRoutingTargets } from "../../utils/applications";
export default defineEventHandler(async event => {
  const input = await readBody(event);
  const guildId = applicationGuild(input?.guild_id);
  await requireGuildManager(event, guildId);
  const parsed = applicationFormInput(input);
  await validateApplicationRoutingTargets(guildId, parsed);
  const form = await applicationRepos().applications.createForm({
    guildId, ...parsed,
  });
  return { form };
});
