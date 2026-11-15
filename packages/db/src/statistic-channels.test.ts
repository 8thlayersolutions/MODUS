import { describe, it, expect } from 'vitest';
import { STATISTIC_METRICS, defaultStatisticSettings, formatStatisticName, validateStatisticSettings, type StatisticCounter } from './statistic-channels';

const counter: StatisticCounter = { id: 'one', metric: 'members', channelId: '123456789012345678', source: '', template: '👥 Members: {value}', enabled: true, compact: false };

describe('statistic channel configuration', () => {
  it('starts empty and has unique metric identifiers', () => {
    expect(validateStatisticSettings(defaultStatisticSettings()).ok).toBe(true);
    expect(new Set(STATISTIC_METRICS.map(m => m[0])).size).toBe(STATISTIC_METRICS.length);
  });
  it('rejects invalid refresh intervals, templates, and duplicate channels', () => {
    expect(validateStatisticSettings({ refreshMinutes: 1, counters: [counter] }).ok).toBe(false);
    expect(validateStatisticSettings({ counters: [counter, { ...counter, id: 'other' }] }).ok).toBe(false);
    expect(validateStatisticSettings({ counters: [{ ...counter, template: 'Nothing dynamic' }] }).ok).toBe(false);
  });
  it('validates source identifiers without allowing arbitrary network URLs', () => {
    for (const [metric, source] of [['twitch_followers', 'anxietyscout'], ['youtube_subscribers', '@AnxietyScout'], ['role_members', '123456789012345678'], ['minecraft_java_ratio', 'chaos.mc.anxietyscout.live:25565'], ['modrinth_downloads', 'anxietyscout-chaos-smp']]) {
      expect(validateStatisticSettings({ counters: [{ ...counter, metric, source }] }).ok).toBe(true);
    }
    for (const [metric, source] of [['youtube_subscribers', 'https://example.org'], ['minecraft_java_players', 'evil.net:99999'], ['twitch_followers', '../../private'], ['github_stars', 'foo/bar?x=y']]) {
      expect(validateStatisticSettings({ counters: [{ ...counter, metric, source }] }).ok).toBe(false);
    }
  });
  it('formats numbers, zero, literal replacement strings, and truncates names', () => {
    expect(formatStatisticName(counter, 1234)).toBe('👥 Members: 1,234');
    expect(formatStatisticName({ ...counter, compact: true }, 1234)).toBe('👥 Members: 1.2K');
    expect(formatStatisticName(counter, 0)).toBe('👥 Members: 0');
    expect(formatStatisticName(counter, '$&')).toBe('👥 Members: $&');
    expect(Array.from(formatStatisticName(counter, 'a'.repeat(200))).length).toBe(100);
  });
});
