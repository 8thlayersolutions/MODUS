import { ApplicationError, mayReviewApplication, validateQuestions } from "@modus/db";
import { getRepos } from "./db";
import { requireAuthedUserId, requireGuildManager } from "./session";
import { fetchGuildMemberRoleIds } from "./discord";
import type { H3Event } from "h3";

export function applicationRepos() {
  const repos = getRepos();
  if (!repos) throw createError({ statusCode: 503, statusMessage: "Database unavailable." });
  return repos;
}

export function applicationId(value: unknown, label = "id"): string {
  if (typeof value !== "string" || !/^[a-f0-9-]{36}$/i.test(value)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label}.` });
  }
  return value;
}
export function applicationGuild(value: unknown): string {
  if (typeof value !== "string" || !/^\d{16,22}$/.test(value)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid guild ID." });
  }
  return value;
}
export function applicationFormInput(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      typeof value.title !== "string" || value.title.trim().length < 2 ||
      value.title.length > 100 || typeof value.description !== "string" ||
      value.description.length > 2000 || typeof value.open !== "boolean" ||
      (value.approvalRoleId !== null && value.approvalRoleId !== undefined &&
       (typeof value.approvalRoleId !== "string" || !/^\d{16,22}$/.test(value.approvalRoleId))) ||
      !Number.isInteger(value.cooldownDays) || value.cooldownDays < 0 || value.cooldownDays > 365) {
    throw createError({ statusCode: 400, statusMessage: "Invalid application settings." });
  }
  try {
    const reviewerRoleIds = applicationReviewerIds(value.reviewerRoleIds, "reviewer roles");
    const reviewerUserIds = applicationReviewerIds(value.reviewerUserIds, "reviewer users");
    const submissionLogChannelId = value.submissionLogChannelId === null || value.submissionLogChannelId === undefined || value.submissionLogChannelId === "" ? null : applicationDiscordId(value.submissionLogChannelId, "submission log channel");
    return { reviewerRoleIds, reviewerUserIds, submissionLogChannelId,
      title: value.title.trim(), description: value.description.trim(),
      open: value.open, approvalRoleId: value.approvalRoleId || null,
      cooldownDays: value.cooldownDays, questions: validateQuestions(value.questions) };
  } catch (error) { throw applicationInputError(error); }
}

export function applicationInputError(error: unknown): Error {
  if (error instanceof ApplicationError) return createError({ statusCode: 400, statusMessage: error.message });
  return error instanceof Error ? error : new Error(String(error));
}

/** Verify guild membership using the bot credential, not user-submitted guild IDs.
 * A failed upstream lookup fails closed (no membership can be established). */
export async function requireApplicationMember(event: H3Event, guildId: string) {
  const identity = await requireAuthedUserId(event);
  const token = useRuntimeConfig().discordBotToken as string;
  if (!token) throw createError({ statusCode: 503, statusMessage: "Discord membership checks are unavailable." });
  try {
    await $fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${identity.userId}`, {
      headers: { Authorization: `Bot ${token}` },
    });
  } catch (error: any) {
    if ([404, 403].includes(error?.statusCode || error?.status)) {
      throw createError({ statusCode: 403, statusMessage: "You must be a member of this Discord server." });
    }
    throw createError({ statusCode: 503, statusMessage: "Unable to verify Discord server membership." });
  }
  return identity;
}

export async function notifyApplicationDecision(guildId: string, memberId: string,
  title: string, status: string, reason: string | null): Promise<boolean> {
  const token = useRuntimeConfig().discordBotToken as string;
  if (!token) return false;
  try {
    const dm = await $fetch<{ id: string }>("https://discord.com/api/v10/users/@me/channels", {
      method: "POST", headers: { Authorization: `Bot ${token}` },
      body: { recipient_id: memberId },
    });
    const safeTitle = title.replace(/[@`]/g, "").slice(0, 100);
    const safeReason = reason?.replace(/[@`]/g, "").slice(0, 400) || null;
    await $fetch(`https://discord.com/api/v10/channels/${dm.id}/messages`, {
      method: "POST", headers: { Authorization: `Bot ${token}` },
      body: { content: `Your **${safeTitle}** application in server ${guildId} is now **${status}**.${safeReason ? ` Reason: ${safeReason}` : ""}`,
        allowed_mentions: { parse: [] } },
    });
    return true;
  } catch { return false; }
}

/** Only properly formatted, distinct Discord snowflakes can be saved. */
export function applicationDiscordId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^\\d{16,22}$/.test(value)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label}.` });
  }
  return value;
}
export function applicationReviewerIds(raw: unknown, label: string): string[] {
  if (!Array.isArray(raw) || raw.length > 25) {
    throw createError({ statusCode: 400, statusMessage: `Invalid ${label} (maximum 25).` });
  }
  return [...new Set(raw.map(id => applicationDiscordId(id, label)))];
}

/** Return manager privileges, or only roles from live Discord membership.
 * Never rely on a client-supplied list of roles. */
export async function applicationReviewerIdentity(event: H3Event, guildId: string) {
  const identity = await requireAuthedUserId(event);
  let isGuildManager = false;
  try {
    await requireGuildManager(event, guildId);
    isGuildManager = true;
  } catch (err: any) {
    if (err?.statusCode !== 403) throw err;
  }
  const roleIds = isGuildManager ? [] : await fetchGuildMemberRoleIds(guildId, identity.userId);
  return { ...identity, isGuildManager, roleIds };
}

export async function requireApplicationReviewer(event: H3Event, guildId: string, formId: string) {
  const access = await applicationReviewerIdentity(event, guildId);
  const form = await applicationRepos().applications.getForm(guildId, formId);
  if (!form) throw createError({ statusCode: 404, statusMessage: "Application form not found." });
  if (!mayReviewApplication(form, access)) {
    throw createError({ statusCode: 403, statusMessage: "You are not assigned to review this application." });
  }
  return { ...access, form };
}

export async function publishApplicationLog(
  guildId: string, channelId: string | null, content: string,
): Promise<boolean> {
  if (!channelId) return false;
  const token = useRuntimeConfig().discordBotToken as string;
  if (!token) return false;
  const headers = { Authorization: `Bot ${token}` };
  try {
    const channel = await $fetch<{ guild_id?: string; type?: number }>(
      `https://discord.com/api/v10/channels/${channelId}`, { headers });
    if (channel.guild_id !== guildId || ![0, 5].includes(channel.type ?? -1)) {
      console.warn("[Applications] Invalid per-form log channel:", channelId);
      return false;
    }
    await $fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST", headers, body: {
        content: content.slice(0, 1900),
        allowed_mentions: { parse: [] },
      },
    });
    return true;
  } catch (error) {
    console.warn("[Applications] Log channel delivery failed", error);
    return false;
  }
}
