import { requireGuildManager } from "../../utils/session";
import { applicationRepos, applicationGuild, applicationFormInput } from "../../utils/applications";
export default defineEventHandler(async event => {
  const input = await readBody(event);
  const guildId = applicationGuild(input?.guild_id);
  await requireGuildManager(event, guildId);
  const form = await applicationRepos().applications.createForm({
    guildId, ...applicationFormInput(input),
  });
  return { form };
});
