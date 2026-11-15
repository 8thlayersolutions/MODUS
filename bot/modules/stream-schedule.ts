import { createHash } from "node:crypto";
import {
  ChannelType,
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { buildDiscordStreamMessage, normalizeStreamSchedule } from "@modus/db/stream-schedule";
import type { BotModule, ModuleManager } from "../ModuleManager";

const MODULE = "stream-schedule";
const PUBLICATION = "stream-schedule-publication";
const SYNC_INTERVAL_MS = 5 * 60_000;
let running = false;

function fingerprint(payload: ReturnType<typeof buildDiscordStreamMessage>): string {
  return createHash("sha256").update(JSON.stringify(payload.embeds)).digest("hex");
}

/**
 * Each gateway shard owns a disjoint set of guilds. The sweep only edits an
 * already-published, tracked message; it NEVER creates a new Discord post.
 */
async function syncPublishedSchedule(manager: ModuleManager): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (const guild of manager.client.guilds.cache.values()) {
      try {
        const db = manager.databaseService;
        const publication = await db.getModuleSettings(guild.id, PUBLICATION);
        const channelId = String(publication.channelId || "");
        const messageId = String(publication.messageId || "");
        if (!channelId || !messageId) continue;
        if (!(await db.isModuleEnabled(guild.id, MODULE))) continue;
        const settings = normalizeStreamSchedule(await db.getModuleSettings(guild.id, MODULE));
        if (!settings.discord.autoUpdate || settings.discord.channelId !== channelId) continue;
        const payload = buildDiscordStreamMessage(settings);
        const hash = fingerprint(payload);
        if (publication.hash === hash) continue;
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
          continue;
        }
        await channel.messages.edit(messageId, {
          embeds: payload.embeds,
          allowedMentions: { parse: [] },
        });
        // A publish or removal may have happened concurrently. Do not
        // replace the new message tracking metadata with stale state.
        const newest = await db.getModuleSettings(guild.id, PUBLICATION);
        if (newest.messageId === messageId && newest.channelId === channelId) {
          await db.setModuleSettings(guild.id, PUBLICATION, {
            ...newest, hash, updatedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        manager.logger.error("Failed to refresh published stream schedule embed", guild.id, error, MODULE);
      }
    }
  } finally {
    running = false;
  }
}

const scheduleModule: BotModule = {
  name: MODULE,
  description: "Manage recurring streams and publish an automatically updated Discord schedule.",
  meta: {
    displayName: "Stream Schedule",
    category: "community",
    icon: "i-lucide-calendar-clock",
    color: "purple",
    tags: ["stream", "twitch", "schedule", "creator", "website", "discord"],
  },
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("See the scheduled streams for this or an upcoming week")
    .addIntegerOption((option) =>
      option.setName("weeks_ahead")
        .setDescription("0 = current week, 1 = next week, up to 4 weeks ahead")
        .setMinValue(0).setMaxValue(4))
    .toJSON(),
  execute: async (interaction: ChatInputCommandInteraction, manager: ModuleManager) => {
    if (!interaction.guildId) {
      await interaction.editReply("This command can only be used in a Discord server.");
      return;
    }
    const input = await manager.databaseService.getModuleSettings(interaction.guildId, MODULE);
    const settings = normalizeStreamSchedule(input);
    const ahead = interaction.options.getInteger("weeks_ahead") ?? 0;
    const payload = buildDiscordStreamMessage(settings, new Date(), ahead);
    await interaction.editReply({
      embeds: payload.embeds,
      allowedMentions: { parse: [] },
    });
  },
  registerEvents: (manager) => {
    setTimeout(() => {
      void syncPublishedSchedule(manager);
      setInterval(() => void syncPublishedSchedule(manager), SYNC_INTERVAL_MS).unref();
    }, 60_000).unref();
  },
};
export default scheduleModule;
