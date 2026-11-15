<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <DashboardModuleHeader
      :guild-id="guildId"
      icon="i-lucide-calendar-clock"
      title="Stream Schedule"
      description="A recurring streaming calendar with one-off changes and a live website embed."
      :enabled="isModuleEnabled('stream-schedule')"
    />

    <div v-if="loading" class="rounded-xl border border-white/10 p-8 text-sm text-gray-400">
      Loading stream schedule…
    </div>
    <template v-else>
      <DashboardModuleSection title="Schedule Settings" description="These details apply to Discord and to the public website widget.">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="space-y-1 text-sm text-gray-300">
            <span class="block">Display title</span>
            <input v-model="settings.title" maxlength="100" class="input" placeholder="STREAM SCHEDULE" />
          </label>
          <label class="space-y-1 text-sm text-gray-300">
            <span class="block">Twitch username</span>
            <input v-model="settings.twitchChannel" maxlength="25" class="input" placeholder="anxietyscout" />
          </label>
          <label class="space-y-1 text-sm text-gray-300">
            <span class="block">IANA time zone</span>
            <input v-model="settings.timezone" maxlength="80" class="input" placeholder="America/Chicago" />
          </label>
          <label class="space-y-1 text-sm text-gray-300">
            <span class="block">Week starts on</span>
            <select v-model.number="settings.weekStartsOn" class="input">
              <option :value="1">Monday</option>
              <option :value="0">Sunday</option>
            </select>
          </label>
          <label class="space-y-1 text-sm text-gray-300 sm:col-span-2">
            <span class="block">Subtitle / description</span>
            <textarea v-model="settings.description" maxlength="400" rows="2" class="input" placeholder="Catch the next stream live!" />
          </label>
          <label class="flex items-center gap-3 rounded-lg border border-white/10 p-3 text-sm text-white sm:col-span-2">
            <input v-model="settings.public" type="checkbox" class="h-4 w-4 accent-purple-500" />
            Publish this schedule to the website (anyone with its URL can view it)
          </label>
        </div>
      </DashboardModuleSection>

      <DashboardModuleSection
        title="Recurring Weekly Streams"
        description="Set once and MODUS automatically displays the right calendar dates every week. Add multiple streams on the same day if needed."
      >
        <template #actions>
          <UButton size="sm" icon="i-lucide-plus" @click="addWeekly">Add Stream</UButton>
        </template>
        <p v-if="settings.weekly.length === 0" class="text-sm text-gray-400">
          Nothing scheduled yet. Add your first weekly stream.
        </p>
        <div v-for="(slot, i) in settings.weekly" :key="slot.id" class="mb-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <div class="grid gap-3 md:grid-cols-12">
            <label class="space-y-1 text-xs text-gray-400 md:col-span-3">
              <span class="block">Day</span>
              <select v-model.number="slot.weekday" class="input">
                <option v-for="day in weekdayOptions" :key="day.value" :value="day.value">{{ day.label }}</option>
              </select>
            </label>
            <label class="space-y-1 text-xs text-gray-400 md:col-span-2">
              <span class="block">Start (local)</span>
              <input v-model="slot.time" type="time" class="input" />
            </label>
            <label class="space-y-1 text-xs text-gray-400 md:col-span-5">
              <span class="block">Stream title</span>
              <input v-model="slot.title" maxlength="120" class="input" placeholder="Chaos SMP" />
            </label>
            <div class="flex items-end justify-end md:col-span-2">
              <UButton color="error" variant="ghost" icon="i-lucide-trash-2" :aria-label="'Remove stream ' + (i + 1)" @click="settings.weekly.splice(i, 1)">Remove</UButton>
            </div>
            <label class="space-y-1 text-xs text-gray-400 md:col-span-3">
              <span class="block">Game / category</span>
              <input v-model="slot.game" maxlength="80" class="input" placeholder="Minecraft" />
            </label>
            <label class="space-y-1 text-xs text-gray-400 md:col-span-2">
              <span class="block">Duration (minutes)</span>
              <input v-model.number="slot.durationMinutes" type="number" min="15" max="1440" class="input" />
            </label>
            <label class="space-y-1 text-xs text-gray-400 md:col-span-4">
              <span class="block">Thumbnail URL (HTTPS, optional)</span>
              <input v-model="slot.imageUrl" type="url" class="input" placeholder="https://…" />
            </label>
            <label class="space-y-1 text-xs text-gray-400 md:col-span-3">
              <span class="block">Custom stream link (optional)</span>
              <input v-model="slot.url" type="url" class="input" placeholder="Defaults to Twitch" />
            </label>
          </div>
        </div>
      </DashboardModuleSection>

      <DashboardModuleSection
        title="Special Dates & Cancellations"
        description="An override replaces every recurring stream on that date, or marks the entire day off. Other weeks remain unchanged."
      >
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="space-y-1 text-xs text-gray-400">
            <span class="block">Calendar date</span>
            <input v-model="overrideDate" type="date" class="input" />
          </label>
          <label class="space-y-1 text-xs text-gray-400">
            <span class="block">Change</span>
            <select v-model="overrideMode" class="input">
              <option value="replace">Special stream(s)</option>
              <option value="off">Cancel streams / day off</option>
            </select>
          </label>
          <div class="flex items-end">
            <UButton color="primary" icon="i-lucide-check" :disabled="!overrideDate" @click="applyOverride">
              Save Date Override
            </UButton>
          </div>
        </div>
        <div v-if="overrideMode === 'replace'" class="mt-4 space-y-3">
          <div v-for="(slot, i) in overrideStreams" :key="slot.id" class="grid gap-3 rounded-xl border border-white/10 p-3 sm:grid-cols-12">
            <label class="space-y-1 text-xs text-gray-400 sm:col-span-3">
              <span class="block">Time</span><input v-model="slot.time" type="time" class="input" />
            </label>
            <label class="space-y-1 text-xs text-gray-400 sm:col-span-5">
              <span class="block">Stream title</span><input v-model="slot.title" maxlength="120" class="input" />
            </label>
            <label class="space-y-1 text-xs text-gray-400 sm:col-span-3">
              <span class="block">Game / category</span><input v-model="slot.game" maxlength="80" class="input" />
            </label>
            <div class="flex items-end justify-end sm:col-span-1">
              <UButton icon="i-lucide-x" color="error" variant="ghost" :aria-label="'Remove special stream ' + (i + 1)" @click="overrideStreams.splice(i, 1)" />
            </div>
            <label class="space-y-1 text-xs text-gray-400 sm:col-span-3">
              <span class="block">Duration (minutes)</span><input v-model.number="slot.durationMinutes" type="number" min="15" max="1440" class="input" />
            </label>
            <label class="space-y-1 text-xs text-gray-400 sm:col-span-5">
              <span class="block">Thumbnail URL</span><input v-model="slot.imageUrl" type="url" class="input" />
            </label>
            <label class="space-y-1 text-xs text-gray-400 sm:col-span-4">
              <span class="block">Stream URL</span><input v-model="slot.url" type="url" class="input" />
            </label>
          </div>
          <UButton size="sm" variant="soft" icon="i-lucide-plus" :disabled="overrideStreams.length >= 8" @click="overrideStreams.push(emptySpecial())">
            Add Special Stream
          </UButton>
        </div>
        <div v-if="settings.overrides.length" class="mt-5 space-y-2">
          <div v-for="item in sortedOverrides" :key="item.date" class="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm">
            <span><strong>{{ item.date }}</strong> — {{ item.mode === 'off' ? 'Day off / cancelled' : item.streams.map(s => s.title).join(', ') || 'No streams' }}</span>
            <div class="flex gap-1">
              <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-pencil" @click="editOverride(item)">Edit</UButton>
              <UButton color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" @click="removeOverride(item.date)">Delete</UButton>
            </div>
          </div>
        </div>
      </DashboardModuleSection>

      <DashboardModuleSection title="Website Appearance" description="Theme defaults are stored with your schedule and can also be overridden for each embed.">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label v-for="item in themeColors" :key="item.key" class="space-y-2 text-xs text-gray-300">
            <span class="block">{{ item.label }}</span>
            <div class="flex gap-2">
              <input v-model="settings.appearance[item.key]" type="color" class="h-10 w-10 cursor-pointer rounded border-0 bg-transparent" />
              <input v-model="settings.appearance[item.key]" maxlength="7" class="input min-w-0 flex-1 font-mono text-xs" />
            </div>
          </label>
        </div>
        <div class="mt-5 grid gap-4 sm:grid-cols-2">
          <label class="space-y-1 text-sm text-gray-300">
            <span class="block">Layout</span>
            <select v-model="settings.appearance.layout" class="input">
              <option value="grid">Weekly cards (reference-style)</option>
              <option value="list">Vertical agenda</option>
            </select>
          </label>
          <div class="grid grid-cols-2 gap-3 text-sm text-gray-300">
            <label class="flex items-center gap-2"><input v-model="settings.appearance.showOff" type="checkbox" /> Show off-days</label>
            <label class="flex items-center gap-2"><input v-model="settings.appearance.compact" type="checkbox" /> Compact spacing</label>
            <label class="flex items-center gap-2"><input v-model="settings.appearance.header" type="checkbox" /> Show title</label>
            <label class="flex items-center gap-2"><input v-model="settings.appearance.images" type="checkbox" /> Show thumbnails</label>
          </div>
        </div>
      </DashboardModuleSection>

      <DashboardModuleSection title="This Week — Live Preview" description="Preview is generated from the weekly recurrence and special-date overrides.">
        <div class="mb-3 text-sm text-gray-400">{{ preview.startDate }} – {{ preview.endDate }} · {{ settings.timezone }}</div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
          <div v-for="day in preview.days" :key="day.date" class="min-h-28 rounded-lg border border-purple-400/15 bg-purple-500/[0.07] p-3">
            <p class="mb-2 text-xs font-semibold uppercase text-purple-200">{{ weekdayOptions[day.weekday]?.label }} · {{ day.date.slice(5) }}</p>
            <p v-if="day.off" class="text-xs text-gray-500">No stream</p>
            <div v-for="s in day.streams" :key="s.id" class="mb-2 text-xs">
              <p class="font-semibold text-white">{{ s.title }}</p>
              <p class="text-purple-200">{{ s.time }} · {{ s.game }}</p>
            </div>
          </div>
        </div>
      </DashboardModuleSection>

      <DashboardModuleSection
        title="Discord Schedule Embed"
        description="Post a permanent schedule message in a channel. MODUS edits that same message as the week rolls forward or your schedule changes."
      >
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="space-y-1 text-sm text-gray-300">
            <span class="block">Post in Discord channel</span>
            <select v-model="settings.discord.channelId" class="input" :disabled="state.channelsLoading">
              <option value="">Select a text channel…</option>
              <option v-for="channel in discordChannels" :key="channel.id" :value="channel.id">
                #{{ channel.name }}
              </option>
            </select>
            <span v-if="state.channelsLoading" class="text-xs text-gray-500">Loading channels…</span>
          </label>
          <label class="space-y-1 text-sm text-gray-300">
            <span class="block">Embed title (optional override)</span>
            <input v-model="settings.discord.title" maxlength="200" class="input" placeholder="Uses display title" />
          </label>
          <label class="space-y-1 text-sm text-gray-300 sm:col-span-2">
            <span class="block">Description (optional override)</span>
            <textarea v-model="settings.discord.description" maxlength="600" rows="2" class="input" placeholder="Uses schedule subtitle" />
          </label>
          <label class="space-y-1 text-sm text-gray-300">
            <span class="block">Embed accent color</span>
            <div class="flex items-center gap-2">
              <input v-model="settings.discord.color" type="color" class="h-10 w-12 rounded bg-transparent" />
              <input v-model="settings.discord.color" maxlength="7" class="input min-w-0 flex-1 font-mono" />
            </div>
          </label>
          <label class="space-y-1 text-sm text-gray-300">
            <span class="block">Banner image URL (optional)</span>
            <input v-model="settings.discord.imageUrl" type="url" class="input" placeholder="https://example.com/schedule.png" />
          </label>
          <label class="space-y-1 text-sm text-gray-300 sm:col-span-2">
            <span class="block">Footer</span>
            <input v-model="settings.discord.footer" maxlength="512" class="input" placeholder="Powered by MODUS" />
          </label>
        </div>
        <div class="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm text-gray-300">
          <label class="flex items-center gap-2">
            <input v-model="settings.discord.autoUpdate" type="checkbox" />
            Automatically update every 5 minutes
          </label>
          <label class="flex items-center gap-2">
            <input v-model="settings.discord.showOffDays" type="checkbox" />
            Include off-days
          </label>
          <label class="flex items-center gap-2">
            <input v-model="settings.discord.inlineFields" type="checkbox" />
            Compact inline day fields
          </label>
        </div>

        <div class="mt-6 space-y-2">
          <p class="text-sm font-medium text-white">Discord embed preview</p>
          <div class="max-w-2xl rounded-lg bg-[#2b2d31] p-4">
            <div class="rounded-r-md bg-[#202127] p-4 text-[#dbdee1] shadow-sm"
                 :style="{ borderLeft: '4px solid ' + validDiscordColor }">
              <p class="text-base font-semibold text-white">{{ settings.discord.title || settings.title }}</p>
              <p v-if="settings.discord.description || settings.description" class="mt-2 whitespace-pre-wrap text-sm">
                {{ settings.discord.description || settings.description }}
              </p>
              <p class="mt-2 text-xs text-gray-400">{{ preview.startDate }} — {{ preview.endDate }} · {{ settings.timezone }}</p>
              <div class="mt-4 grid gap-3" :class="settings.discord.inlineFields ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1'">
                <div v-for="day in discordPreviewDays" :key="day.date" class="min-w-0">
                  <div class="text-xs font-semibold text-white">
                    {{ weekdayOptions[day.weekday]?.label }} · {{ day.date.slice(5) }}
                  </div>
                  <p v-if="day.off" class="mt-1 text-xs text-gray-400">No stream scheduled</p>
                  <div v-for="stream in day.streams" :key="stream.id" class="mt-1 text-xs">
                    <span class="text-gray-300">{{ stream.time }}</span> · <strong>{{ stream.title }}</strong>
                    <span v-if="stream.game" class="text-gray-400"> · {{ stream.game }}</span>
                  </div>
                </div>
              </div>
              <img
                v-if="settings.discord.imageUrl && /^https:\/\//i.test(settings.discord.imageUrl)"
                :src="settings.discord.imageUrl"
                class="mt-4 max-h-52 max-w-full rounded object-contain"
                alt="Discord schedule banner"
                loading="lazy"
              />
              <p v-if="settings.discord.footer" class="mt-4 text-xs text-gray-400">{{ settings.discord.footer }}</p>
            </div>
          </div>
          <p class="text-xs text-gray-400">
            The actual Discord message uses timestamp links that convert to each viewer's local time.
            No role or everyone mentions are sent automatically.
          </p>
        </div>

        <div class="mt-5 flex flex-wrap items-center gap-3">
          <UButton
            icon="i-lucide-send"
            :loading="publishing"
            :disabled="!settings.discord.channelId || !isModuleEnabled('stream-schedule')"
            @click="publishDiscord"
          >
            {{ publication.published ? "Update Published Embed" : "Save & Publish Embed" }}
          </UButton>
          <UButton
            v-if="publication.published"
            color="error"
            variant="soft"
            icon="i-lucide-trash-2"
            :loading="publishing"
            @click="unpublishDiscord"
          >
            Remove Published Embed
          </UButton>
          <UButton
            v-if="publication.messageUrl"
            color="neutral"
            variant="ghost"
            icon="i-lucide-external-link"
            :to="publication.messageUrl"
            target="_blank"
          >
            Open in Discord
          </UButton>
        </div>
        <p v-if="publication.published" class="mt-3 text-xs text-emerald-300">
          Published to #{{ discordChannels.find(c => c.id === publication.channelId)?.name || publication.channelId }}.
          Automatic updates {{ settings.discord.autoUpdate ? 'enabled' : 'disabled' }}.
        </p>
        <p v-else class="mt-3 text-xs text-gray-500">
          Nothing has been posted yet. Your channel won't receive a message until you click Save & Publish Embed.
        </p>
      </DashboardModuleSection>

      <DashboardModuleSection title="Embed on Your Website" description="Paste the iframe code into an Elementor HTML widget. It reloads itself every five minutes and follows the calendar automatically.">
        <div class="space-y-3">
          <p v-if="!settings.public" class="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-200">
            Enable “Publish this schedule” above and save before the public link works.
          </p>
          <p class="break-all font-mono text-xs text-purple-200">{{ embedUrl }}</p>
          <textarea :value="embedCode" readonly rows="4" class="input w-full font-mono text-xs" aria-label="Website iframe code" />
          <div class="flex flex-wrap gap-2">
            <UButton icon="i-lucide-copy" @click="copyEmbed">Copy Embed Code</UButton>
            <UButton color="neutral" variant="soft" icon="i-lucide-external-link" :to="embedUrl" target="_blank">Open Preview</UButton>
          </div>
          <p class="text-xs text-gray-400">Read-only JSON feed: {{ feedUrl }} (for a fully custom website component).</p>
        </div>
      </DashboardModuleSection>

      <div v-if="errorMessage" role="alert" class="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
        {{ errorMessage }}
      </div>
      <div class="sticky bottom-4 z-10 flex justify-end rounded-xl border border-white/10 bg-gray-950/90 p-3 backdrop-blur">
        <UButton size="lg" icon="i-lucide-save" :loading="saving" @click="save">
          Save Stream Schedule
        </UButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import {
  buildStreamWeek,
  DEFAULT_STREAM_SCHEDULE,
  normalizeStreamSchedule,
  validateStreamSchedule,
  type StreamScheduleSettings,
  type StreamSlot,
  type StreamOverride,
} from "@modus/db/stream-schedule";

