import type { BotModule, ModuleManager } from "../ModuleManager";
import { parseTwitchSyncSettings } from "@modus/db/twitch-sync";

/**
 * OAuth-based Twitch Role Sync. Each shard reconciles only its own guilds.
 * Verification, OAuth token handling and Discord role mutations are isolated
 * in the authenticated dashboard API; no access tokens enter the bot logs.
 */
const lastSyncByGuild = new Map<string, number>();
let sweeping = false;
async function sweep(manager: ModuleManager): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const baseUrl = (process.env.PUBLIC_WEB_URL || "").replace(/\/$/, "");
    const secret = process.env.BOT_API_SECRET;
    if (!baseUrl || !secret) return;
    for (const guild of manager.client.guilds.cache.values()) {
      try {
        if (!(await manager.databaseService.isModuleEnabled(guild.id, "twitch-sync"))) continue;
        const saved = await manager.databaseService.getModuleSettings(guild.id, "twitch-sync");
        const settings = parseTwitchSyncSettings(saved);
        if (!settings.channelLogin || !Object.values(settings.mappings).some(Boolean)) continue;
        const now = Date.now();
        if (now - (lastSyncByGuild.get(guild.id) || 0) < settings.syncIntervalMinutes * 60_000) continue;
        lastSyncByGuild.set(guild.id, now);
        const response = await fetch(baseUrl + "/api/twitch-sync/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + secret },
          body: JSON.stringify({ guildId: guild.id }),
          signal: AbortSignal.timeout(240_000),
        });
        if (!response.ok) throw new Error("Sync endpoint returned HTTP " + response.status);
        const result = await response.json() as Record<string, unknown>;
        manager.logger.info("Twitch Sync: " + JSON.stringify(result), guild.id, "twitch-sync");
      } catch (error) {
        manager.logger.error("Twitch Sync failed", guild.id, error, "twitch-sync");
      }
    }
  } finally {
    sweeping = false;
  }
}
function registerEvents(manager: ModuleManager): void {
  setTimeout(() => {
    void sweep(manager);
    setInterval(() => void sweep(manager), 5 * 60_000).unref();
  }, 60_000).unref();
}
const twitchSyncModule: BotModule = {
  name: "twitch-sync",
  description: "Sync authorized Twitch accounts to configurable Discord roles",
  meta: {
    displayName: "Twitch Role Sync",
    category: "community",
    icon: "i-lucide-radio-tower",
    color: "purple",
    tags: ["twitch", "subscriber", "vip", "moderator", "roles", "connections"],
  },
  registerEvents,
  execute: async () => undefined,
};

export default twitchSyncModule;
