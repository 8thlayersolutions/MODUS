import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { StatisticConnectionRepository } from '@modus/db';
import { getRepos } from './db';

const provider = 'tiktok';
const endpoint = 'https://open.tiktokapis.com/v2/oauth/token/';
interface RawTokens { access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number; open_id: string; scope: string }
interface Tokens { access: string; refresh: string; expires: number; refreshExpires: number; id: string }
export function tiktokConfig() {
  const cfg = useRuntimeConfig();
  const key = cfg.statisticEncryptionKey as string;
  const clientKey = cfg.tiktokClientKey as string;
  const clientSecret = cfg.tiktokClientSecret as string;
  const baseUrl = (cfg.public.baseUrl as string).replace(/\/$/, '');
  if (!/^[0-9a-f]{64}$/i.test(key) || !clientKey || !clientSecret || !baseUrl.startsWith('https://')) throw new Error('TikTok OAuth is not configured');
  return { key: Buffer.from(key, 'hex'), clientKey, clientSecret, redirectUri: baseUrl + '/api/statistic-channels/tiktok/callback' };
}
function encrypt(tokens: Tokens, guildId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tiktokConfig().key, iv);
  cipher.setAAD(Buffer.from(`${provider}:${guildId}`));
  const bytes = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64');
}
function decrypt(encrypted: string, guildId: string): Tokens {
  const bytes = Buffer.from(encrypted, 'base64');
  const cipher = createDecipheriv('aes-256-gcm', tiktokConfig().key, bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(`${provider}:${guildId}`));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
}
async function exchange(params: Record<string, string>): Promise<Tokens> {
  const { clientKey, clientSecret } = tiktokConfig();
  const tokens = await $fetch<RawTokens>(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, ...params }), timeout: 10000, retry: 0 });
  if (!tokens.access_token || !tokens.refresh_token || !tokens.open_id || !Number.isFinite(tokens.expires_in) || !Number.isFinite(tokens.refresh_expires_in) || !tokens.scope?.split(',').includes('user.info.stats')) throw new Error('TikTok did not grant statistics access');
  return { access: tokens.access_token, refresh: tokens.refresh_token, id: tokens.open_id, expires: Date.now() + tokens.expires_in * 1000, refreshExpires: Date.now() + tokens.refresh_expires_in * 1000 };
}
async function profile(access: string) {
  const body = await $fetch<{ data?: { user?: { open_id: string; display_name?: string; follower_count?: number; following_count?: number; likes_count?: number; video_count?: number } }; error?: { code: string } }>('https://open.tiktokapis.com/v2/user/info/', {
    query: { fields: 'open_id,display_name,follower_count,following_count,likes_count,video_count' }, headers: { Authorization: 'Bearer ' + access }, timeout: 10000, retry: 0,
  });
  if (body.error?.code !== 'ok' || !body.data?.user?.open_id) throw new Error('TikTok statistics unavailable');
  return body.data.user;
}
function database() {
  const repos = getRepos();
  if (!repos) throw new Error('Database unavailable');
  return repos.db;
}
export async function linkTikTok(guildId: string, code: string) {
  const tokens = await exchange({ grant_type: 'authorization_code', code, redirect_uri: tiktokConfig().redirectUri });
  const user = await profile(tokens.access);
  if (user.open_id !== tokens.id) throw new Error('TikTok identity mismatch');
  await StatisticConnectionRepository.locked(database(), guildId, provider, repo => repo.save({ guildId, provider, accountId: tokens.id,
    accountName: user.display_name || 'TikTok account', encryptedToken: encrypt(tokens, guildId), expiresAt: new Date(tokens.expires) }));
}
export async function tiktokStatus(guildId: string) {
  try { tiktokConfig(); } catch { return { configured: false, connected: false, name: null }; }
  const row = await new StatisticConnectionRepository(database()).get(guildId, provider);
  return { configured: true, connected: !!row, name: row?.accountName || null };
}
export async function unlinkTikTok(guildId: string) {
  await StatisticConnectionRepository.locked(database(), guildId, provider, async repo => {
    const row = await repo.get(guildId, provider);
    if (!row) return;
    // Remove the link even if the provider already revoked it.
    try {
      const tokens = decrypt(row.encryptedToken, guildId);
      const cfg = tiktokConfig();
      await $fetch('https://open.tiktokapis.com/v2/oauth/revoke/', { method: 'POST', body: new URLSearchParams({ client_key: cfg.clientKey, client_secret: cfg.clientSecret, token: tokens.access }), timeout: 10000, retry: 0 });
    } catch { /* A disconnected account will never be used again. */ }
    await repo.remove(guildId, provider);
  });
}
export async function tiktokStatistics(guildId: string) {
  // A rotating refresh token must be stored before releasing the distributed lock.
  const tokens = await StatisticConnectionRepository.locked(database(), guildId, provider, async repo => {
    const row = await repo.get(guildId, provider);
    if (!row) throw new Error('TikTok account not connected');
    let tokens = decrypt(row.encryptedToken, guildId);
    if (tokens.expires < Date.now() + 120_000) {
      if (tokens.refreshExpires < Date.now()) throw new Error('TikTok authorization expired');
      const next = await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh });
      if (next.id !== tokens.id) throw new Error('TikTok identity mismatch');
      tokens = next;
      await repo.save({ guildId, provider, accountId: tokens.id, accountName: row.accountName, encryptedToken: encrypt(tokens, guildId), expiresAt: new Date(tokens.expires) });
    }
    return tokens;
  });
  const user = await profile(tokens.access);
  if (user.open_id !== tokens.id) throw new Error('TikTok identity mismatch');
  return { follower_count: user.follower_count, following_count: user.following_count, likes_count: user.likes_count, video_count: user.video_count };
}
