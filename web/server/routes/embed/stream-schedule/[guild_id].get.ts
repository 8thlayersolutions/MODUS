import { buildStreamWeek, normalizeStreamSchedule } from "@modus/db/stream-schedule";
import { getRepos } from "../../../utils/db";

const esc = (value: unknown): string => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const color = (input: unknown, fallback: string): string =>
  typeof input === "string" && /^#[0-9a-fA-F]{6}$/.test(input) ? input : fallback;
const weekday = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const displayTime = (time: string): string => {
  const [h, m] = time.split(":").map(Number);
  return (h % 12 || 12) + ":" + String(m).padStart(2, "0") + (h >= 12 ? " PM" : " AM");
};
const flag = (v: unknown, fallback: boolean): boolean =>
  v === undefined ? fallback : v === "1" || v === "true";

export default defineEventHandler(async (event) => {
  const guildId = getRouterParam(event, "guild_id") || "";
  if (!/^\d{16,22}$/.test(guildId)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid Discord server ID" });
  }
  const query = getQuery(event);
  const weekOffset = Number(query.week ?? 0);
  if (!Number.isInteger(weekOffset) || weekOffset < 0 || weekOffset > 12) {
    throw createError({ statusCode: 400, statusMessage: "Invalid week offset" });
  }
  const repos = getRepos();
  if (!repos) throw createError({ statusCode: 503, statusMessage: "Database unavailable" });
  const [enabled, saved] = await Promise.all([
    repos.guildConfigs.isModuleEnabled(guildId, "stream-schedule"),
    repos.guildConfigs.getModuleSettings(guildId, "stream-schedule"),
  ]);
  const settings = normalizeStreamSchedule(saved);
  if (!enabled || !settings.public) {
    throw createError({ statusCode: 404, statusMessage: "Schedule not published" });
  }
  const theme = {
    accent: color(query.accent, settings.appearance.accent),
    bg: color(query.bg, settings.appearance.bg),
    fg: color(query.fg, settings.appearance.fg),
    card: color(query.card, settings.appearance.card),
    muted: color(query.muted, settings.appearance.muted),
  };
  const compact = flag(query.compact, settings.appearance.compact);
  const showOff = flag(query.showOff, settings.appearance.showOff);
  const showHeader = flag(query.header, settings.appearance.header);
  const showImages = flag(query.images, settings.appearance.images);
  const layout = query.layout === "list" || (query.layout !== "grid" && settings.appearance.layout === "list") ? "list" : "grid";
  const result = buildStreamWeek(settings, new Date(), weekOffset);
  const days = showOff ? result.days : result.days.filter((d) => !d.off);
  const dayCards = days.map((day) => {
    const items = day.streams.map((s) => {
      const image = showImages && s.imageUrl
        ? '<img class="poster" loading="lazy" alt="" src="' + esc(s.imageUrl) + '">' : "";
      const label = '<div class="time">' + esc(displayTime(s.time)) + '</div>' +
        '<div class="stream-title">' + esc(s.title) + '</div>' +
        (s.game ? '<div class="game">' + esc(s.game) + '</div>' : "");
      return '<div class="stream">' + (s.url
        ? '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + image + label + '</a>'
        : image + label) + '</div>';
    }).join("");
    return '<article class="day">' +
      '<div class="day-label"><b>' + weekday[day.weekday] + '</b><span>' + esc(day.date.slice(5)) + '</span></div>' +
      (items || '<div class="off">NO STREAM</div>') + "</article>";
  }).join("");
  // Preserve the validated display preferences while changing calendar week.
  const navQuery = new URLSearchParams();
  for (const key of ["accent", "bg", "fg", "card", "muted", "compact", "showOff", "header", "images", "layout"]) {
    const v = query[key];
    if (typeof v === "string") navQuery.set(key, v);
  }
  const nav = (n: number): string => {
    const p = new URLSearchParams(navQuery);
    p.set("week", String(n));
    return "?" + p.toString();
  };
  const links = '<nav aria-label="Choose schedule week">' +
    (weekOffset > 0 ? '<a href="' + esc(nav(weekOffset - 1)) + '">← Previous</a>' : '<span></span>') +
    '<span>' + esc(result.startDate) + ' — ' + esc(result.endDate) + '</span>' +
    (weekOffset < 12 ? '<a href="' + esc(nav(weekOffset + 1)) + '">Next →</a>' : '<span></span>') + '</nav>';
  const title = esc(settings.title);
  const css = ':root{--bg:' + theme.bg + ';--fg:' + theme.fg + ';--accent:' + theme.accent +
    ';--card:' + theme.card + ';--muted:' + theme.muted + ';}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:inherit;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:' + (compact ? ".65rem" : "1.4rem") + ';}' +
    'header{text-align:center;margin:0 0 1.2rem}h1{font-size:clamp(1.3rem,3vw,2rem);letter-spacing:.13em;margin:0;color:var(--fg)}' +
    'header p{color:var(--muted);font-size:.9rem;margin:.4rem 0 0}' +
    'nav{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin:0 0 1.3rem;font-size:.8rem;color:var(--muted);text-align:center}' +
    'nav a{color:var(--accent);text-decoration:none;white-space:nowrap}nav a:hover{text-decoration:underline}' +
    '.week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.55rem}' +
    '.day{border-radius:.8rem;background:var(--card);overflow:hidden;min-height:9rem;border:1px solid color-mix(in srgb,var(--accent) 18%,transparent)}' +
    '.day-label{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.3rem;padding:.7rem .65rem;background:color-mix(in srgb,var(--accent) 18%,transparent);font-size:.75rem;letter-spacing:.09em}' +
    '.day-label b{color:var(--fg)}.day-label span{font-size:.72rem;color:var(--muted)}' +
    '.stream{padding:.6rem;border-bottom:1px solid color-mix(in srgb,var(--accent) 13%,transparent)}' +
    '.stream:last-child{border-bottom:0}.stream a{color:inherit;text-decoration:none}.stream a:hover .stream-title{color:var(--accent)}' +
    '.poster{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:.4rem;display:block;margin-bottom:.6rem}' +
    '.time{font-weight:750;color:var(--accent);font-size:.73rem}.stream-title{font-size:.86rem;font-weight:700;margin:.35rem 0;overflow-wrap:anywhere}' +
    '.game,.off{font-size:.75rem;color:var(--muted)}.off{padding:1.3rem .6rem;text-align:center;letter-spacing:.1em}' +
    'footer{font-size:.73rem;color:var(--muted);text-align:center;margin:1.15rem 0 .25rem}' +
    '@media(max-width:1024px){.week{grid-template-columns:repeat(4,minmax(0,1fr))}}' +
    '@media(max-width:650px){.week{grid-template-columns:repeat(2,minmax(0,1fr))}body{padding:.7rem}}' +
    '@media(max-width:380px){.week{grid-template-columns:1fr}}' +
    (layout === "list" ? '.week{display:flex;flex-direction:column}.day{min-height:0}.stream{display:block}.poster{max-width:20rem}' : '');
  const document = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="300">' +
    '<title>' + title + '</title><style>' + css + '</style></head><body>' +
    (showHeader ? '<header><h1>' + title + '</h1>' +
      (settings.description ? '<p>' + esc(settings.description) + '</p>' : "") + '</header>' : "") +
    links + '<main class="week">' + (dayCards || '<p>No streams listed.</p>') + '</main>' +
    '<footer>Times shown in ' + esc(settings.timezone) + ' · Automatically refreshed every 5 minutes</footer>' +
    '</body></html>';
  setHeader(event, "Content-Type", "text/html; charset=utf-8");
  setHeader(event, "Cache-Control", "public, max-age=60");
  setHeader(event, "Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; frame-ancestors *; base-uri 'none'; form-action 'none'");
  setHeader(event, "X-Content-Type-Options", "nosniff");
  return document;
});
