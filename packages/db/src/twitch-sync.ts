/**
 * Twitch status -> Discord role mappings, shared by the dashboard and bot.
 * Status IDs are stable and never refer to specific guild role names.
 */
export const TWITCH_ROLE_TYPES = [
  { id: "connected", label: "Twitch Connected", description: "Verified Discord-linked Twitch account", automatic: true },
  { id: "broadcaster", label: "Broadcaster / Owner", description: "Owner of the configured Twitch channel", automatic: true },
  { id: "editor", label: "Channel Editor", description: "Editor for the broadcaster's channel", automatic: true },
  { id: "moderator", label: "Twitch Moderator", description: "Includes regular and Lead Moderators", automatic: true },
  { id: "leadModerator", label: "Lead Moderator", description: "No separate public API lookup; included in Moderator status", automatic: false },
  { id: "vip", label: "Twitch VIP", description: "VIP in the broadcaster's channel", automatic: true },
  { id: "artist", label: "Artist", description: "No documented public Twitch role lookup", automatic: false },
  { id: "businessManager", label: "Business Manager", description: "No documented public Twitch role lookup", automatic: false },
  { id: "follower", label: "Follower", description: "Follows the configured Twitch channel", automatic: true },
  { id: "subscriber", label: "Any Subscriber", description: "Active subscription at any tier", automatic: true },
  { id: "tier1", label: "Tier 1 Subscriber", description: "Active Tier 1 subscription", automatic: true },
  { id: "tier2", label: "Tier 2 Subscriber", description: "Active Tier 2 subscription", automatic: true },
  { id: "tier3", label: "Tier 3 Subscriber", description: "Active Tier 3 subscription", automatic: true },
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
  editor: "", broadcaster: "", leadModerator: "", artist: "", businessManager: "",
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


/** Pure policy layer: only API-verifiable statuses may confer automatic roles. */
export function planTwitchRoleChanges(input: {
  settings: TwitchSyncSettings;
  verifiedStatuses: ReadonlySet<string>;
  grantableRoleIds: ReadonlySet<string>;
  heldRoleIds: ReadonlySet<string>;
  recordedGrantRoleIds: ReadonlySet<string>;
}): { desired: string[]; toGrant: string[]; toRevoke: string[] } {
  const desired = [...new Set(TWITCH_ROLE_TYPES
    .filter(type => type.automatic && input.verifiedStatuses.has(type.id))
    .map(type => input.settings.mappings[type.id])
    .filter(roleId => !!roleId && input.grantableRoleIds.has(roleId)))];
  const desiredSet = new Set(desired);
  return {
    desired,
    toGrant: desired.filter(roleId => !input.heldRoleIds.has(roleId)),
    // Revocation is restricted to IDs recorded when MODUS itself assigned the role.
    toRevoke: input.settings.removeStaleRoles
      ? [...input.recordedGrantRoleIds].filter(roleId =>
        !desiredSet.has(roleId) && input.grantableRoleIds.has(roleId))
      : [],
  };
}
