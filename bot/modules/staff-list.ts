/** MODUS Staff List: publicly viewable roster and manager-controlled publishing. */
import { ChannelType, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { buildStaffDiscordPayload, buildStaffSections, parseStaffListSettings, type StaffMember, type StaffRole } from "@modus/db";
import type { BotModule, ModuleManager } from "../ModuleManager";

async function roster(interaction: ChatInputCommandInteraction, manager: ModuleManager) {
  const guild = interaction.guild!;
  const settings = parseStaffListSettings(await manager.databaseService.getModuleSettings(guild.id, "staff-list"));
  const roles: StaffRole[] = (await guild.roles.fetch()).map(role => ({
    id: role.id, name: role.name, color: role.color,
  }));
  const members = new Map<string, StaffMember>();
  if (settings.groups.some(group => group.roleIds.length)) {
    // Force complete fetch; partial member caches would incorrectly omit staff.
    const loaded = await guild.members.fetch();
    for (const member of loaded.values()) {
      members.set(member.id, {
        id: member.id, name: member.displayName,
        avatarUrl: member.displayAvatarURL({ size: 128 }),
        roleIds: [...member.roles.cache.keys()], bot: member.user.bot,
      });
    }
  }
  for (const id of new Set(settings.groups.flatMap(group => group.memberIds))) {
    if (members.has(id)) continue;
    try {
      const member = await guild.members.fetch(id);
      members.set(member.id, {
        id: member.id, name: member.displayName,
        avatarUrl: member.displayAvatarURL({ size: 128 }),
        roleIds: [...member.roles.cache.keys()], bot: member.user.bot,
      });
    } catch { /* A removed member is ignored. */ }
  }
  return { settings, sections: buildStaffSections(settings, [...members.values()], roles) };
}
const data = new SlashCommandBuilder()
  .setName("staff-list")
  .setDescription("View or publish the configured staff list")
  .setDMPermission(false)
  .addSubcommand(sub => sub.setName("view").setDescription("Show the server's staff directory"))
  .addSubcommand(sub => sub.setName("publish").setDescription("Post or update the staff directory (server managers)")
    .addChannelOption(option => option.setName("channel").setDescription("Destination text channel").setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)));

const staffList: BotModule = {
  name: "staff-list",
  description: "Role-based staff directory for Discord and your website",
  meta: { displayName: "Staff List", category: "community", icon: "i-lucide-users-round", color: "violet",
    tags: ["staff", "team", "directory", "website", "roles"] },
  data: data.toJSON(),
  async execute(interaction: ChatInputCommandInteraction, manager: ModuleManager) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.editReply("Use this command inside a server.");
      return;
    }
    if (!(await manager.databaseService.isModuleEnabled(interaction.guildId, "staff-list"))) {
      await interaction.editReply("Staff List is disabled.");
      return;
    }
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === "publish" && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.editReply("You need Manage Server to publish a staff directory.");
      return;
    }
    try {
      const { settings, sections } = await roster(interaction, manager);
      if (subcommand === "view") {
        const payload = buildStaffDiscordPayload(settings, sections);
        await interaction.editReply({ embeds: payload.embeds as any, components: payload.components as any, allowedMentions: { parse: [] } });
        return;
      }
      const channel = interaction.options.getChannel("channel", true);
      if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
        await interaction.editReply("Choose a text channel.");
        return;
      }
      const target = await interaction.guild.channels.fetch(channel.id);
      if (!target?.isTextBased() || !("send" in target)) {
        await interaction.editReply("MODUS cannot publish to that channel.");
        return;
      }
      const payload = buildStaffDiscordPayload(settings, sections);
      let message;
      if (settings.publishedChannelId === channel.id && settings.publishedMessageId && "messages" in target) {
        try {
          const previous = await target.messages.fetch(settings.publishedMessageId);
          message = await previous.edit({
            embeds: payload.embeds as any, components: payload.components as any, allowedMentions: { parse: [] },
          });
        } catch (error: any) {
          if (error?.code !== 10008) throw error;
        }
      }
      if (!message) message = await target.send({
        embeds: payload.embeds as any, components: payload.components as any, allowedMentions: { parse: [] },
      });
      await manager.databaseService.setModuleSettings(interaction.guildId, "staff-list", {
        ...settings, publishedChannelId: channel.id, publishedMessageId: message.id,
      });
      await interaction.editReply("Staff list published: https://discord.com/channels/" + interaction.guildId + "/" + channel.id + "/" + message.id);
    } catch (error) {
      console.error("[staff-list] publish failed", error);
      await interaction.editReply("Unable to load or publish the staff list. Verify MODUS can view members and send messages.");
    }
  },
};
export default staffList;
