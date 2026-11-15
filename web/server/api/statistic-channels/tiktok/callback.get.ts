import { requireModuleAccess } from '../../../utils/session';
import { linkTikTok } from '../../../utils/statistic-tiktok';

export default defineEventHandler(async event => {
  const [guildId, nonce] = (getCookie(event, 'statistics_tiktok_oauth') || '').split(':');
  deleteCookie(event, 'statistics_tiktok_oauth', { path: '/api/statistic-channels/tiktok' });
  const query = getQuery(event);
  if (!guildId || !/^\d{15,22}$/.test(guildId) || !nonce || query.state !== nonce) throw createError({ statusCode: 403, statusMessage: 'Invalid or expired TikTok authorization' });
  await requireModuleAccess(event, guildId, 'statistic-channels');
  const path = `/dashboard/server/${guildId}/modules/statistic-channels`;
  if (query.error || typeof query.code !== 'string') return sendRedirect(event, path + '?tiktok=denied');
  try { await linkTikTok(guildId, query.code); return sendRedirect(event, path + '?tiktok=success'); }
  catch { return sendRedirect(event, path + '?tiktok=error'); }
});
