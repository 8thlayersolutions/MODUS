import { describe, expect, it } from "vitest";
import { twitchOAuthConnectPath } from "./twitch-oauth-navigation";

const GUILD_ID = "123456789012345678";

describe("Twitch OAuth URLs", () => {
  it("includes the current Discord guild ID for broadcaster authorization", () => {
    expect(twitchOAuthConnectPath("broadcaster", GUILD_ID)).toBe(
      "/api/twitch-sync/broadcaster/connect?guild_id=123456789012345678",
    );
  });
  it("includes the current Discord guild ID for member authorization", () => {
    expect(twitchOAuthConnectPath("member", GUILD_ID)).toBe(
      "/api/twitch-sync/member/connect?guild_id=123456789012345678",
    );
  });
  it("preserves member disconnect action during full-page authorization", () => {
    expect(twitchOAuthConnectPath("member", GUILD_ID, "disconnect")).toBe(
      "/api/twitch-sync/member/connect?guild_id=123456789012345678&action=disconnect",
    );
  });
  it("never launches OAuth without a valid guild ID", () => {
    expect(() => twitchOAuthConnectPath("broadcaster", "")).toThrow(/guild ID/);
    expect(() => twitchOAuthConnectPath("member", "undefined")).toThrow(/guild ID/);
    expect(() => twitchOAuthConnectPath("member", "123")).toThrow(/guild ID/);
  });
  it("cannot disconnect the broadcaster through the member revoke flow", () => {
    expect(() => twitchOAuthConnectPath("broadcaster", GUILD_ID, "disconnect")).toThrow(/member/);
  });
});
