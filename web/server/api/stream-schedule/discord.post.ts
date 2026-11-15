import { createHash } from "node:crypto";
import { buildDiscordStreamMessage, normalizeStreamSchedule } from "@modus/db/stream-schedule";
import { getRepos } from "../../utils/db";
import { requireModuleAccess } from "../../utils/session";

const DISCORD = "https://discord.com/api/v10";
const idPattern = /^\d{16,22}$/;
type Channel = { id: string; type: number; guild_id?: string };
type PostedMessage = { id: string; channel_id: string };
type Action = "publish" | "unpublish";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ guildId?: string; action?: Action }>(event);
  const guildId = String(body?.guildId || "");
  const action = body?.action;
  if (!idPattern.test(guildId) || (action !== "publish" && action !== "unpublish")) {
    throw createError({ statusCode: 400, statusMessage: "Invalid guild or action" });
  }
  await requireModuleAccess(event, guildId, "stream-schedule");
  const repos = getRepos();
  if (!repos) throw createError({ statusCode: 503, statusMessage: "Database unavailable" });
  const botToken = useRuntimeConfig().discordBotToken as string;
  if (!botToken) throw createError({ statusCode: 503, statusMessage: "Bot token unavailable" });
  const headers = { Authorization: "Bot " + botToken, "Content-Type": "application/json" };
  const existing = await repos.guildConfigs.getModuleSettings(guildId, "stream-schedule-publication");
  const previousChannel = String(existing.channelId ?? "");
  const previousMessage = String(existing.messageId ?? "");

  const deleteTrackedMessage = async (channelId: string, messageId: string): Promise<void> => {
    if (!idPattern.test(channelId) || !idPattern.test(messageId)) return;
    try {
      await $fetch(DISCORD + "/channels/" + channelId + "/messages/" + messageId, {
        method: "DELETE", headers,
      });
    } catch (error: any) {
      const status = error?.statusCode || error?.status;
      // A message already deleted by a moderator is not an error.
      if (status !== 404) throw error;
    }
  };

  if (action === "unpublish") {
    try {
      await deleteTrackedMessage(previousChannel, previousMessage);
    } catch (error: any) {
      throw createError({ statusCode: error?.statusCode || error?.status || 502,
        statusMessage: "Could not remove the published Discord message. Check permissions." });
    }
    await repos.guildConfigs.setModuleSettings(guildId, "stream-schedule-publication", {});
    return { ok: true, published: false, messageUrl: "" };
  }

  if (!(await repos.guildConfigs.isModuleEnabled(guildId, "stream-schedule"))) {
    throw createError({ statusCode: 409, statusMessage: "Enable Stream Schedule before publishing." });
  }
  const settings = normalizeStreamSchedule(
    await repos.guildConfigs.getModuleSettings(guildId, "stream-schedule"),
  );
  const channelId = settings.discord.channelId;
  if (!idPattern.test(channelId)) {
    throw createError({ statusCode: 400, statusMessage: "Select and save a Discord channel first." });
  }
  // Validate target against this guild. IDs are never trusted solely because
  // they appear in an editor input or stored settings.
  let channels: Channel[];
  try {
    channels = await $fetch<Channel[]>(DISCORD + "/guilds/" + guildId + "/channels", { headers });
  } catch {
    throw createError({ statusCode: 502, statusMessage: "Could not verify Discord channels." });
  }
  const allowed = channels.find((ch) => ch.id === channelId && (ch.type === 0 || ch.type === 5));
  if (!allowed) throw createError({ statusCode: 400, statusMessage: "Choose a text or announcement channel in this server." });
  const payload = buildDiscordStreamMessage(settings);
  const hash = createHash("sha256").update(JSON.stringify(payload.embeds)).digest("hex");
  let sent: PostedMessage | null = null;

  const newMessage = async (): Promise<PostedMessage> =>
    $fetch<PostedMessage>(DISCORD + "/channels/" + channelId + "/messages", {
      method: "POST", headers, body: payload,
    });

  try {
    if (previousChannel === channelId && idPattern.test(previousMessage)) {
      try {
        sent = await $fetch<PostedMessage>(
          DISCORD + "/channels/" + channelId + "/messages/" + previousMessage,
          { method: "PATCH", headers, body: payload },
        );
      } catch (error: any) {
        const status = error?.statusCode || error?.status;
        if (status !== 404) throw error;
      }
    }
    if (!sent) sent = await newMessage();
  } catch (error: any) {
    const status = error?.statusCode || error?.status;
    throw createError({
      statusCode: status === 403 ? 403 : 502,
      statusMessage: status === 403
        ? "MODUS needs View Channel, Send Messages, and Embed Links in that channel."
        : "Discord could not publish the schedule embed.",
    });
  }

  await repos.guildConfigs.setModuleSettings(guildId, "stream-schedule-publication", {
    channelId, messageId: sent.id, hash, updatedAt: new Date().toISOString(),
  });

  // Avoid leaving duplicate posts if the selected channel was changed.
  if (previousChannel && previousMessage &&
      (previousChannel !== channelId || previousMessage !== sent.id)) {
    try {
      await deleteTrackedMessage(previousChannel, previousMessage);
    } catch {
      // Keep the successfully published new message; moderators can remove
      // the old one manually if permissions changed.
    }
  }

  return {
    ok: true, published: true, channelId, messageId: sent.id,
    messageUrl: "https://discord.com/channels/" + guildId + "/" + channelId + "/" + sent.id,
  };
});
