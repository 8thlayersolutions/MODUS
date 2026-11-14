/**
 * Twitch status -> Discord role mappings, shared by the dashboard and bot.
 * Status IDs are stable and never refer to specific guild role names.
 */
export const TWITCH_ROLE_TYPES = [
  { id: "connected", label: "Twitch Connected", description: "Verified linked Twitch account" },
  { id: "follower", label: "Follower", description: "Follows the configured Twitch channel" },
  { id: "subscriber", label: "Any Subscriber", description: "Active subscription at any tier" },
  { id: "tier1", label: "Tier 1 Subscriber", description: "Active Tier 1 subscription" },
  { id: "tier2", label: "Tier 2 Subscriber", description: "Active Tier 2 subscription" },
  { id: "tier3", label: "Tier 3 Subscriber", description: "Active Tier 3 subscription" },
  { id: "vip", label: "Twitch VIP", description: "VIP in the broadcaster's channel" },
  { id: "moderator", label: "Twitch Moderator", description: "Moderator in the broadcaster's channel" },
] as const;

export type TwitchRoleType = (typeof TWITCH_ROLE_TYPES)[number]["id"];
export type TwitchRoleMappings = Record<TwitchRoleType, string>;
export type TwitchSyncInterval = 15 | 30 | 60 | 360;

export interface TwitchSyncSettings {
  channelLogin: string;
  mappings: TwitchRoleMappings;
  syncIntervalMinutes: TwitchSyncInterval;
  removeStaleRoles: boolean;
}

const EMPTY_MAPPINGS: TwitchRoleMappings = {
  connected: "", follower: "", subscriber: "", tier1: "",
  tier2: "", tier3: "", vip: "", moderator: "",
};

const INTERVALS = [15, 30, 60, 360] as const;
const ROLE_TYPES = new Set<string>(TWITCH_ROLE_TYPES.map((type) => type.id));
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function defaultTwitchSyncSettings(): TwitchSyncSettings {
  return {
    channelLogin: "",
    mappings: { ...EMPTY_MAPPINGS },
    syncIntervalMinutes: 30,
    removeStaleRoles: true,
  };
}

/** For loading older or incomplete settings without losing stable mapping keys. */
export function parseTwitchSyncSettings(input: unknown): TwitchSyncSettings {
  const defaults = defaultTwitchSyncSettings();
  if (!isObject(input)) return defaults;
  const mappings = isObject(input.mappings) ? input.mappings : {};
  for (const type of TWITCH_ROLE_TYPES) {
    if (typeof mappings[type.id] === "string") {
      defaults.mappings[type.id] = mappings[type.id] as string;
    }
  }
  if (typeof input.channelLogin === "string") defaults.channelLogin = input.channelLogin;
  if (INTERVALS.includes(input.syncIntervalMinutes as TwitchSyncInterval)) {
    defaults.syncIntervalMinutes = input.syncIntervalMinutes as TwitchSyncInterval;
  }
  if (typeof input.removeStaleRoles === "boolean") {
    defaults.removeStaleRoles = input.removeStaleRoles;
  }
  return defaults;
}

export function validateTwitchSyncSettings(input: unknown):
  | { ok: true; settings: TwitchSyncSettings }
  | { ok: false; error: string } {
  if (!isObject(input)) return { ok: false, error: "Invalid Twitch Sync settings." };
  if (input.channelLogin !== undefined &&
      (typeof input.channelLogin !== "string" || !/^[a-zA-Z0-9_]{0,25}$/.test(input.channelLogin))) {
    return { ok: false, error: "Twitch channel must be a valid username (up to 25 characters)." };
  }
  if (input.mappings !== undefined && !isObject(input.mappings)) {
    return { ok: false, error: "Role mappings must be an object." };
  }
  if (isObject(input.mappings)) {
    for (const [status, roleId] of Object.entries(input.mappings)) {
      if (!ROLE_TYPES.has(status)) return { ok: false, error: "Unknown Twitch status: " + status };
      if (typeof roleId !== "string" || (roleId !== "" && !/^\d{15,22}$/.test(roleId))) {
        return { ok: false, error: "Invalid Discord role ID for " + status };
      }
    }
  }
  if (input.syncIntervalMinutes !== undefined &&
      !INTERVALS.includes(input.syncIntervalMinutes as TwitchSyncInterval)) {
    return { ok: false, error: "Unsupported sync interval." };
  }
  if (input.removeStaleRoles !== undefined && typeof input.removeStaleRoles !== "boolean") {
    return { ok: false, error: "Remove expired roles must be true or false." };
  }
  return { ok: true, settings: parseTwitchSyncSettings(input) };
}
