/** Shared catalog and validation for settings stored in the existing guild_configs JSONB. */
export const STATISTIC_METRICS = [
  ['members', 'Total members', 'Discord'], ['humans', 'Human members', 'Discord'],
  ['bots', 'Bots', 'Discord'], ['online', 'Online (including idle/DND)', 'Discord'],
  ['offline', 'Offline / invisible', 'Discord'], ['active', 'Online status only', 'Discord'],
  ['idle', 'Idle members', 'Discord'], ['dnd', 'Do not disturb members', 'Discord'],
  ['role_members', 'Members with a role', 'Discord', 'role'],
  ['role_online', 'Online members with a role', 'Discord', 'role'],
  ['boosts', 'Server boosts', 'Discord'], ['boosters', 'Boosting members', 'Discord'],
  ['boost_level', 'Boost level', 'Discord'], ['roles', 'Roles', 'Discord'],
  ['channels', 'All channels', 'Discord'], ['text_channels', 'Text channels', 'Discord'],
  ['voice_channels', 'Voice channels', 'Discord'], ['categories', 'Categories', 'Discord'],
  ['forum_channels', 'Forum / media channels', 'Discord'], ['stage_channels', 'Stage channels', 'Discord'],
  ['voice_members', 'Members in voice', 'Discord'], ['voice_channel_members', 'Members in a specific voice channel', 'Discord', 'voice'],
  ['streaming', 'Members sharing their screen', 'Discord'], ['video', 'Members with camera on', 'Discord'],
  ['emojis', 'Custom emojis', 'Discord'], ['stickers', 'Stickers', 'Discord'],
  ['events', 'Scheduled events', 'Discord'], ['server_age', 'Server age (days)', 'Discord'],
  ['joined_today', 'Current members who joined today (UTC)', 'Discord'], ['joined_week', 'Current members who joined in the last 7 days', 'Discord'],
  ['twitch_followers', 'Twitch followers', 'Twitch', 'twitch'], ['twitch_subscribers', 'Twitch subscribers', 'Twitch', 'linked-twitch'],
  ['twitch_sub_points', 'Twitch subscription points', 'Twitch', 'linked-twitch'],
  ['twitch_viewers', 'Twitch live viewers', 'Twitch', 'twitch'], ['twitch_status', 'Twitch live status', 'Twitch', 'twitch'],
  ['twitch_game', 'Twitch live game', 'Twitch', 'twitch'], ['twitch_title', 'Twitch live title', 'Twitch', 'twitch'],
  ['youtube_subscribers', 'YouTube subscribers', 'YouTube', 'youtube'], ['youtube_views', 'YouTube total views', 'YouTube', 'youtube'],
  ['youtube_videos', 'YouTube public videos', 'YouTube', 'youtube'],
  ['tiktok_followers', 'TikTok followers', 'TikTok'], ['tiktok_following', 'TikTok following', 'TikTok'],
  ['tiktok_likes', 'TikTok total likes', 'TikTok'], ['tiktok_videos', 'TikTok public videos', 'TikTok'],
  ['github_stars', 'GitHub stars', 'GitHub', 'github'], ['github_forks', 'GitHub forks', 'GitHub', 'github'],
  ['github_watchers', 'GitHub watchers', 'GitHub', 'github'], ['github_issues', 'GitHub open issues / PRs', 'GitHub', 'github'],
  ['minecraft_java_status', 'Minecraft Java server status', 'Games', 'minecraft'], ['minecraft_java_players', 'Minecraft Java online players', 'Games', 'minecraft'],
  ['minecraft_java_capacity', 'Minecraft Java player capacity', 'Games', 'minecraft'], ['minecraft_java_ratio', 'Minecraft Java players / capacity', 'Games', 'minecraft'],
  ['minecraft_bedrock_status', 'Minecraft Bedrock server status', 'Games', 'minecraft'], ['minecraft_bedrock_players', 'Minecraft Bedrock online players', 'Games', 'minecraft'],
  ['minecraft_bedrock_capacity', 'Minecraft Bedrock player capacity', 'Games', 'minecraft'], ['minecraft_bedrock_ratio', 'Minecraft Bedrock players / capacity', 'Games', 'minecraft'],
  ['modrinth_downloads', 'Modrinth project downloads', 'Games', 'modrinth'], ['modrinth_followers', 'Modrinth project followers', 'Games', 'modrinth'],
  ['custom', 'Custom text or number', 'Custom', 'custom'],
] as const;

