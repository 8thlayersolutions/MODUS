/**
 * Recurring weekly creator schedule. Shared by Discord and the website.
 * No cron is necessary: every read materializes the current calendar week
 * in the configured IANA time zone, including daylight-saving transitions.
 */
export interface StreamSlot {
  id: string;
  weekday: number; // Sunday = 0
  time: string; // HH:mm local wall time
  title: string;
  game: string;
  durationMinutes: number;
  imageUrl: string;
  url: string;
}
export interface StreamOverride {
  date: string; // YYYY-MM-DD in schedule time zone
  mode: "off" | "replace";
  streams: Omit<StreamSlot, "weekday">[];
}
export interface StreamScheduleAppearance {
  accent: string; bg: string; fg: string; card: string; muted: string;
  layout: "grid" | "list";
  compact: boolean; showOff: boolean; header: boolean; images: boolean;
}
export const DEFAULT_SCHEDULE_APPEARANCE: StreamScheduleAppearance = {
  accent: "#a970ff", bg: "#0d0b1a", fg: "#ffffff", card: "#211b35",
  muted: "#b2a6c4", layout: "grid", compact: false,
  showOff: true, header: true, images: true,
};
export interface StreamScheduleSettings {
  appearance: StreamScheduleAppearance;
  title: string;
  description: string;
  timezone: string;
  weekStartsOn: 0 | 1;
  twitchChannel: string;
  public: boolean;
  weekly: StreamSlot[];
  overrides: StreamOverride[];
}
export interface ScheduledStream extends Omit<StreamSlot, "weekday"> {
  startsAt: string | null;
  endsAt: string | null;
}
export interface StreamDay {
  date: string;
  weekday: number;
  overridden: boolean;
  off: boolean;
  streams: ScheduledStream[];
}
export interface StreamWeek {
  startDate: string;
  endDate: string;
  days: StreamDay[];
}
export const DEFAULT_STREAM_SCHEDULE: StreamScheduleSettings = {
  title: "STREAM SCHEDULE",
  description: "",
  timezone: "America/Chicago",
  weekStartsOn: 1,
  twitchChannel: "",
  public: false,
  appearance: { ...DEFAULT_SCHEDULE_APPEARANCE },
  weekly: [],
  overrides: [],
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const wallTime = /^([01]\d|2[0-3]):[0-5]\d$/;
const httpsUrl = /^https:\/\/[^\s]+$/i;
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const stringField = (v: unknown, max: number, field: string): string => {
  if (typeof v !== "string" || v.length > max) throw new Error("Invalid " + field);
  return v.trim();
};
const validDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !isoDate.test(v)) return false;
  const d = new Date(v + "T12:00:00.000Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const validUrl = (v: unknown, field: string): string => {
  const s = stringField(v ?? "", 1000, field);
  if (s && !httpsUrl.test(s)) throw new Error(field + " must be an HTTPS URL");
  try {
    if (s && new URL(s).username) throw new Error("Invalid " + field);
  } catch {
    throw new Error("Invalid " + field);
  }
  return s;
};
const validZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};
function readSlot(v: unknown, weekday: number | null): StreamSlot {
  if (!isObject(v)) throw new Error("A stream must be an object");
  const id = stringField(v.id, 64, "stream ID");
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error("Invalid stream ID");
  const day = weekday === null ? v.weekday : weekday;
  if (!Number.isInteger(day) || Number(day) < 0 || Number(day) > 6) {
    throw new Error("Stream weekday must be 0-6");
  }
  const time = stringField(v.time, 5, "stream time");
  if (!wallTime.test(time)) throw new Error("Use HH:mm for stream time");
  const title = stringField(v.title, 120, "stream title");
  if (!title) throw new Error("Each stream needs a title");
  const game = stringField(v.game ?? "", 80, "game");
  const duration = v.durationMinutes ?? 120;
  if (!Number.isInteger(duration) || Number(duration) < 15 || Number(duration) > 1440) {
    throw new Error("Stream duration must be 15-1440 minutes");
  }
  return {
    id, weekday: Number(day), time, title, game,
    durationMinutes: Number(duration),
    imageUrl: validUrl(v.imageUrl, "image URL"),
    url: validUrl(v.url, "stream URL"),
  };
}
export function validateStreamSchedule(input: unknown):
  | { ok: true; settings: StreamScheduleSettings }
  | { ok: false; error: string } {
  try {
    if (!isObject(input)) throw new Error("Schedule settings must be an object");
    const title = stringField(input.title ?? DEFAULT_STREAM_SCHEDULE.title, 100, "schedule title");
    const description = stringField(input.description ?? "", 400, "description");
    const timezone = stringField(input.timezone ?? "America/Chicago", 80, "timezone");
    if (!validZone(timezone)) throw new Error("Use a valid IANA timezone (e.g. America/Chicago)");
    const weekStartsOn = input.weekStartsOn ?? 1;
    if (weekStartsOn !== 0 && weekStartsOn !== 1) throw new Error("Invalid week start");
    const twitchChannel = stringField(input.twitchChannel ?? "", 25, "Twitch channel");
    if (twitchChannel && !/^[A-Za-z0-9_]{3,25}$/.test(twitchChannel)) {
      throw new Error("Invalid Twitch channel name");
    }
    const publish = input.public ?? false;
    if (typeof publish !== "boolean") throw new Error("Public must be a boolean");
    const rawAppearance = input.appearance ?? {};
    if (!isObject(rawAppearance)) throw new Error("Invalid appearance");
    const appearance = { ...DEFAULT_SCHEDULE_APPEARANCE };
    for (const key of ["accent", "bg", "fg", "card", "muted"] as const) {
      const value = rawAppearance[key] ?? appearance[key];
      if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
        throw new Error("Invalid theme color: " + key);
      }
      appearance[key] = value;
    }
    const layout = rawAppearance.layout ?? "grid";
    if (layout !== "grid" && layout !== "list") throw new Error("Invalid layout");
    appearance.layout = layout;
    for (const key of ["compact", "showOff", "header", "images"] as const) {
      const value = rawAppearance[key] ?? appearance[key];
      if (typeof value !== "boolean") throw new Error("Invalid appearance flag " + key);
      appearance[key] = value;
    }
    const rawWeekly = input.weekly ?? [];
    const rawOverrides = input.overrides ?? [];
    if (!Array.isArray(rawWeekly) || rawWeekly.length > 35) throw new Error("Up to 35 weekly streams allowed");
    if (!Array.isArray(rawOverrides) || rawOverrides.length > 90) throw new Error("Up to 90 date overrides allowed");
    const weekly = rawWeekly.map((item) => readSlot(item, null));
    const ids = new Set(weekly.map((s) => s.id));
    if (ids.size !== weekly.length) throw new Error("Weekly stream IDs must be unique");
    const dates = new Set<string>();
    const overrides: StreamOverride[] = rawOverrides.map((v) => {
      if (!isObject(v) || !validDate(v.date)) throw new Error("Invalid override date");
      if (dates.has(v.date)) throw new Error("Only one override is allowed per date");
      dates.add(v.date);
      if (v.mode !== "off" && v.mode !== "replace") throw new Error("Invalid override mode");
      if (!Array.isArray(v.streams) || v.streams.length > 8) throw new Error("Up to 8 streams per override");
      const streams = v.mode === "off" ? [] : v.streams.map((s) => {
        const slot = readSlot(s, 0);
        const { weekday: _unused, ...rest } = slot;
        return rest;
      });
      if (new Set(streams.map((s) => s.id)).size !== streams.length) {
        throw new Error("Override stream IDs must be unique per day");
      }
      return { date: v.date as string, mode: v.mode as "off" | "replace", streams };
    });
    return { ok: true, settings: { title, description, timezone, weekStartsOn, twitchChannel, public: publish, appearance, weekly, overrides } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Invalid schedule" };
  }
}
export function normalizeStreamSchedule(input: unknown): StreamScheduleSettings {
  const validated = validateStreamSchedule(input);
  return validated.ok ? validated.settings : { ...DEFAULT_STREAM_SCHEDULE, appearance: { ...DEFAULT_SCHEDULE_APPEARANCE }, weekly: [], overrides: [] };
}
export function shiftCalendarDate(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function parts(instant: Date, zone: string): { year: number; month: number; day: number; hour: number; minute: number } {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => Number(values.find((x) => x.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}
function localDate(instant: Date, zone: string): string {
  const p = parts(instant, zone);
  return [p.year, String(p.month).padStart(2, "0"), String(p.day).padStart(2, "0")].join("-");
}
function toInstant(date: string, time: string, zone: string): Date | null {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = parts(new Date(guess), zone);
    const observed = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const delta = target - observed;
    if (delta === 0) return new Date(guess);
    guess += delta;
  }
  // Nonexistent local clock hour during the spring DST transition.
  return null;
}
export function buildStreamWeek(settings: StreamScheduleSettings, now = new Date(), offset = 0): StreamWeek {
  const today = localDate(now, settings.timezone);
  const weekDay = new Date(today + "T12:00:00Z").getUTCDay();
  const back = (weekDay - settings.weekStartsOn + 7) % 7;
  const startDate = shiftCalendarDate(today, -back + (Math.max(0, Math.min(12, Math.floor(offset))) * 7));
  const overrideByDate = new Map(settings.overrides.map((o) => [o.date, o]));
  const days: StreamDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = shiftCalendarDate(startDate, i);
    const weekday = new Date(date + "T12:00:00Z").getUTCDay();
    const override = overrideByDate.get(date);
    const streams = override
      ? (override.mode === "off" ? [] : override.streams)
      : settings.weekly.filter((s) => s.weekday === weekday);
    const resolved: ScheduledStream[] = [...streams].sort((a, b) => a.time.localeCompare(b.time)).map((s) => {
      const start = toInstant(date, s.time, settings.timezone);
      const end = start ? new Date(start.getTime() + s.durationMinutes * 60000) : null;
      return {
        id: s.id, time: s.time, title: s.title, game: s.game,
        durationMinutes: s.durationMinutes, imageUrl: s.imageUrl,
        url: s.url || (settings.twitchChannel ? "https://www.twitch.tv/" + settings.twitchChannel : ""),
        startsAt: start ? start.toISOString() : null,
        endsAt: end ? end.toISOString() : null,
      };
    });
    return { date, weekday, overridden: Boolean(override), off: resolved.length === 0, streams: resolved };
  });
  return { startDate, endDate: days[6].date, days };
}
