import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Guild } from 'discord.js';
import type { StatisticCounter, StatisticMetric } from '@modus/db';
import { StatisticSources } from './statisticSources';
const counter = (metric: StatisticMetric, source = ''): StatisticCounter => ({ metric, source, id: metric, channelId: '123456789012345678', template: '{value}', enabled: true, compact: false });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('StatisticSources', () => {
  it('deduplicates requests for a shared YouTube account and preserves a real zero', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'test-key');
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ statistics: { subscriberCount: '0', viewCount: '500', videoCount: '3' } }] }) });
    vi.stubGlobal('fetch', fetcher);
    const rows = [counter('youtube_subscribers', '@test'), counter('youtube_views', '@test'), counter('youtube_videos', '@test')];
    const sources = new StatisticSources({} as Guild, rows);
    expect(await Promise.all(rows.map(c => sources.value(c)))).toEqual([0, 500, 3]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not report a failed API or hidden subscriber count as zero', async () => {
    vi.stubEnv('YOUTUBE_API_KEY', 'test-key');
    const row = counter('youtube_subscribers', '@test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(new StatisticSources({} as Guild, [row]).value(row)).rejects.toThrow('429');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ statistics: { hiddenSubscriberCount: true, subscriberCount: '0' } }] }) }));
    await expect(new StatisticSources({} as Guild, [row]).value(row)).rejects.toThrow('hidden');
  });
  it('uses approximate presence counts when the optional intent is missing', async () => {
    const fetch = vi.fn().mockResolvedValue({ approximatePresenceCount: 7 });
    const guild = { id: '123', memberCount: 25, client: { options: { intents: { has: () => false } }, guilds: { fetch } } } as unknown as Guild;
    const rows = [counter('online'), counter('offline'), counter('dnd')];
    const sources = new StatisticSources(guild, rows);
    expect(await sources.value(rows[0]!)).toBe(7);
    expect(await sources.value(rows[1]!)).toBe(18);
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(sources.value(rows[2]!)).rejects.toThrow('Guild Presences');
  });
  it('reports Minecraft offline state without fabricating zero player counts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ online: false }) }));
    const rows = [counter('minecraft_java_status', 'example.net'), counter('minecraft_java_players', 'example.net')];
    const sources = new StatisticSources({} as Guild, rows);
    expect(await sources.value(rows[0]!)).toBe('Offline');
    await expect(sources.value(rows[1]!)).rejects.toThrow('Metric unavailable');
  });
});
