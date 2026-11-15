import { requireModuleAccess } from '../../../utils/session';
import { unlinkTikTok } from '../../../utils/statistic-tiktok';

export default defineEventHandler(async event => {
  const body = await readBody<{ guildId?: string }>(event);
  const guildId = body?.guildId || '';
  if (!/^\d{15,22}$/.test(guildId)) throw createError({ statusCode: 400 });
  await requireModuleAccess(event, guildId, 'statistic-channels');
  await unlinkTikTok(guildId);
  return { ok: true };
});
