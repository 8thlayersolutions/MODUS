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
