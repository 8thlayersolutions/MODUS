import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction, type Guild } from 'discord.js';
import { formatStatisticName, parseStatisticSettings, statisticMetric } from '@modus/db';
import type { BotModule, ModuleManager } from '../ModuleManager';
import { StatisticSources } from '../lib/statisticSources';

const MODULE = 'statistic-channels';
const lastRun = new Map<string, number>();
const running = new Set<string>();
let timer: NodeJS.Timeout | undefined;
let sweeping = false;

/** Each guild belongs to exactly one Discord shard; a per-shard lease protects
 * its worker against duplicate processes. No worker fetches other shards' guilds. */
async function refresh(guild: Guild, manager: ModuleManager): Promise<string> {
  if (running.has(guild.id)) return 'Refresh already in progress.';
  running.add(guild.id);
  try {
    if (!guild.available || !(await manager.databaseService.isModuleEnabled(guild.id, MODULE))) return 'Statistic Channels is disabled or the server is unavailable.';
    const settings = parseStatisticSettings(await manager.databaseService.getModuleSettings(guild.id, MODULE));
    const counters = settings.counters.filter(c => c.enabled);
    if (!counters.length) return 'No enabled counters. Configure them in the MODUS dashboard.';
    const minutes = settings.refreshMinutes;
    if (Date.now() - (lastRun.get(guild.id) || 0) < minutes * 60_000) return 'Counters are on cooldown to respect API and Discord rename limits.';
    lastRun.set(guild.id, Date.now());
    const sources = new StatisticSources(guild, counters);
    let updated = 0, unchanged = 0, failed = 0;
    for (const counter of counters) {
      try {
        const channel = guild.channels.cache.get(counter.channelId);
        if (!channel || channel.type !== ChannelType.GuildVoice) throw new Error('Target voice channel missing');
        if (!channel.manageable) throw new Error('MODUS needs Manage Channels on the target');
        const name = formatStatisticName(counter, await sources.value(counter));
        if (!name) throw new Error('Name is empty');
        if (name === channel.name) { unchanged++; continue; }
        await channel.setName(name, 'MODUS statistic channel refresh');
        updated++;
      } catch (error) {
        failed++;
        // A temporary problem must never overwrite a good count with zero.
        const reason = error instanceof Error && /^(Provider returned HTTP|Metric unavailable|Enable Guild Presences|.* required|.* not found|.* no longer exists|MODUS needs Manage Channels|Target voice channel missing|YouTube subscriber count is hidden|Name is empty)/.test(error.message)
          ? error.message : 'Provider or Discord request failed';
        void manager.logger.warn(`${statisticMetric(counter.metric)?.[1]} (${counter.channelId}): ${reason}`, guild.id, MODULE);
      }
    }
    return `Statistic channels: ${updated} updated, ${unchanged} unchanged, ${failed} unavailable or failed.`;
  } finally { running.delete(guild.id); }
}
async function sweep(manager: ModuleManager) {
  if (sweeping || !manager.client.isReady()) return;
  sweeping = true;
  try {
    for (const guild of manager.client.guilds.cache.values()) {
      if (!timer) break;
      try { await refresh(guild, manager); }
      catch { void manager.logger.warn('Statistic refresh failed', guild.id, MODULE); }
    }
    for (const id of lastRun.keys()) if (!manager.client.guilds.cache.has(id)) lastRun.delete(id);
  } finally { sweeping = false; }
}
export function startStatisticChannels(manager: ModuleManager) {
  if (timer) return;
  timer = setInterval(() => void sweep(manager), 60_000);
  timer.unref();
  void sweep(manager);
}
export function stopStatisticChannels() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

const mod: BotModule = {
  name: MODULE,
  description: 'Live Discord and social media counters in configurable voice channels.',
  meta: { displayName: 'Statistic Channels', category: 'community', icon: 'i-lucide-chart-no-axes-combined', color: 'cyan', tags: ['stats', 'counter', 'members', 'twitch', 'youtube', 'tiktok', 'voice'] },
  data: new SlashCommandBuilder().setName('statistics').setDescription('Manage live statistic channels')
    .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName('refresh').setDescription('Refresh enabled statistic channels (subject to cooldown)'))
    .addSubcommand(sub => sub.setName('status').setDescription('List configured statistic channels')).toJSON(),
  async execute(interaction: ChatInputCommandInteraction, manager: ModuleManager) {
    if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.editReply('Manage Server permission is required.'); return;
    }
    if (interaction.options.getSubcommand() === 'refresh') {
      await interaction.editReply(await refresh(interaction.guild, manager)); return;
    }
    const settings = parseStatisticSettings(await manager.databaseService.getModuleSettings(interaction.guild.id, MODULE));
    const enabled = await manager.databaseService.isModuleEnabled(interaction.guild.id, MODULE);
    const lines = settings.counters.map(c => `${c.enabled ? '✅' : '⏸️'} ${statisticMetric(c.metric)?.[1]} — <#${c.channelId}>`);
    await interaction.editReply({ content: [`Statistic Channels: ${enabled ? 'enabled' : 'disabled'} · every ${settings.refreshMinutes} minutes`, ...lines].join('\n').slice(0, 1950), allowedMentions: { parse: [] } });
  },
};
export default mod;
