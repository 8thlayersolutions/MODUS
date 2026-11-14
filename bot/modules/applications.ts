/** Discord entrypoint for the shared MODUS applications feature. */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  ChatInputCommandInteraction, ButtonInteraction, ModalSubmitInteraction,
  MessageFlags, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder,
  TextInputBuilder, TextInputStyle,
} from "discord.js";
import { BotModule, ModuleManager } from "../ModuleManager";
import { mayReviewApplication, type ApplicationFormRow } from "@modus/db";

const MODULE = "applications";
const flags = [MessageFlags.Ephemeral] as const;
const DASHBOARD_URL = (process.env.PUBLIC_WEB_URL || process.env.DASHBOARD_URL || "").replace(/\/$/, "");

const apply = new SlashCommandBuilder()
  .setName("apply").setDescription("Apply for a role or position in this server")
  .setDMPermission(false).toJSON();

const admin = new SlashCommandBuilder()
  .setName("application").setDescription("Application panels, status, and staff reviews")
  .setDMPermission(false)
  .addSubcommand(sub => sub.setName("status").setDescription("See your recent applications"))
  .addSubcommand(sub => sub.setName("panel").setDescription("Post an application panel (staff)")
    .addStringOption(o => o.setName("form").setDescription("Form ID from MODUS dashboard").setRequired(true))
    .addChannelOption(o => o.setName("channel").setDescription("Where to post").setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand(sub => sub.setName("review").setDescription("Review an application (staff)")
    .addStringOption(o => o.setName("id").setDescription("Submission ID").setRequired(true))
    .addStringOption(o => o.setName("decision").setDescription("New status").setRequired(true)
      .addChoices({ name: "In review", value: "in_review" },
        { name: "Approve", value: "approved" }, { name: "Deny", value: "denied" }))
    .addStringOption(o => o.setName("reason").setDescription("Reason for decision").setMaxLength(500)))
  .toJSON();

function webLink(guildId: string, formId: string) {
  return DASHBOARD_URL ? `${DASHBOARD_URL}/apply/${guildId}/${formId}` : null;
}
function nativeForm(form: ApplicationFormRow) {
  return form.questions.length > 0 && form.questions.length <= 5 &&
    form.questions.every(q => q.type === "short" || q.type === "paragraph");
}
async function enabled(manager: ModuleManager, guildId: string) {
  return manager.databaseService.isModuleEnabled(guildId, MODULE);
}
async function isManager(interaction: ChatInputCommandInteraction, manager: ModuleManager): Promise<boolean> {
  if (!interaction.guildId) return false;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const server = await manager.databaseService.servers.getByGuildId(interaction.guildId);
  return !!server && (server.owner_id === interaction.user.id ||
    server.admin_user_ids.includes(interaction.user.id));
}
function memberRoleIds(member: any): string[] {
  if (!member?.roles) return [];
  return Array.isArray(member.roles) ? member.roles : [...member.roles.cache.keys()];
}
async function showApplication(interaction: ButtonInteraction, manager: ModuleManager, formId: string) {
  const guildId = interaction.guildId;
  if (!guildId || !(await enabled(manager, guildId))) {
    return interaction.reply({ content: "Applications are unavailable in this server.", flags });
  }
  const form = await manager.databaseService.applications.getForm(guildId, formId);
  if (!form || !form.open) {
    return interaction.reply({ content: "This application is closed.", flags });
  }
  if (!nativeForm(form)) {
    const url = webLink(guildId, formId);
    return interaction.reply({ content: url
      ? `This form has more than five questions or uses dropdowns. Complete it on the website: ${url}`
      : "A web address has not been configured for this form. Ask an administrator to set PUBLIC_WEB_URL.", flags });
  }
  const modal = new ModalBuilder()
    .setCustomId(`applications:submit:${form.id}:${form.version}`)
    .setTitle(form.title.slice(0, 45));
  for (const q of form.questions) {
    const field = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(q.label.slice(0, 45))
      .setStyle(q.type === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(q.required)
      .setMaxLength(q.type === "paragraph" ? 4000 : 1000);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field));
  }
  return interaction.showModal(modal);
}
async function submitModal(interaction: ModalSubmitInteraction, manager: ModuleManager) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  await interaction.deferReply({ flags });
  if (!await enabled(manager, guildId)) {
    return interaction.editReply("Applications are disabled in this server.");
  }
  const [, , formId, version] = interaction.customId.split(":");
  const form = await manager.databaseService.applications.getForm(guildId, formId || "");
  if (!form || !form.open || String(form.version) !== version) {
    return interaction.editReply("This form changed or closed. Open its panel and try again.");
  }
  const answers: Record<string, string> = {};
  for (const q of form.questions) answers[q.id] = interaction.fields.getTextInputValue(q.id);
  try {
    const row = await manager.databaseService.applications.submit({
      guildId, formId: form.id, applicantId: interaction.user.id, answers, source: "discord",
    });
    await interaction.editReply(`Your application **${form.title}** was submitted. Reference: \`${row.id}\`.`);
    // The submission log channel belongs to this form, not to the entire module.
    if (form.submissionLogChannelId && interaction.guild) {
      try {
        const channel = await interaction.guild.channels.fetch(form.submissionLogChannelId);
        if (channel?.guildId === guildId && channel.isSendable()) {
          await channel.send({
            content: `New **${form.title.replace(/[@`]/g, "").slice(0, 80)}** application from user ${interaction.user.id}. ID: \`${row.id}\`.`,
            allowedMentions: { parse: [] },
          });
        }
      } catch (error) { console.warn("[Applications] Could not notify form log channel:", error); }
    }
  } catch (error: any) {
    return interaction.editReply(error?.message || "Unable to submit your application.");
  }
}
async function execute(interaction: ChatInputCommandInteraction, manager: ModuleManager): Promise<any> {
  if (!interaction.guildId || !interaction.guild) {
    return interaction.reply({ content: "Applications are only available in servers.", flags });
  }
  await interaction.deferReply({ flags });
  const guildId = interaction.guildId;
  if (!await enabled(manager, guildId)) return interaction.editReply("Applications are disabled on this server.");
  const repository = manager.databaseService.applications;
  if (interaction.commandName === "apply") {
    const forms = (await repository.listForms(guildId)).filter(f => f.open).slice(0, 20);
    if (!forms.length) return interaction.editReply("There are no open applications.");
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < forms.length; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const form of forms.slice(i, i + 5)) {
        row.addComponents(new ButtonBuilder().setCustomId(`applications:apply:${form.id}`)
          .setLabel(form.title.slice(0, 80)).setStyle(ButtonStyle.Primary));
      }
      rows.push(row);
    }
    return interaction.editReply({ content: "Choose an application to get started:", components: rows });
  }
  const sub = interaction.options.getSubcommand();
  if (sub === "status") {
    const rows = await repository.listMine(guildId, interaction.user.id);
    return interaction.editReply(rows.length
      ? rows.slice(0, 10).map(r => `\`${r.id}\` — **${r.status}** (<t:${Math.floor(r.createdAt.getTime() / 1000)}:R>)`).join("\n")
      : "You have not submitted an application here.");
  }
  const managerAccess = await isManager(interaction, manager);
  if (sub === "panel") {
    if (!managerAccess) return interaction.editReply("Only server managers can publish application panels.");
    const formId = interaction.options.getString("form", true);
    const channel = interaction.options.getChannel("channel", true);
    const form = await repository.getForm(guildId, formId);
    if (!form) return interaction.editReply("Form not found. Copy its ID from the MODUS dashboard.");
    if (!channel || !("send" in channel)) return interaction.editReply("Choose a sendable text channel.");
    const target = await interaction.guild.channels.fetch(channel.id);
    if (!target?.isSendable()) return interaction.editReply("I cannot send messages to that channel.");
    try {
      const msg = await target.send({
        embeds: [{ title: form.title, description: form.description || "Apply below.",
          color: 0x8b5cf6 }],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`applications:apply:${form.id}`)
            .setLabel("Apply Now").setStyle(ButtonStyle.Primary))],
        allowedMentions: { parse: [] },
      });
      await repository.setPanel(guildId, form.id, channel.id, msg.id);
      return interaction.editReply(`Panel posted in <#${channel.id}>.`);
    } catch (error: any) {
      return interaction.editReply(`Could not post the panel: ${error?.message || "unknown error"}`);
    }
  }
  if (sub === "review") {
    const id = interaction.options.getString("id", true);
    const status = interaction.options.getString("decision", true) as "in_review" | "approved" | "denied";
    const reason = interaction.options.getString("reason")?.trim() || null;
    if (!/^[a-f0-9-]{36}$/i.test(id)) return interaction.editReply("Invalid submission ID.");
    // Resolve and authorize the submission's own form before making a decision.
    const submission = await repository.getSubmission(guildId, id);
    if (!submission) return interaction.editReply("Submission not found.");
    const form = await repository.getForm(guildId, submission.formId);
    if (!form || !mayReviewApplication(form, {
      userId: interaction.user.id,
      roleIds: memberRoleIds(interaction.member),
      isGuildManager: managerAccess,
    })) {
      return interaction.editReply("You are not authorized to review this application.");
    }
    const result = await repository.review({
      guildId, id, actorId: interaction.user.id, status, reason,
    });
    if (!result) return interaction.editReply("Submission is missing or already finalized.");
    let warning = "";
    if (status === "approved" && result.form.approvalRoleId) {
      try {
        const member = await interaction.guild.members.fetch(result.submission.applicantId);
        await member.roles.add(result.form.approvalRoleId, "MODUS application approved");
      } catch {
        warning = " Warning: automatic role assignment failed. Check role hierarchy and bot permissions.";
      }
    }
    try {
      const user = await interaction.client.users.fetch(result.submission.applicantId);
      await user.send({
        content: `Your **${result.form.title.replace(/[@`]/g, "")}** application is now **${status}**.${reason ? ` Reason: ${reason.replace(/[@`]/g, "")}` : ""}`,
        allowedMentions: { parse: [] },
      });
    } catch { /* User may have DMs closed. */ }
    if (result.form.submissionLogChannelId) {
      try {
        const channel = await interaction.guild.channels.fetch(result.form.submissionLogChannelId);
        if (channel?.guildId === guildId && channel.isSendable()) {
          await channel.send({
            content: `**${result.form.title.replace(/[@`]/g, "").slice(0, 80)}** application \`${id}\` marked **${status}** by ${interaction.user.id}.`,
            allowedMentions: { parse: [] },
          });
        }
      } catch (error) { console.warn("[Applications] Could not update log channel", error); }
    }
    return interaction.editReply(`Application \`${id}\` marked **${status}**.${warning}`);
  }
}
const moduleEntry: BotModule = {
  name: MODULE,
  description: "Custom applications via Discord and a shared MODUS web review queue",
  meta: { displayName: "Applications", category: "community",
    icon: "i-lucide-clipboard-list", color: "violet",
    tags: ["applications", "staff", "forms", "review"] },
  commands: [apply, admin],
  skipDefer: true,
  execute,
  handleButton: async (interaction, manager) => {
    const [, action, formId] = interaction.customId.split(":");
    if (action === "apply" && formId) await showApplication(interaction, manager, formId);
  },
  handleModal: async (interaction, manager) => {
    if (interaction.customId.startsWith("applications:submit:")) {
      await submitModal(interaction, manager);
    }
  },
};
export default moduleEntry;