const guildId = String(useRoute().params.guild_id);
const { initialize, isModuleEnabled, saveModuleSettings, loadChannels, state } = useServerSettings(guildId);
const toast = useToast();
const loading = ref(true);
const saving = ref(false);
const publishing = ref(false);
type DiscordPublication = {
  published: boolean;
  channelId: string;
  messageId: string;
  messageUrl: string;
  updatedAt: string | null;
};
const publication = ref<DiscordPublication>({
  published: false, channelId: "", messageId: "", messageUrl: "", updatedAt: null,
});
const discordChannels = computed(() => state.value.channels.filter(c => c.type === 0 || c.type === 5));
const validDiscordColor = computed(() =>
  /^#[0-9a-fA-F]{6}$/.test(settings.value.discord.color)
    ? settings.value.discord.color : "#9146FF");
const errorMessage = ref("");
const settings = ref<StreamScheduleSettings>(normalizeStreamSchedule(DEFAULT_STREAM_SCHEDULE));
const overrideDate = ref("");
const overrideMode = ref<"replace" | "off">("replace");
type SpecialSlot = Omit<StreamSlot, "weekday">;
const newId = () => "stream_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const emptySpecial = (): SpecialSlot => ({
  id: newId(), time: "19:00", title: "Special Stream", game: "",
  durationMinutes: 120, imageUrl: "", url: "",
});
const overrideStreams = ref<SpecialSlot[]>([emptySpecial()]);
const weekdayOptions = [
  { value: 0, label: "Sunday" }, { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" }, { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" }, { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];
type ColorKey = "accent" | "bg" | "fg" | "card" | "muted";
const themeColors: { key: ColorKey; label: string }[] = [
  { key: "accent", label: "Accent" }, { key: "bg", label: "Background" },
  { key: "fg", label: "Text" }, { key: "card", label: "Cards" },
  { key: "muted", label: "Secondary text" },
];
const sortedOverrides = computed(() => [...settings.value.overrides].sort((a, b) => a.date.localeCompare(b.date)));
const discordPreviewDays = computed(() =>
  preview.value.days.filter(day => settings.value.discord.showOffDays || !day.off));
const preview = computed(() => {
  const valid = validateStreamSchedule(settings.value);
  return buildStreamWeek(valid.ok ? valid.settings : normalizeStreamSchedule({}), new Date());
});
function addWeekly() {
  if (settings.value.weekly.length >= 35) return;
  settings.value.weekly.push({ ...emptySpecial(), weekday: 1 });
}
function editOverride(item: StreamOverride) {
  overrideDate.value = item.date;
  overrideMode.value = item.mode;
  overrideStreams.value = item.streams.length ? item.streams.map((s) => ({ ...s })) : [emptySpecial()];
}
function removeOverride(date: string) {
  settings.value.overrides = settings.value.overrides.filter((o) => o.date !== date);
}
function applyOverride() {
  errorMessage.value = "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(overrideDate.value)) {
    errorMessage.value = "Choose a date for the override.";
    return;
  }
  const candidate: StreamOverride = {
    date: overrideDate.value, mode: overrideMode.value,
    streams: overrideMode.value === "off" ? [] : overrideStreams.value.map((s) => ({ ...s })),
  };
  const next = {
    ...settings.value,
    overrides: [...settings.value.overrides.filter((o) => o.date !== candidate.date), candidate],
  };
  const result = validateStreamSchedule(next);
  if (!result.ok) {
    errorMessage.value = result.error;
    return;
  }
  settings.value = result.settings;
  toast.add({ title: "Date override staged", description: "Save the schedule to publish your changes.", color: "info" });
}
const baseUrl = computed(() => String(useRuntimeConfig().public.baseUrl || "https://modusbot.io").replace(/\/$/, ""));
const embedUrl = computed(() => {
  const a = settings.value.appearance;
  const params = new URLSearchParams({
    accent: a.accent, bg: a.bg, fg: a.fg, card: a.card, muted: a.muted,
    layout: a.layout, compact: String(a.compact), showOff: String(a.showOff),
    header: String(a.header), images: String(a.images),
  });
  return baseUrl.value + "/embed/stream-schedule/" + encodeURIComponent(guildId) + "?" + params.toString();
});
const feedUrl = computed(() => baseUrl.value + "/api/public/stream-schedule/" + encodeURIComponent(guildId));
const embedCode = computed(() =>
  '<iframe title="Stream Schedule" src="' + embedUrl.value +
  '" width="100%" height="680" loading="lazy" style="border:0;border-radius:1rem;max-width:100%;" referrerpolicy="no-referrer"></iframe>');
