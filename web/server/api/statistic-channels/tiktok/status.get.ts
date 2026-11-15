import { requireModuleAccess } from '../../../utils/session';
import { tiktokStatus } from '../../../utils/statistic-tiktok';

export default defineEventHandler(async event => {
  const guildId = String(getQuery(event).guild_id || '');
  if (!/^\d{15,22}$/.test(guildId)) throw createError({ statusCode: 400 });
  await requireModuleAccess(event, guildId, 'statistic-channels');
  setHeader(event, 'Cache-Control', 'no-store');
  return await tiktokStatus(guildId);
});
