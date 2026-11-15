/** Internal counter data, using the guild's existing encrypted Twitch broadcaster link. */
import { activeTwitchToken, requireTwitchConfig } from '../../utils/twitch-sync';

export default defineEventHandler(async event => {
  const secret = useRuntimeConfig().botApiSecret as string;
  if (!secret || getHeader(event, 'authorization') !== 'Bearer ' + secret) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
  }
  const body = await readBody<{ guildId?: string; login?: string; metrics?: string[] }>(event);
  const { guildId, login = '', metrics } = body ?? {};
  const allowed = ['twitch_followers', 'twitch_subscribers', 'twitch_sub_points'];
  if (!guildId || !/^\d{15,22}$/.test(guildId) || !/^[a-zA-Z0-9_]{0,25}$/.test(login) ||
    !Array.isArray(metrics) || !metrics.length || metrics.length > 40 || metrics.some(metric => !allowed.includes(metric))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid statistics request' });
  }
  let broadcaster;
  try { broadcaster = await activeTwitchToken(guildId); }
  catch { throw createError({ statusCode: 503, statusMessage: 'Twitch authorization unavailable' }); }
  if (!broadcaster) throw createError({ statusCode: 409, statusMessage: 'Connect the Twitch broadcaster under Twitch Role Sync' });
  const headers = { Authorization: 'Bearer ' + broadcaster.accessToken, 'Client-Id': requireTwitchConfig().clientId };
  const output: Record<string, number> = {};
  // Twitch returns aggregate follower totals without requiring moderator access
  // to the target channel. Never return follower identities or credentials.
  if (metrics.includes('twitch_followers') && login) {
    try {
      const id = broadcaster.twitchLogin.toLowerCase() === login.toLowerCase() ? broadcaster.twitchId :
        (await $fetch<{ data: { id: string }[] }>('https://api.twitch.tv/helix/users', { headers, query: { login }, timeout: 10000, retry: 0 })).data[0]?.id;
      if (!id) throw new Error('Channel unavailable');
      const followers = await $fetch<{ total: number }>('https://api.twitch.tv/helix/channels/followers', {
        headers, query: { broadcaster_id: id, first: 1 }, timeout: 10000, retry: 0,
      });
      output.twitch_followers = followers.total;
    } catch { /* Leave unavailable metrics absent. */ }
  }
  if (!login && (metrics.includes('twitch_subscribers') || metrics.includes('twitch_sub_points'))) {
    try {
      const subs = await $fetch<{ total: number; points: number }>('https://api.twitch.tv/helix/subscriptions', {
        headers, query: { broadcaster_id: broadcaster.twitchId, first: 1 }, timeout: 10000, retry: 0,
      });
      output.twitch_subscribers = subs.total;
      output.twitch_sub_points = subs.points;
    } catch { /* An unauthorized count is not zero. */ }
  }
  setHeader(event, 'Cache-Control', 'no-store');
  return output;
});
