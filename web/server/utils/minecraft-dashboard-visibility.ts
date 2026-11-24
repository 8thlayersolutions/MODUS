/**
 * Global visibility configuration for the CHAOS SMP member dashboard.
 * Stored in guild_configs under the existing __global__ sentinel; no
 * database schema migration is required.
 */
import type { GuildConfigRepository } from "@modus/db";

export const MINECRAFT_VISIBILITY_GUILD = "__global__";
export const MINECRAFT_VISIBILITY_MODULE = "minecraft_dashboard_visibility";
export const DEFAULT_MINECRAFT_GUILD_ID = "978327073196232704";
export const MAX_MINECRAFT_GUILDS = 50;

export interface MinecraftDashboardVisibility {
  enabled: boolean;
  allowedGuildIds: string[];
}

export const DEFAULT_MINECRAFT_VISIBILITY: MinecraftDashboardVisibility = {
  enabled: true,
  allowedGuildIds: [DEFAULT_MINECRAFT_GUILD_ID],
};

export function validGuildId(value: unknown): value is string {
  return typeof value === "string" && /^\d{17,22}$/.test(value);
}

export function parseMinecraftDashboardUpdate(input: unknown): MinecraftDashboardVisibility {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("A JSON settings object is required.");
  }
  const raw = input as Record<string, unknown>;
  if (typeof raw.enabled !== "boolean") {
    throw new Error("Enabled must be true or false.");
  }
  if (!Array.isArray(raw.allowedGuildIds) || raw.allowedGuildIds.length > MAX_MINECRAFT_GUILDS) {
    throw new Error("Provide an array of up to 50 Discord Guild IDs.");
  }
  if (!raw.allowedGuildIds.every(validGuildId)) {
    throw new Error("Every Guild ID must be 17–22 numeric digits.");
  }
  return {
    enabled: raw.enabled,
    allowedGuildIds: [...new Set(raw.allowedGuildIds)],
  };
}

export function normalizedMinecraftDashboardConfig(value: unknown): MinecraftDashboardVisibility {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length === 0) {
    return { ...DEFAULT_MINECRAFT_VISIBILITY, allowedGuildIds: [...DEFAULT_MINECRAFT_VISIBILITY.allowedGuildIds] };
  }
  const raw = value as Record<string, unknown>;
  return {
    enabled: raw.enabled === true,
    allowedGuildIds: Array.isArray(raw.allowedGuildIds)
      ? [...new Set(raw.allowedGuildIds.filter(validGuildId))].slice(0, MAX_MINECRAFT_GUILDS)
      : [],
  };
}

export async function readMinecraftDashboardVisibility(
  repos: { guildConfigs: Pick<GuildConfigRepository, "getModuleSettings"> },
): Promise<MinecraftDashboardVisibility> {
  const raw = await repos.guildConfigs.getModuleSettings(
    MINECRAFT_VISIBILITY_GUILD,
    MINECRAFT_VISIBILITY_MODULE,
  );
  return normalizedMinecraftDashboardConfig(raw);
}

export function minecraftVisibleInGuild(
  config: MinecraftDashboardVisibility,
  guildId: string,
): boolean {
  return config.enabled && validGuildId(guildId) && config.allowedGuildIds.includes(guildId);
}
