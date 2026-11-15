import { tiktokStatistics } from '../../utils/statistic-tiktok';

export default defineEventHandler(async event => {
  const secret = useRuntimeConfig().botApiSecret as string;
  if (!secret || getHeader(event, 'authorization') !== 'Bearer ' + secret) throw createError({ statusCode: 403 });
  const body = await readBody<{ guildId?: string }>(event);
  const guildId = body?.guildId || '';
  if (!/^\d{15,22}$/.test(guildId)) throw createError({ statusCode: 400 });
  setHeader(event, 'Cache-Control', 'no-store');
  try { return await tiktokStatistics(guildId); }
  catch { throw createError({ statusCode: 503, statusMessage: 'TikTok statistics unavailable; check account authorization' }); }
});
