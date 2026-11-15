/** Create a dedicated read-only voice counter; existing voice rooms are never modified here. */
import { requireModuleAccess } from '../../utils/session';

interface Overwrite { id: string; type: number; allow: string; deny: string }
const snowflake = /^\d{15,22}$/;
const CONNECT = BigInt(1048576);

export default defineEventHandler(async event => {
  const body = await readBody<{ guildId?: string; parentId?: string; name?: string }>(event);
  const { guildId, parentId, name } = body || {};
  if (!guildId || !snowflake.test(guildId) || (parentId && !snowflake.test(parentId)) || typeof name !== 'string' || !name.trim() || name.length > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid channel name, guild or category.' });
  }
  await requireModuleAccess(event, guildId, 'statistic-channels');
  const token = useRuntimeConfig().discordBotToken as string;
  if (!token) throw createError({ statusCode: 503, statusMessage: 'Discord unavailable' });
  const headers = { Authorization: 'Bot ' + token };
  let overwrites: Overwrite[] = [];
  if (parentId) {
    const parent = await $fetch<{ guild_id: string; type: number; permission_overwrites?: Overwrite[] }>('https://discord.com/api/v10/channels/' + parentId, { headers });
    if (parent.guild_id !== guildId || parent.type !== 4) throw createError({ statusCode: 400, statusMessage: 'Select a category in this server.' });
    overwrites = (parent.permission_overwrites ?? []).map(ow => ({ ...ow }));
  }
  // Inherit category visibility; only remove Connect grants on the new channel.
  for (const ow of overwrites) ow.allow = String(BigInt(ow.allow) & ~CONNECT);
  let everyone = overwrites.find(ow => ow.id === guildId && ow.type === 0);
  if (!everyone) { everyone = { id: guildId, type: 0, allow: '0', deny: '0' }; overwrites.push(everyone); }
  everyone.deny = String(BigInt(everyone.deny) | CONNECT);
  return await $fetch<{ id: string; name: string; type: number; parent_id?: string }>('https://discord.com/api/v10/guilds/' + guildId + '/channels', {
    method: 'POST', headers, body: { name: name.trim(), type: 2, ...(parentId ? { parent_id: parentId } : {}), permission_overwrites: overwrites },
    retry: 0,
  });
});
