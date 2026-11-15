import { describe, expect, it } from "vitest";
import {
  TWITCH_ROLE_TYPES,
  defaultTwitchSyncSettings,
  parseTwitchSyncSettings,
  validateTwitchSyncSettings,
} from "./twitch-sync";

describe("Twitch Sync settings", () => {
  it("defaults every Twitch status to no role", () => {
    expect(Object.values(defaultTwitchSyncSettings().mappings)).toEqual(Array(TWITCH_ROLE_TYPES.length).fill(""));
  });
  it("covers all six Twitch roles", () => {
    for (const id of ["editor", "moderator", "leadModerator", "vip", "artist", "businessManager"]) {
      expect(TWITCH_ROLE_TYPES.some(r => r.id === id)).toBe(true);
    }
  });
  it("preserves user-selected target roles per status", () => {
    const role = "123456789012345678";
    const settings = parseTwitchSyncSettings({ mappings: { tier1: role, moderator: "987654321098765432" } });
    expect(settings.mappings.tier1).toBe(role);
    expect(settings.mappings.moderator).toBe("987654321098765432");
    expect(settings.mappings.tier2).toBe("");
  });
  it("rejects arbitrary target mappings and malformed IDs", () => {
    expect(validateTwitchSyncSettings({ mappings: { admin: "123456789012345678" } }).ok).toBe(false);
    expect(validateTwitchSyncSettings({ mappings: { vip: "not-a-role" } }).ok).toBe(false);
  });
  it("accepts a valid editable mapping", () => {
    const result = validateTwitchSyncSettings({
      channelLogin: "AnxietyScout",
      mappings: { tier3: "123456789012345678" },
      syncIntervalMinutes: 60,
      removeStaleRoles: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.mappings.tier3).toBe("123456789012345678");
  });
});