export type StatisticMetric = typeof STATISTIC_METRICS[number][0];
export interface StatisticCounter {
  id: string;
  metric: StatisticMetric;
  channelId: string;
  source: string;
  template: string;
  enabled: boolean;
  compact: boolean;
}
export interface StatisticChannelSettings {
  refreshMinutes: number;
  counters: StatisticCounter[];
}
export const statisticMetric = (key: string) => STATISTIC_METRICS.find(metric => metric[0] === key);
export const MAX_STATISTIC_COUNTERS = 40;
export const defaultStatisticSettings = (): StatisticChannelSettings => ({ refreshMinutes: 10, counters: [] });
const snowflake = /^\d{15,22}$/;
const validSource = (kind: string | undefined, source: string) => {
  if (kind === 'role' || kind === 'voice') return snowflake.test(source);
  if (kind === 'twitch') return /^[a-zA-Z0-9_]{1,25}$/.test(source);
  if (kind === 'linked-twitch') return source === '';
  if (kind === 'youtube') return /^(?:UC[\w-]{22}|@[\p{L}\p{N}_.-]{1,100})$/u.test(source);
  if (kind === 'github') return /^[\w.-]+\/[\w.-]+$/.test(source) && source.split('/').every(part => part !== '.' && part !== '..');
  if (kind === 'minecraft') return /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::\d{1,5})?$/.test(source) && (!source.includes(':') || Number(source.split(':')[1]) > 0 && Number(source.split(':')[1]) <= 65535);
  if (kind === 'modrinth') return /^[a-zA-Z0-9_-]{1,100}$/.test(source);
  if (kind === 'custom') return source.length > 0 && source.length <= 100;
  return source === '';
};
export function validateStatisticSettings(input: unknown): {ok: true; settings: StatisticChannelSettings} | {ok: false; error: string} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {ok: false, error: 'Invalid settings.'};
  const raw = input as Record<string, unknown>;
  const refreshMinutes = raw.refreshMinutes ?? 10;
  if (typeof refreshMinutes !== 'number' || !Number.isInteger(refreshMinutes) || refreshMinutes < 10 || refreshMinutes > 1440) {
    return {ok: false, error: 'Refresh must be between 10 and 1440 minutes.'};
  }
  const rows = raw.counters ?? [];
  if (!Array.isArray(rows) || rows.length > MAX_STATISTIC_COUNTERS) return {ok: false, error: 'A maximum of 40 counters is supported.'};
  const channels = new Set<string>();
  const ids = new Set<string>();
  const counters: StatisticCounter[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') return {ok: false, error: 'Invalid counter.'};
    const { id, metric, channelId, source, template, enabled = true, compact = false } = row;
    const definition = typeof metric === 'string' && statisticMetric(metric);
    if (!definition || typeof id !== 'string' || !/^[\w-]{1,80}$/.test(id) || ids.has(id)) return {ok: false, error: 'Unknown metric or duplicate counter ID.'};
    if (typeof channelId !== 'string' || !snowflake.test(channelId) || channels.has(channelId)) return {ok: false, error: 'Select a distinct voice channel for each counter.'};
    if (typeof source !== 'string' || source.length > 120 || !validSource(definition[3], source)) return {ok: false, error: `Invalid source for ${definition[1]}.`};
    if (typeof template !== 'string' || template.length > 100 || !template.includes('{value}') || typeof enabled !== 'boolean' || typeof compact !== 'boolean') return {ok: false, error: 'Use a channel-name template containing {value} (maximum 100 characters).'};
    channels.add(channelId); ids.add(id);
    counters.push({id, metric: definition[0], channelId, source, template, enabled, compact});
  }
  return {ok: true, settings: {refreshMinutes, counters}};
}
export function parseStatisticSettings(input: unknown): StatisticChannelSettings {
  const result = validateStatisticSettings(input ?? {});
  return result.ok ? result.settings : defaultStatisticSettings();
}
export function formatStatisticName(counter: Pick<StatisticCounter, 'template' | 'compact'>, value: number | string): string {
  const display = typeof value === 'number' ? new Intl.NumberFormat('en-US', counter.compact ? {notation: 'compact', maximumFractionDigits: 1} : {}).format(value) : value;
  // Discord's 100-character limit; strip control characters from remote titles.
  return Array.from(counter.template.replaceAll('{value}', () => display).replace(/[\u0000-\u001f\u007f]/g, ' ').trim()).slice(0, 100).join('');
}
