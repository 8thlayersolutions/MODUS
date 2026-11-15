/** OAuth and secret handling for Twitch Role Sync. Tokens never reach the browser. */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getRepos } from "./db";

export interface OAuthTokens { accessToken: string; refreshToken: string; expiresAt: number; scopes: string[] }
interface RawToken { access_token: string; refresh_token: string; expires_in: number; scope?: string[] | string }
export interface DiscordTwitchConnection { id: string; name: string; verified?: boolean; type: string }
export interface TwitchSelf { id: string; login: string; display_name: string }

const config = () => useRuntimeConfig();
export function secretKey(): Buffer {
  const key = (config().twitchSyncEncryptionKey as string) || process.env.TWITCH_SYNC_ENCRYPTION_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(key)) throw new Error("Missing 32-byte hex TWITCH_SYNC_ENCRYPTION_KEY");
  return Buffer.from(key, "hex");
}
export function encryptTokens(tokens: OAuthTokens): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const payload = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), payload]).toString("base64");
}
export function decryptTokens(value: string): OAuthTokens {
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 30) throw new Error("Malformed encrypted credentials");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")) as OAuthTokens;
}
function toTokens(raw: RawToken, fallback?: OAuthTokens): OAuthTokens {
  if (!raw.access_token || !(raw.refresh_token || fallback?.refreshToken)) throw new Error("OAuth provider omitted credentials");
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token || fallback!.refreshToken,
    expiresAt: Date.now() + raw.expires_in * 1000,
    scopes: Array.isArray(raw.scope) ? raw.scope : typeof raw.scope === "string" ? raw.scope.split(" ") : (fallback?.scopes || []),
  };
}
export function requireTwitchConfig(): { clientId: string; clientSecret: string; baseUrl: string } {
  const cfg = config();
  const clientId = cfg.twitchClientId as string;
  const clientSecret = cfg.twitchClientSecret as string;
  const baseUrl = cfg.public.baseUrl as string;
  if (!clientId || !clientSecret || !baseUrl) throw createError({ statusCode: 503, statusMessage: "Twitch OAuth not configured" });
  secretKey();
  return { clientId, clientSecret, baseUrl };
}
export async function exchangeTwitch(code: string): Promise<OAuthTokens> {
  const { clientId, clientSecret, baseUrl } = requireTwitchConfig();
  const body = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret, code,
    grant_type: "authorization_code",
    redirect_uri: baseUrl + "/api/twitch-sync/broadcaster/callback",
  });
  return toTokens(await $fetch<RawToken>("https://id.twitch.tv/oauth2/token", {
    method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }));
}
export async function refreshTwitch(tokens: OAuthTokens): Promise<OAuthTokens> {
  const { clientId, clientSecret } = requireTwitchConfig();
  const body = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret,
    refresh_token: tokens.refreshToken, grant_type: "refresh_token",
  });
  return toTokens(await $fetch<RawToken>("https://id.twitch.tv/oauth2/token", {
    method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }), tokens);
}
export async function twitchSelf(accessToken: string): Promise<TwitchSelf> {
  const { clientId } = requireTwitchConfig();
  const response = await $fetch<{ data: TwitchSelf[] }>("https://api.twitch.tv/helix/users", {
    headers: { "Client-Id": clientId, Authorization: "Bearer " + accessToken },
  });
  const self = response.data[0];
  if (!self?.id || !self?.login) throw new Error("Missing Twitch profile");
  return self;
}
export function requireDiscordConfig(): { clientId: string; clientSecret: string; baseUrl: string } {
  const cfg = config();
  const clientId = cfg.public.discordClientId as string;
  const clientSecret = cfg.discordClientSecret as string;
  const baseUrl = cfg.public.baseUrl as string;
  if (!clientId || !clientSecret || !baseUrl) throw createError({ statusCode: 503, statusMessage: "Discord OAuth not configured" });
  secretKey();
  return { clientId, clientSecret, baseUrl };
}
export async function exchangeDiscordMember(code: string): Promise<OAuthTokens> {
  const { clientId, clientSecret, baseUrl } = requireDiscordConfig();
  const body = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret, code,
    redirect_uri: baseUrl + "/api/twitch-sync/member/callback", grant_type: "authorization_code",
  });
  return toTokens(await $fetch<RawToken>("https://discord.com/api/v10/oauth2/token", {
    method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }));
}
export async function refreshDiscordMember(tokens: OAuthTokens): Promise<OAuthTokens> {
  const { clientId, clientSecret } = requireDiscordConfig();
  const body = new URLSearchParams({
    client_id: clientId, client_secret: clientSecret,
    refresh_token: tokens.refreshToken, grant_type: "refresh_token",
  });
  return toTokens(await $fetch<RawToken>("https://discord.com/api/v10/oauth2/token", {
    method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }), tokens);
}
export async function discordIdentity(token: string): Promise<{ id: string }> {
  return $fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: "Bearer " + token } });
}
export async function discordTwitchConnection(token: string): Promise<DiscordTwitchConnection | null> {
  const connections = await $fetch<DiscordTwitchConnection[]>("https://discord.com/api/v10/users/@me/connections", {
    headers: { Authorization: "Bearer " + token },
  });
  return connections.find(c => c.type === "twitch" && c.verified === true && !!c.id) || null;
}
export async function requireGuildMembership(guildId: string, userId: string): Promise<void> {
  const token = config().discordBotToken as string;
  if (!token) throw new Error("Discord bot credential unavailable");
  await $fetch("https://discord.com/api/v10/guilds/" + guildId + "/members/" + userId, {
    headers: { Authorization: "Bot " + token },
  });
}
export function twitchRepo() {
  const repos = getRepos();
  if (!repos) throw createError({ statusCode: 503, statusMessage: "Database unavailable" });
  return repos.twitchSync;
}

/** A valid token is required for each fresh role check; never treat API failures as lost roles. */
export async function activeTwitchToken(guildId: string): Promise<{ accessToken: string; twitchId: string; twitchLogin: string } | null> {
  const repo = twitchRepo();
  const row = await repo.getBroadcaster(guildId);
  if (!row) return null;
  let tokens = decryptTokens(row.encryptedToken);
  let refresh = tokens.expiresAt < Date.now() + 60_000;
  if (!refresh) {
    try {
      const checked = await $fetch<{ user_id: string; client_id: string; scopes: string[] }>("https://id.twitch.tv/oauth2/validate", {
        headers: { Authorization: "OAuth " + tokens.accessToken },
      });
      if (checked.user_id !== row.twitchId || checked.client_id !== requireTwitchConfig().clientId) {
        throw new Error("Twitch authorization is not for the configured broadcaster/application");
      }
    } catch (error: any) {
      // Invalid tokens can be refreshed. Network/5xx errors are not a lost grant.
      if (error?.status === 401 || error?.statusCode === 401) refresh = true;
      else throw error;
    }
  }
  if (refresh) {
    tokens = await refreshTwitch(tokens);
    await repo.setBroadcaster({
      guildId, twitchId: row.twitchId, twitchLogin: row.twitchLogin,
      encryptedToken: encryptTokens(tokens), expiresAt: new Date(tokens.expiresAt),
    });
  }
  return { accessToken: tokens.accessToken, twitchId: row.twitchId, twitchLogin: row.twitchLogin };
}
