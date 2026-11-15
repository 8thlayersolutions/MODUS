import { describe, expect, it } from "vitest";
import { buildStreamWeek, normalizeStreamSchedule, shiftCalendarDate, validateStreamSchedule } from "./stream-schedule";
const sample = () => ({
 timezone:"America/Chicago",twitchChannel:"anxietyscout",public:true,
 weekly:[{id:"s1",weekday:0,time:"19:00",title:"Chaos SMP",game:"Minecraft",durationMinutes:120,imageUrl:"",url:""}],
 overrides:[]
});
describe("stream-schedule", () => {
 it("rejects unsafe URLs and invalid zones", () => {
  expect(validateStreamSchedule({...sample(),timezone:"Not/AZone"}).ok).toBe(false);
  expect(validateStreamSchedule({...sample(),weekly:[{...sample().weekly[0],url:"javascript:bad"}]}).ok).toBe(false);
 });
 it("converts local Sunday to UTC and links Twitch", () => {
  const week=buildStreamWeek(normalizeStreamSchedule(sample()),new Date("2026-11-14T18:00:00Z"));
  expect(week.startDate).toBe("2026-11-09");
  expect(week.days[6].streams[0].startsAt).toBe("2026-11-16T01:00:00.000Z");
  expect(week.days[6].streams[0].url).toBe("https://www.twitch.tv/anxietyscout");
 });
 it("cancels just one week",()=>{
  const s=normalizeStreamSchedule({...sample(),overrides:[{date:"2026-11-15",mode:"off",streams:[]}]});
  expect(buildStreamWeek(s,new Date("2026-11-14T18:00:00Z")).days[6].off).toBe(true);
  expect(buildStreamWeek(s,new Date("2026-11-14T18:00:00Z"),1).days[6].streams).toHaveLength(1);
 });
 it("handles month and year",()=>expect(shiftCalendarDate("2026-12-30",3)).toBe("2027-01-02"));
 it("adapts to daylight saving",()=>{
  const s=normalizeStreamSchedule({...sample(),weekly:[{...sample().weekly[0],weekday:1}]});
  expect(buildStreamWeek(s,new Date("2026-02-28T12:00:00Z"),1).days[0].streams[0].startsAt).toBe("2026-03-03T01:00:00.000Z");
  expect(buildStreamWeek(s,new Date("2026-03-14T12:00:00Z")).days[0].streams[0].startsAt).toBe("2026-03-17T00:00:00.000Z");
 });
});

describe("Discord schedule embed", () => {
  it("adds safe defaults for older guild settings", () => {
    const result = normalizeStreamSchedule(sample());
    expect(result.discord.channelId).toBe("");
    expect(result.discord.autoUpdate).toBe(true);
    expect(result.discord.showOffDays).toBe(true);
  });
  it("rejects invalid channel IDs and non-HTTPS banner images", () => {
    expect(validateStreamSchedule({ ...sample(), discord: { channelId: "other-guild" } }).ok).toBe(false);
    expect(validateStreamSchedule({ ...sample(), discord: { imageUrl: "javascript:alert(1)" } }).ok).toBe(false);
  });
  it("renders seven Discord day fields with local timestamp markup", async () => {
    const { buildDiscordStreamMessage } = await import("./stream-schedule");
    const settings = normalizeStreamSchedule(sample());
    const payload = buildDiscordStreamMessage(settings, new Date("2026-11-14T18:00:00Z"));
    expect(payload.embeds[0].fields).toHaveLength(7);
    expect(payload.embeds[0].fields[6].value).toContain("<t:1794790800:t>");
    expect(payload.allowed_mentions.parse).toEqual([]);
  });
  it("supports off-day hiding and custom appearance", async () => {
    const { buildDiscordStreamMessage } = await import("./stream-schedule");
    const settings = normalizeStreamSchedule({
      ...sample(),
      discord: {
        title: "CHAOS HQ WEEKLY",
        color: "#9A46FF",
        imageUrl: "https://example.com/image.png",
        showOffDays: false,
        inlineFields: true,
      },
    });
    const payload = buildDiscordStreamMessage(settings, new Date("2026-11-14T18:00:00Z"));
    expect(payload.embeds[0].title).toBe("CHAOS HQ WEEKLY");
    expect(payload.embeds[0].color).toBe(0x9A46FF);
    expect(payload.embeds[0].image?.url).toBe("https://example.com/image.png");
    expect(payload.embeds[0].fields).toHaveLength(1);
    expect(payload.embeds[0].fields[0].inline).toBe(true);
  });
  it("escapes mass mentions in stream titles", async () => {
    const { buildDiscordStreamMessage } = await import("./stream-schedule");
    const settings = normalizeStreamSchedule({
      ...sample(),
      weekly: [{ ...sample().weekly[0], title: "@everyone party" }],
    });
    const payload = buildDiscordStreamMessage(settings, new Date("2026-11-14T18:00:00Z"));
    expect(payload.embeds[0].fields[6].value).not.toContain("@everyone");
  });
});
