import { ChannelType, GatewayIntentBits, type Guild, type GuildMember } from 'discord.js';
import type { StatisticCounter } from '@modus/db';

type Value = number | string;
type Json = Record<string, any>;
async function json(url: string, init?: RequestInit, timeout = 12_000): Promise<Json> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  // Never log response bodies, credentials, or URLs containing API keys.
  if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
  return await response.json() as Json;
}
function number(value: unknown): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) throw new Error('Metric unavailable');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('Metric unavailable');
  return n;
}

let appToken: { token: string; until: number } | undefined;
async function twitchAppToken(): Promise<string> {
  if (appToken && appToken.until > Date.now()) return appToken.token;
  const clientId = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error('Twitch app credentials required');
  const token = await json('https://id.twitch.tv/oauth2/token', {
    method: 'POST', body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'client_credentials' }),
  });
  if (typeof token.access_token !== 'string') throw new Error('Twitch token unavailable');
  appToken = { token: token.access_token, until: Date.now() + Math.max(0, number(token.expires_in) - 60) * 1000 };
  return appToken.token;
}

/** One per guild refresh. All duplicate provider requests share the same promise. */
export class StatisticSources {
  private cache = new Map<string, Promise<any>>();
  constructor(private guild: Guild, private counters: StatisticCounter[]) {}
  private once<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!this.cache.has(key)) this.cache.set(key, Promise.resolve().then(load));
    return this.cache.get(key)!;
  }
  private presenceEnabled(): boolean {
    return this.guild.client.options.intents.has(GatewayIntentBits.GuildPresences);
  }
  private members() {
    return this.once('members', () => this.guild.members.fetch({ withPresences: this.presenceEnabled(), time: 60_000 }));
  }
  private status(member: GuildMember) { return member.presence?.status ?? 'offline'; }
  private countMembers(filter: (member: GuildMember) => boolean) {
    return this.members().then(members => members.filter(filter).size);
  }
  private counts() {
    return this.once('counts', () => this.guild.client.guilds.fetch({ guild: this.guild.id, withCounts: true, force: true, cache: false }));
  }
  private async online(): Promise<number> {
    if (this.presenceEnabled()) return this.countMembers(m => this.status(m) !== 'offline');
    return number((await this.counts()).approximatePresenceCount);
  }
  private requirePresence() {
    if (!this.presenceEnabled()) throw new Error('Enable Guild Presences to use this statistic');
  }
  private twitchStream(login: string) {
    return this.once('twitch-stream:' + login.toLowerCase(), async () => {
      const token = await twitchAppToken();
      const headers = { Authorization: 'Bearer ' + token, 'Client-Id': process.env.TWITCH_CLIENT_ID! };
      const query = new URLSearchParams({ login });
      const user = (await json('https://api.twitch.tv/helix/users?' + query, { headers })).data?.[0];
      if (!user?.id) throw new Error('Twitch channel not found');
      return (await json('https://api.twitch.tv/helix/streams?' + new URLSearchParams({ user_id: user.id }), { headers })).data?.[0] ?? null;
    });
  }
  private twitchAuthorized(login: string) {
    return this.once('twitch-authorized:' + login.toLowerCase(), async () => {
      const base = process.env.PUBLIC_WEB_URL?.replace(/\/$/, '');
      const secret = process.env.BOT_API_SECRET;
      if (!base || !secret) throw new Error('Twitch Role Sync dashboard connection required');
      const metrics = this.counters.filter(counter => counter.source.toLowerCase() === login.toLowerCase())
        .map(counter => counter.metric).filter(metric => ['twitch_followers', 'twitch_subscribers', 'twitch_sub_points'].includes(metric));
      return json(base + '/api/statistic-channels/twitch', { method: 'POST', headers: {
        Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json',
      }, body: JSON.stringify({ guildId: this.guild.id, login, metrics }) }, 35_000);
    });
  }
  private youtube(source: string) {
    return this.once('youtube:' + source, async () => {
      const key = process.env.YOUTUBE_API_KEY;
      if (!key) throw new Error('YouTube API key required');
      const params = new URLSearchParams({ part: 'statistics', key, ...(source.startsWith('@') ? { forHandle: source } : { id: source }) });
      const result = await json('https://www.googleapis.com/youtube/v3/channels?' + params);
      if (!result.items?.[0]?.statistics) throw new Error('YouTube channel not found');
      return result.items[0].statistics;
    });
  }
  private tiktok() {
    return this.once('tiktok', async () => {
      const base = process.env.PUBLIC_WEB_URL?.replace(/\/$/, '');
      const secret = process.env.BOT_API_SECRET;
      if (!base || !secret) throw new Error('TikTok dashboard connection required');
      return json(base + '/api/statistic-channels/tiktok', { method: 'POST', headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ guildId: this.guild.id }) }, 35_000);
    });
  }
  private github(source: string) {
    return this.once('github:' + source.toLowerCase(), () => {
      // Public repositories only; no privileged token can leak private repo counts.
      const path = source.split('/').map(encodeURIComponent).join('/');
      return json('https://api.github.com/repos/' + path, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MODUS-statistics' } });
    });
  }
  private minecraft(edition: 'java' | 'bedrock', source: string) {
    return this.once('minecraft:' + edition + ':' + source, () => json(`https://api.mcstatus.io/v2/status/${edition}/${encodeURIComponent(source)}`));
  }
  private modrinth(source: string) {
    return this.once('modrinth:' + source, () => json('https://api.modrinth.com/v2/project/' + encodeURIComponent(source), { headers: { 'User-Agent': '8thlayersolutions/MODUS (https://github.com/8thlayersolutions/MODUS)' } }));
  }
  async value(counter: StatisticCounter): Promise<Value> {
    const g = this.guild;
    const source = counter.source;
    const channelCount = (...types: ChannelType[]) => g.channels.cache.filter(c => types.includes(c.type)).size;
    switch (counter.metric) {
      case 'members': return g.memberCount;
      case 'humans': return this.countMembers(m => !m.user.bot);
      case 'bots': return this.countMembers(m => m.user.bot);
      case 'online': return this.online();
      case 'offline': return Math.max(0, g.memberCount - await this.online());
      case 'active': case 'idle': case 'dnd': {
        this.requirePresence(); const status = counter.metric === 'active' ? 'online' : counter.metric;
        return this.countMembers(m => this.status(m) === status);
      }
      case 'role_members': case 'role_online': {
        if (!g.roles.cache.has(source)) throw new Error('Role no longer exists');
        if (counter.metric === 'role_online') this.requirePresence();
        return this.countMembers(m => m.roles.cache.has(source) && (counter.metric === 'role_members' || this.status(m) !== 'offline'));
      }
      case 'boosts': return g.premiumSubscriptionCount ?? 0;
      case 'boosters': return this.countMembers(m => !!m.premiumSince);
      case 'boost_level': return g.premiumTier;
      case 'roles': return Math.max(0, g.roles.cache.size - 1);
      case 'channels': return g.channels.cache.size;
      case 'text_channels': return channelCount(ChannelType.GuildText, ChannelType.GuildAnnouncement);
      case 'voice_channels': return channelCount(ChannelType.GuildVoice);
      case 'categories': return channelCount(ChannelType.GuildCategory);
      case 'forum_channels': return channelCount(ChannelType.GuildForum, ChannelType.GuildMedia);
      case 'stage_channels': return channelCount(ChannelType.GuildStageVoice);
      case 'voice_members': return g.voiceStates.cache.filter(s => !!s.channelId).size;
      case 'voice_channel_members': {
        if (g.channels.cache.get(source)?.type !== ChannelType.GuildVoice) throw new Error('Voice channel no longer exists');
        return g.voiceStates.cache.filter(s => s.channelId === source).size;
      }
      case 'streaming': return g.voiceStates.cache.filter(s => !!s.channelId && s.streaming === true).size;
      case 'video': return g.voiceStates.cache.filter(s => !!s.channelId && s.selfVideo === true).size;
      case 'emojis': return g.emojis.cache.size;
      case 'stickers': return g.stickers.cache.size;
      case 'events': return (await this.once('events', () => g.scheduledEvents.fetch())).size;
      case 'server_age': return Math.max(0, Math.floor((Date.now() - g.createdTimestamp) / 86_400_000));
      case 'joined_today': case 'joined_week': {
        const now = new Date();
        const since = counter.metric === 'joined_today' ? now.setUTCHours(0, 0, 0, 0) : now.getTime() - 7 * 86_400_000;
        return this.countMembers(m => m.joinedTimestamp !== null && m.joinedTimestamp >= since);
      }
      case 'twitch_followers': case 'twitch_subscribers': case 'twitch_sub_points': return number((await this.twitchAuthorized(source))[counter.metric]);
      case 'twitch_viewers': { const stream = await this.twitchStream(source); return stream ? number(stream.viewer_count) : 0; }
      case 'twitch_status': return (await this.twitchStream(source)) ? 'LIVE' : 'Offline';
      case 'twitch_game': return (await this.twitchStream(source))?.game_name || 'Offline';
      case 'twitch_title': return (await this.twitchStream(source))?.title || 'Offline';
      case 'youtube_subscribers': { const stats = await this.youtube(source); if (stats.hiddenSubscriberCount) throw new Error('YouTube subscriber count is hidden'); return number(stats.subscriberCount); }
      case 'youtube_views': return number((await this.youtube(source)).viewCount);
      case 'youtube_videos': return number((await this.youtube(source)).videoCount);
      case 'tiktok_followers': return number((await this.tiktok()).follower_count);
      case 'tiktok_following': return number((await this.tiktok()).following_count);
      case 'tiktok_likes': return number((await this.tiktok()).likes_count);
      case 'tiktok_videos': return number((await this.tiktok()).video_count);
      case 'github_stars': return number((await this.github(source)).stargazers_count);
      case 'github_forks': return number((await this.github(source)).forks_count);
      case 'github_watchers': return number((await this.github(source)).subscribers_count);
      case 'github_issues': return number((await this.github(source)).open_issues_count);
      case 'minecraft_java_status': case 'minecraft_bedrock_status': case 'minecraft_java_players': case 'minecraft_bedrock_players':
      case 'minecraft_java_capacity': case 'minecraft_bedrock_capacity': case 'minecraft_java_ratio': case 'minecraft_bedrock_ratio': {
        const response = await this.minecraft(counter.metric.includes('_java_') ? 'java' : 'bedrock', source);
        if (typeof response.online !== 'boolean') throw new Error('Metric unavailable');
        if (counter.metric.endsWith('_status')) return response.online ? 'Online' : 'Offline';
        if (!response.online) throw new Error('Metric unavailable');
        if (counter.metric.endsWith('_capacity')) return number(response.players?.max);
        if (counter.metric.endsWith('_ratio')) return `${number(response.players?.online)}/${number(response.players?.max)}`;
        return number(response.players?.online);
      }
      case 'modrinth_downloads': return number((await this.modrinth(source)).downloads);
      case 'modrinth_followers': return number((await this.modrinth(source)).followers);
      case 'custom': return source;
    }
  }
}