async function copyEmbed() {
  try {
    await navigator.clipboard.writeText(embedCode.value);
    toast.add({ title: "Embed copied", description: "Paste it into Elementor's HTML widget.", color: "success" });
  } catch {
    toast.add({ title: "Copy unavailable", description: "Select the code and copy it manually.", color: "warning" });
  }
}
async function fetchDiscordPublication() {
  publication.value = await $fetch<DiscordPublication>("/api/stream-schedule/discord", {
    params: { guild_id: guildId },
  });
}
async function publishDiscord() {
  publishing.value = true;
  errorMessage.value = "";
  try {
    const ok = await save();
    if (!ok) return;
    await $fetch("/api/stream-schedule/discord", {
      method: "POST",
      body: { guildId, action: "publish" },
    });
    await fetchDiscordPublication();
    toast.add({
      title: "Schedule published in Discord",
      description: "MODUS will keep the same message updated.",
      color: "success",
    });
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || "Unable to publish the Discord embed.";
  } finally {
    publishing.value = false;
  }
}
async function unpublishDiscord() {
  publishing.value = true;
  errorMessage.value = "";
  try {
    await $fetch("/api/stream-schedule/discord", {
      method: "POST",
      body: { guildId, action: "unpublish" },
    });
    await fetchDiscordPublication();
    toast.add({ title: "Discord schedule removed", color: "success" });
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || "Could not remove the Discord message.";
  } finally {
    publishing.value = false;
  }
}
async function save(): Promise<boolean> {
  const checked = validateStreamSchedule(settings.value);
  if (!checked.ok) {
    errorMessage.value = checked.error;
    return false;
  }
  saving.value = true;
  errorMessage.value = "";
  try {
    const ok = await saveModuleSettings("stream-schedule", checked.settings);
    if (ok) settings.value = checked.settings;
    return ok;
  } finally {
    saving.value = false;
  }
}
onMounted(async () => {
  await initialize();
  try {
    const config = await $fetch<{ settings: Record<string, unknown> }>(
      "/api/guild-configs/" + encodeURIComponent(guildId) + "/stream-schedule",
    );
    settings.value = normalizeStreamSchedule(config.settings);
    await Promise.all([loadChannels(), fetchDiscordPublication()]);
  } catch {
    errorMessage.value = "Could not load the current schedule. Changes have not been saved.";
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.input {
  display: block;
  width: 100%;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: .55rem;
  background: rgb(255 255 255 / 5%);
  padding: .62rem .7rem;
  color: #fff;
  outline-offset: 2px;
}
.input:focus { outline: 2px solid #a970ff; }
.input::placeholder { color: #81808e; }
select.input option { background: #171328; color: white; }
</style>
