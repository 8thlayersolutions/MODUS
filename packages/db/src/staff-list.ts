/** Shared staff directory settings and safe, presentation-only helpers. */
export interface StaffGroup {
  id: string;
  title: string;
  description: string;
  roleIds: string[];
  memberIds: string[];
}

export interface StaffListSettings {
  title: string;
  description: string;
  groups: StaffGroup[];
  publicEnabled: boolean;
  showAvatars: boolean;
  showRoleBadges: boolean;
  layout: "cards" | "list";
  accentColor: string;
  backgroundColor: string;
  cardColor: string;
  textColor: string;
  websiteUrl: string;
  buttonText: string;
  publishedChannelId: string | null;
  publishedMessageId: string | null;
}

export interface StaffRole {
  id: string;
  name: string;
  color: number;
}
export interface StaffMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  roleIds: string[];
  bot?: boolean;
}
export interface StaffPerson extends StaffMember {
  badges: StaffRole[];
}
export interface StaffSection extends StaffGroup {
  members: StaffPerson[];
}

const snowflake = /^\d{16,22}$/;
const hexColor = /^#[0-9a-f]{6}$/i;
const defaults: StaffListSettings = {
  title: "Meet Our Staff",
  description: "The team keeping our community safe, welcoming, and fun.",
  groups: [
    { id: "ownership", title: "Ownership Team", description: "Community leadership and events.", roleIds: [], memberIds: [] },
    { id: "developers", title: "Discord Developers", description: "The people building our community.", roleIds: [], memberIds: [] },
    { id: "admins", title: "Discord Admins", description: "Keeping the server running smoothly.", roleIds: [], memberIds: [] },
    { id: "twitch-mods", title: "Twitch Moderators", description: "Keeping our streams welcoming.", roleIds: [], memberIds: [] },
    { id: "editors", title: "Twitch Editors", description: "VODs, titles, and stream content.", roleIds: [], memberIds: [] },
    { id: "discord-mods", title: "Discord Moderators", description: "Helping members and moderating chat.", roleIds: [], memberIds: [] },
  ],
  publicEnabled: false,
  showAvatars: true,
  showRoleBadges: true,
  layout: "cards",
  accentColor: "#a855f7",
  backgroundColor: "#0b0b12",
  cardColor: "#171720",
  textColor: "#f1f1f5",
  websiteUrl: "",
  buttonText: "Visit the website",
  publishedChannelId: null,
  publishedMessageId: null,
};

export function defaultStaffListSettings(): StaffListSettings {
  return JSON.parse(JSON.stringify(defaults));
}

function text(value: unknown, fallback: string, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}
function ids(value: unknown, max: number): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string" && snowflake.test(item)))].slice(0, max)
    : [];
}
function color(value: unknown, fallback: string): string {
  return typeof value === "string" && hexColor.test(value) ? value : fallback;
}
function safeUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

/** Use at every public boundary; never trust saved JSON to be well-formed. */
export function parseStaffListSettings(input: unknown): StaffListSettings {
  const raw = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown> : {};
  const groups = Array.isArray(raw.groups)
    ? raw.groups.slice(0, 15).map((entry, index): StaffGroup => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return {
        id: text(item.id, "group-" + index, 50).replace(/[^a-zA-Z0-9_-]/g, "") || "group-" + index,
        title: text(item.title, "Team " + (index + 1), 80) || "Team " + (index + 1),
        description: text(item.description, "", 300),
        roleIds: ids(item.roleIds, 10),
        memberIds: ids(item.memberIds, 60),
      };
    }) : defaultStaffListSettings().groups;

  return {
    title: text(raw.title, defaults.title, 180) || defaults.title,
    description: text(raw.description, defaults.description, 1000),
    groups,
    publicEnabled: raw.publicEnabled === true,
    showAvatars: raw.showAvatars !== false,
    showRoleBadges: raw.showRoleBadges !== false,
    layout: raw.layout === "list" ? "list" : "cards",
    accentColor: color(raw.accentColor, defaults.accentColor),
    backgroundColor: color(raw.backgroundColor, defaults.backgroundColor),
    cardColor: color(raw.cardColor, defaults.cardColor),
    textColor: color(raw.textColor, defaults.textColor),
    websiteUrl: safeUrl(raw.websiteUrl),
    buttonText: text(raw.buttonText, defaults.buttonText, 80) || defaults.buttonText,
    publishedChannelId: typeof raw.publishedChannelId === "string" && snowflake.test(raw.publishedChannelId) ? raw.publishedChannelId : null,
    publishedMessageId: typeof raw.publishedMessageId === "string" && snowflake.test(raw.publishedMessageId) ? raw.publishedMessageId : null,
  };
}

export function buildStaffSections(
  settings: StaffListSettings,
  members: StaffMember[],
  roles: StaffRole[],
): StaffSection[] {
  const roleMap = new Map(roles.map(role => [role.id, role]));
  const memberMap = new Map(members.filter(member => !member.bot).map(member => [member.id, member]));
  return settings.groups.map(group => {
    const chosen = new Map<string, StaffMember>();
    for (const id of group.memberIds) {
      const member = memberMap.get(id);
      if (member) chosen.set(id, member);
    }
    for (const member of members) {
      if (!member.bot && group.roleIds.some(roleId => member.roleIds.includes(roleId))) {
        chosen.set(member.id, member);
      }
    }
    return {
      ...group,
      members: [...chosen.values()].map(member => ({
        ...member,
        badges: settings.showRoleBadges
          ? member.roleIds.filter(id => group.roleIds.includes(id)).map(id => roleMap.get(id)).filter((role): role is StaffRole => !!role)
          : [],
      })),
    };
  });
}

function markdown(value: string): string {
  return value.replace(/([\\*_~|>\`])/g, "\\$1").replace(/@/g, "@\u200b");
}

/** Discord-compatible payload, with mention suppression and embed-size bounds. */
export function buildStaffDiscordPayload(
  settings: StaffListSettings,
  sections: StaffSection[],
): Record<string, unknown> {
  const title = markdown(settings.title).slice(0, 256);
  const description = markdown(settings.description).slice(0, 1500);
  const fields: { name: string; value: string; inline: boolean }[] = [];
  let remaining = 5900 - title.length - description.length;
  for (const section of sections) {
    if (fields.length >= 25 || remaining < 40) break;
    const name = markdown(section.title).slice(0, 256);
    const intro = markdown(section.description);
    const people = section.members.map(member => "<@" + member.id + ">");
    const value = (intro ? intro + "\n" : "") + (people.length ? people.join(" · ") : "_No staff assigned yet_");
    const clipped = value.length > Math.min(1024, remaining - name.length)
      ? value.slice(0, Math.max(0, Math.min(1024, remaining - name.length) - 1)) + "…"
      : value;
    if (!clipped.trim()) break;
    fields.push({ name, value: clipped, inline: false });
    remaining -= name.length + clipped.length;
  }
  const embed = {
    title,
    description,
    color: parseInt(settings.accentColor.slice(1), 16),
    fields,
  };
  const components = settings.websiteUrl ? [{
    type: 1,
    components: [{ type: 2, style: 5, label: settings.buttonText, url: settings.websiteUrl }],
  }] : [];
  return { embeds: [embed], components, allowed_mentions: { parse: [] } };
}
