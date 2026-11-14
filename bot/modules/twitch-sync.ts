import type { BotModule } from "../ModuleManager";

/**
 * Registers the Twitch Sync settings surface. Actual Discord Connections OAuth,
 * broadcaster authentication, and synchronization worker are a separate
 * integration step; do not grant or revoke roles based on unverified settings.
 */
const twitchSyncModule: BotModule = {
  name: "twitch-sync",
  description: "Configure Twitch status to Discord role mappings (verification and automatic syncing not yet connected)",
  meta: {
    displayName: "Twitch Role Sync",
    category: "community",
    icon: "i-lucide-radio-tower",
    color: "purple",
    tags: ["twitch", "subscriber", "vip", "moderator", "roles", "connections"],
  },
  execute: async () => undefined,
};

export default twitchSyncModule;
