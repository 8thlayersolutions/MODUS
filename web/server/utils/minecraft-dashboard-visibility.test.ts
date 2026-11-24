import { describe, expect, it } from "vitest";
import { sanitizeAuditState } from "./admin-audit/redaction";
import { requiresReason } from "./admin-audit/policy";
import {
  DEFAULT_MINECRAFT_GUILD_ID,
  minecraftVisibleInGuild,
  normalizedMinecraftDashboardConfig,
  parseMinecraftDashboardUpdate,
  readMinecraftDashboardVisibility,
} from "./minecraft-dashboard-visibility";

const GUILD_2 = "123456789012345678";

describe("Minecraft dashboard guild visibility settings", () => {
  it("preserves CHAOS HQ visibility until an admin explicitly saves changes", () => {
    const config = normalizedMinecraftDashboardConfig({});
    expect(config).toEqual({
      enabled: true,
      allowedGuildIds: [DEFAULT_MINECRAFT_GUILD_ID],
    });
    expect(minecraftVisibleInGuild(config, DEFAULT_MINECRAFT_GUILD_ID)).toBe(true);
    expect(minecraftVisibleInGuild(config, GUILD_2)).toBe(false);
  });

  it("allows only the explicitly listed guild IDs", () => {
    const config = parseMinecraftDashboardUpdate({
      enabled: true,
      allowedGuildIds: [GUILD_2, GUILD_2],
    });
    expect(config.allowedGuildIds).toEqual([GUILD_2]);
    expect(minecraftVisibleInGuild(config, GUILD_2)).toBe(true);
    expect(minecraftVisibleInGuild(config, DEFAULT_MINECRAFT_GUILD_ID)).toBe(false);
  });

  it("disabling or clearing all IDs hides the portal in every guild", () => {
    expect(minecraftVisibleInGuild(
      parseMinecraftDashboardUpdate({ enabled: false, allowedGuildIds: [DEFAULT_MINECRAFT_GUILD_ID] }),
      DEFAULT_MINECRAFT_GUILD_ID,
    )).toBe(false);
    expect(minecraftVisibleInGuild(
      parseMinecraftDashboardUpdate({ enabled: true, allowedGuildIds: [] }),
      DEFAULT_MINECRAFT_GUILD_ID,
    )).toBe(false);
  });

  it("rejects malformed Discord IDs and oversized lists", () => {
    expect(() => parseMinecraftDashboardUpdate({ enabled: true, allowedGuildIds: ["not-a-guild"] })).toThrow();
    expect(() => parseMinecraftDashboardUpdate({ enabled: true, allowedGuildIds: ["123"] })).toThrow();
    expect(() => parseMinecraftDashboardUpdate({ enabled: "true", allowedGuildIds: [] })).toThrow();
    expect(() => parseMinecraftDashboardUpdate({
      enabled: true,
      allowedGuildIds: Array.from({ length: 51 }, () => DEFAULT_MINECRAFT_GUILD_ID),
    })).toThrow();
  });

  it("requires an audit reason and records only safe guild visibility state", () => {
    const before = { enabled: true, allowedGuildIds: [DEFAULT_MINECRAFT_GUILD_ID] };
    const after = { enabled: true, allowedGuildIds: [GUILD_2] };
    expect(requiresReason("minecraft.updated", before, after)).toBe(true);
    expect(sanitizeAuditState("minecraft", after)).toEqual(after);
  });

  it("reads persisted global config instead of substituting the default", async () => {
    const getModuleSettings = async () => ({
      enabled: true,
      allowedGuildIds: [GUILD_2],
    });
    const config = await readMinecraftDashboardVisibility({
      guildConfigs: { getModuleSettings },
    } as any);
    expect(config.allowedGuildIds).toEqual([GUILD_2]);
    expect(minecraftVisibleInGuild(config, DEFAULT_MINECRAFT_GUILD_ID)).toBe(false);
  });
});
