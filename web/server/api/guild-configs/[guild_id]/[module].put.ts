/**
 * PUT /api/guild-configs/:guild_id/:module
 *
 * Update a single module's settings and/or enabled flag on a guild.
 * Caller must be the server owner or a listed admin (or a bot admin).
 *
 * Body: { enabled?: boolean, settings?: object }
 *   - Either field is optional; omit what you don't want to change.
 *   - Unknown fields are ignored.
 *   - Module "recording": premium-only bitrates are clamped for non-premium guilds.
 */
import { validateTwitchSyncSettings } from "@modus/db/twitch-sync";
import { clampRecordingBitrate } from "@modus/db/recording-limits";
import { parseStaffListSettings } from "@modus/db";
import { validateWelcomeImageElements } from "@modus/db/welcome-images";
import { getRepos } from "../../../utils/db";
import { requireModuleAccess } from "../../../utils/session";
import { deleteR2Object, extractWelcomeBgKey } from "../../../utils/r2";
import { autoGrantModuleChannels } from "../../../utils/permission-autofix";
import { auditReportCache } from "../../../utils/permission-audit-cache";

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, "guild_id");
  const moduleName = getRouterParam(event, "module");
  if (!guildId || !moduleName) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing guild_id or module route param.",
    });
  }

  // Identity settings must go through PUT /api/identity/:guild_id, which
  // applies the change to Discord before persisting. Writing module_name =
  // "identity" here would silently corrupt the diff baseline that endpoint
  // relies on, without ever touching Discord.
  if (moduleName.toLowerCase() === "identity") {
    throw createError({
      statusCode: 400,
      statusMessage: "Use PUT /api/identity/:guild_id to change bot identity settings.",
    });
  }

  const identity = await requireModuleAccess(event, guildId, moduleName);

  const body = await readBody<{
    enabled?: boolean;
    settings?: Record<string, any>;
  }>(event);

  // Twitch mappings are user-configurable, but must not allow arbitrary
  // unmanaged/missing/high-permission role IDs to be persisted.
  if (moduleName.toLowerCase() === "twitch-sync" && body?.settings !== undefined) {
    const validated = validateTwitchSyncSettings(body.settings);
    if (!validated.ok) {
      throw createError({ statusCode: 400, statusMessage: validated.error });
    }
    const roleIds = [...new Set(Object.values(validated.settings.mappings).filter(Boolean))];
    if (roleIds.length) {
      const config = useRuntimeConfig();
      const token = config.discordBotToken as string;
      const botId = config.public.discordClientId as string;
      if (!token || !botId) {
        throw createError({ statusCode: 503, statusMessage: "Discord bot credentials are unavailable." });
      }
      const headers = { Authorization: "Bot " + token };
      let roles: Array<{ id: string; managed: boolean; position: number }>;
      let member: { roles: string[] };
      try {
        [roles, member] = await Promise.all([
          $fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, { headers }),
          $fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${botId}`, { headers }),
        ]);
      } catch {
        throw createError({ statusCode: 503, statusMessage: "Unable to check the bot's role hierarchy." });
      }
      const top = roles.filter((r) => member.roles.includes(r.id)).reduce((max, r) => Math.max(max, r.position), 0);
      for (const id of roleIds) {
        const role = roles.find((r) => r.id === id);
        if (!role || role.id === guildId || role.managed || role.position >= top) {
          throw createError({ statusCode: 400, statusMessage: "Twitch mapping selects a role MODUS cannot assign." });
        }
      }
    }
    body.settings = validated.settings;
  }

  if (moduleName.toLowerCase() === "staff-list" && body?.settings !== undefined) {
    body.settings = parseStaffListSettings(body.settings) as unknown as Record<string, any>;
  }

  const isWelcome = moduleName.toLowerCase() === "welcome";
  if (isWelcome && body?.settings?.elements !== undefined) {
    const validationError = validateWelcomeImageElements(
      body.settings.elements,
    );
    if (validationError) {
      throw createError({ statusCode: 400, statusMessage: validationError });
    }
  }

  const repos = getRepos();
  if (!repos) {
    throw createError({
      statusCode: 503,
      statusMessage: "Database unavailable (NUXT_DATABASE_URL not set).",
    });
  }

  // Bitrates above the free tier are premium-only. Clamp rather than reject so
  // a lapsed-premium guild's stale form value doesn't make every save fail;
  // the bot re-enforces this at session start regardless.
  let bitrateClamped = false;
  if (
    moduleName.toLowerCase() === "recording" &&
    typeof body?.settings?.bitrate === "number"
  ) {
    const premium = await repos.servers.isPremium(guildId);
    const allowed = clampRecordingBitrate(body.settings.bitrate, premium);
    if (allowed !== body.settings.bitrate) {
      body.settings = { ...body.settings, bitrate: allowed };
      bitrateClamped = true;
    }
  }

  let previousBackgroundImage: string | undefined;
  if (isWelcome && body?.settings !== undefined) {
    const current = await repos.guildConfigs.getModuleSettings(guildId, "welcome");
    previousBackgroundImage = current?.backgroundImage;
  }

  try {
    if (body?.settings !== undefined) {
      await repos.guildConfigs.setModuleSettings(
        guildId,
        moduleName,
        body.settings ?? {},
      );
    }
    if (typeof body?.enabled === "boolean") {
      await repos.guildConfigs.setModuleStatus(
        guildId,
        moduleName,
        body.enabled,
      );
    }

    // Best-effort housekeeping: settings replace the whole `welcome` blob,
    // so if backgroundImage changed (or was dropped), the previous R2
    // object is no longer referenced from anywhere. Delete it so re-uploads
    // don't accumulate orphaned images.
    if (isWelcome && previousBackgroundImage) {
      const newBackgroundImage = body?.settings?.backgroundImage;
      if (previousBackgroundImage !== newBackgroundImage) {
        const oldKey = extractWelcomeBgKey(previousBackgroundImage, guildId);
        if (oldKey) {
          try {
            await deleteR2Object(oldKey);
          } catch (error: any) {
            console.error(
              `[GuildConfigs API] Failed to delete old welcome background ${oldKey}:`,
              error?.message || error,
            );
          }
        }
      }
    }

    // Off unless AUTOFIX_CHANNEL_ACCESS=true: it edits channel permissions in Discord.
    // Runs after the save and never throws, so it cannot fail the save itself.
    let permissionFix: Awaited<ReturnType<typeof autoGrantModuleChannels>> | undefined;
    const botToken = useRuntimeConfig().discordBotToken as string;
    if (
      process.env.AUTOFIX_CHANNEL_ACCESS === "true" &&
      botToken &&
      (body?.settings !== undefined || body?.enabled === true)
    ) {
      const fix = await autoGrantModuleChannels(
        {
          botToken,
          get: (url, headers) => $fetch(url, { headers }),
          request: (method, url, headers, reqBody) =>
            $fetch(url, { method, headers, body: reqBody as any }),
          configs: repos.guildConfigs,
          logs: repos.logs,
        },
        { guildId, userId: identity.userId },
        moduleName.toLowerCase(),
      );
      if (fix.applied.length > 0 || fix.blocked.length > 0) {
        permissionFix = fix;
        auditReportCache.delete(guildId);
      }
    }

    return {
      success: true,
      ...(bitrateClamped ? { bitrateClamped: true } : {}),
      ...(permissionFix ? { permissionFix } : {}),
    };
  } catch (error: any) {
    console.error(
      `[GuildConfigs API] put(${guildId}/${moduleName}) failed:`,
      error?.message || error,
    );
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to update guild config.",
    });
  }
});
