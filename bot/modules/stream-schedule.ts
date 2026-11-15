import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { buildStreamWeek, normalizeStreamSchedule } from "@modus/db/stream-schedule";
import type { BotModule, ModuleManager } from "../ModuleManager";

const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const scheduleModule: BotModule = {
  name: "stream-schedule",
  description: "Show the repeating weekly Twitch stream schedule.",
  meta: {
    displayName: "Stream Schedule",
    category: "community",
    icon: "i-lucide-calendar-clock",
    color: "purple",
    tags: ["stream", "twitch", "schedule", "creator", "website"],
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
    const input = await manager.databaseService.getModuleSettings(interaction.guildId, "stream-schedule");
    const settings = normalizeStreamSchedule(input);
    const ahead = interaction.options.getInteger("weeks_ahead") ?? 0;
    const week = buildStreamWeek(settings, new Date(), ahead);
    const embed = new EmbedBuilder()
      .setTitle(settings.title || "Stream schedule")
      .setColor(0x9146ff)
      .setDescription([
        settings.description,
        "Week of " + week.startDate + " to " + week.endDate,
        "Time zone: " + settings.timezone,
      ].filter(Boolean).join("\n"))
      .setFooter({ text: "Recurring schedule; special-date changes take precedence." });
    for (const day of week.days) {
      const entries = day.streams.map((s) => {
        const displayTime = s.startsAt
          ? "<t:" + Math.floor(new Date(s.startsAt).getTime() / 1000) + ":t>"
          : s.time + " (local)";
        return displayTime + " · **" + s.title + "**" +
          (s.game ? " — " + s.game : "") +
          (s.url ? "\n[Watch stream](" + s.url + ")" : "");
      });
      embed.addFields({
        name: weekdayNames[day.weekday] + " · " + day.date,
        value: entries.length ? entries.join("\n").slice(0, 1000) : "No stream planned",
        inline: false,
      });
    }
    await interaction.editReply({ embeds: [embed] });
  },
};
export default scheduleModule;
