import { randomBytes } from 'node:crypto';
import { requireModuleAccess } from '../../../utils/session';
import { tiktokConfig } from '../../../utils/statistic-tiktok';

export default defineEventHandler(async event => {
  const guildId = String(getQuery(event).guild_id || '');
  if (!/^\d{15,22}$/.test(guildId)) throw createError({ statusCode: 400 });
  await requireModuleAccess(event, guildId, 'statistic-channels');
  let cfg;
  try { cfg = tiktokConfig(); } catch { throw createError({ statusCode: 503, statusMessage: 'TikTok OAuth is not configured' }); }
  const nonce = randomBytes(24).toString('hex');
  setCookie(event, 'statistics_tiktok_oauth', `${guildId}:${nonce}`, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/api/statistic-channels/tiktok' });
  const params = new URLSearchParams({ client_key: cfg.clientKey, response_type: 'code', scope: 'user.info.basic,user.info.stats', redirect_uri: cfg.redirectUri, state: nonce });
  return sendRedirect(event, 'https://www.tiktok.com/v2/auth/authorize/?' + params);
});
