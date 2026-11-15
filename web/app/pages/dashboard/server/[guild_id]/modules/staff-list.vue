<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <DashboardModuleHeader :guild-id="guildId" icon="i-lucide-users-round" title="Staff List"
      description="Manage ordered staff groups and publish one live directory to Discord and your website."
      :enabled="isModuleEnabled('staff-list')" />

    <DashboardModuleSection title="Directory heading" description="Shown in Discord and on the website.">
      <div class="space-y-4">
        <UFormField label="Title"><UInput v-model="settings.title" maxlength="180" class="w-full" /></UFormField>
        <UFormField label="Description"><UTextarea v-model="settings.description" :rows="3" maxlength="1000" class="w-full" /></UFormField>
      </div>
    </DashboardModuleSection>

    <DashboardModuleSection title="Staff groups" description="Add Discord role(s) and/or individual user IDs. All matching non-bot members are displayed; groups can be reordered.">
      <div class="space-y-4">
        <div v-for="(group, index) in settings.groups" :key="group.id" class="space-y-3 rounded-xl border border-white/10 p-4">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-400">Group {{ index + 1 }}</span>
            <div class="ml-auto flex gap-1">
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-arrow-up"
                :disabled="index === 0" @click="moveGroup(index, -1)">Up</UButton>
              <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-arrow-down"
                :disabled="index === settings.groups.length - 1" @click="moveGroup(index, 1)">Down</UButton>
              <UButton size="xs" color="error" variant="soft" icon="i-lucide-trash-2"
                @click="settings.groups.splice(index, 1)">Remove</UButton>
            </div>
          </div>
          <UFormField label="Group name"><UInput v-model="group.title" maxlength="80" class="w-full" /></UFormField>
          <UFormField label="Short description"><UTextarea v-model="group.description" :rows="2" maxlength="300" class="w-full" /></UFormField>
          <UFormField label="Discord role(s)" description="MODUS finds members who have any selected role.">
            <USelectMenu v-model="group.roleIds" :items="roleOptions" multiple searchable value-key="value"
              placeholder="Choose roles…" class="w-full" />
          </UFormField>
          <UFormField label="Additional members (Discord IDs, comma or newline separated)"
            description="Use for one-off staff without a shared role. Only current guild members are shown.">
            <UTextarea :model-value="group.memberIds.join(', ')" :rows="2"
              placeholder="123456789012345678, 234567890123456789"
              @update:model-value="group.memberIds = parseIds(String($event))" class="w-full" />
          </UFormField>
        </div>
        <UButton icon="i-lucide-plus" color="neutral" variant="soft" :disabled="settings.groups.length >= 15"
          @click="addGroup">Add staff group</UButton>
      </div>
    </DashboardModuleSection>

    <DashboardModuleSection title="Website appearance" description="Style your website directory independently from Discord. The public link only works when enabled.">
      <div class="space-y-4">
        <USwitch v-model="settings.publicEnabled" label="Enable public staff directory and website embed" />
        <USwitch v-model="settings.showAvatars" label="Show profile pictures" />
        <USwitch v-model="settings.showRoleBadges" label="Show role badges" />
        <UFormField label="Layout">
          <select v-model="settings.layout" class="w-full rounded-lg border border-white/15 bg-gray-950 px-3 py-2 text-sm">
            <option value="cards">Staff cards</option><option value="list">Compact list</option>
          </select>
        </UFormField>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <UFormField v-for="field in colors" :key="field.key" :label="field.label">
            <div class="flex gap-2">
              <input v-model="settings[field.key]" type="color" class="h-9 w-12 cursor-pointer rounded bg-transparent" />
              <UInput v-model="settings[field.key]" maxlength="7" class="flex-1" />
            </div>
          </UFormField>
        </div>
        <p class="text-xs text-gray-400">Colors must use six-digit hexadecimal notation, for example #a855f7.</p>
        <UFormField label="Website button URL (optional)" description="Appears on the Discord message as a link button. HTTPS only.">
          <UInput v-model="settings.websiteUrl" placeholder="https://anxietyscout.live" class="w-full" />
        </UFormField>
        <UFormField label="Button label"><UInput v-model="settings.buttonText" maxlength="80" class="w-full" /></UFormField>
        <div v-if="settings.publicEnabled" class="rounded-lg border border-white/10 p-3">
          <p class="mb-2 text-sm font-semibold">Website output</p>
          <div class="flex flex-wrap gap-2">
            <UButton color="neutral" variant="soft" icon="i-lucide-copy" @click="copyUrl">Copy public page URL</UButton>
            <UButton color="neutral" variant="soft" icon="i-lucide-code" @click="copyEmbed">Copy iframe embed</UButton>
            <UButton color="neutral" variant="soft" icon="i-lucide-external-link"
              :to="publicPath" target="_blank">Preview page</UButton>
          </div>
          <p class="mt-2 text-xs text-gray-400">Paste the iframe into an Elementor HTML widget. The directory updates when roles or members change.</p>
        </div>
      </div>
    </DashboardModuleSection>

    <DashboardModuleSection title="Discord publishing" description="Save first, then post or update the same message. No duplicate post when the message is still available.">
      <div class="space-y-4">
        <UFormField label="Target text channel">
          <USelectMenu v-model="targetChannelId" :items="channelOptions" value-key="value" searchable
            placeholder="Choose a channel…" class="w-full" />
        </UFormField>
        <div class="flex flex-wrap gap-2">
          <UButton color="primary" :loading="saving" @click="save">Save staff list</UButton>
          <UButton color="neutral" variant="soft" icon="i-lucide-send" :loading="publishing"
            :disabled="!targetChannelId || !isModuleEnabled('staff-list')" @click="publish">
            {{ targetChannelId === settings.publishedChannelId && settings.publishedMessageId ? 'Update Discord message' : 'Publish to Discord' }}
          </UButton>
        </div>
        <p v-if="error" class="text-sm text-red-300">{{ error }}</p>
        <p v-if="publishedLink" class="text-sm text-emerald-200">
          Published. <a :href="publishedLink" target="_blank" rel="noopener noreferrer" class="underline">Open Discord message</a>
        </p>
      </div>
    </DashboardModuleSection>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted } from "vue";
import type { StaffListSettings, StaffGroup } from "@modus/db";

const route = useRoute();
const guildId = route.params.guild_id as string;
const { isModuleEnabled, saveModuleSettings, getModuleConfig, roleOptions, channelOptions, loadRoles, loadChannels } = useServerSettings(guildId);
const defaults: StaffListSettings = {
  title: "Meet Our Staff", description: "The team keeping our community safe, welcoming, and fun.",
  groups: [], publicEnabled: false, showAvatars: true, showRoleBadges: true, layout: "cards",
  accentColor: "#a855f7", backgroundColor: "#0b0b12", cardColor: "#171720",
  textColor: "#f1f1f5", websiteUrl: "", buttonText: "Visit the website",
  publishedChannelId: null, publishedMessageId: null,
};
const settings = reactive<StaffListSettings>(structuredClone(defaults));
const colors = [
  { key: "accentColor", label: "Accent" }, { key: "backgroundColor", label: "Page background" },
  { key: "cardColor", label: "Card background" }, { key: "textColor", label: "Text" },
] as const;
const targetChannelId = ref("");
const saving = ref(false);
const publishing = ref(false);
const error = ref("");
const publishedLink = ref("");
const publicPath = '/staff/' + guildId;
const publicUrl = () => window.location.origin + publicPath;
const toast = useToast();

function parseIds(input: string) {
  return [...new Set(input.split(/[\s,]+/).filter(id => /^\d{16,22}$/.test(id)))].slice(0, 60);
}
function addGroup() {
  const group: StaffGroup = { id: 'group-' + Date.now().toString(36), title: "New team", description: "",
    roleIds: [], memberIds: [] };
  settings.groups.push(group);
}
function moveGroup(index: number, direction: number) {
  const [group] = settings.groups.splice(index, 1);
  if (group) settings.groups.splice(index + direction, 0, group);
}
function validate() {
  if (!settings.groups.length) return "Add at least one staff group.";
  if (settings.groups.some(g => !g.title.trim())) return "Every group needs a name.";
  if (settings.groups.some(g => g.roleIds.length > 10 || g.memberIds.length > 60)) return "Too many roles or members in a group.";
  if (colors.some(c => !/^#[0-9a-fA-F]{6}$/.test(settings[c.key]))) return "All colors must be #RRGGBB.";
  if (settings.websiteUrl && !settings.websiteUrl.startsWith("https://")) return "Website URL must use HTTPS.";
  return "";
}
async function save() {
  error.value = validate();
  if (error.value) return false;
  saving.value = true;
  try { return await saveModuleSettings("staff-list", JSON.parse(JSON.stringify(settings))); }
  finally { saving.value = false; }
}
async function publish() {
  const ok = await save();
  if (!ok) return;
  publishing.value = true;
  try {
    const result = await $fetch<{ channelId: string; messageId: string }>('/api/staff-list/publish', {
      method: "POST", body: { guildId, channelId: targetChannelId.value },
    });
    settings.publishedChannelId = result.channelId;
    settings.publishedMessageId = result.messageId;
    publishedLink.value = 'https://discord.com/channels/' + guildId + '/' + result.channelId + '/' + result.messageId;
    toast.add({ title: "Staff list published", color: "success" });
  } catch (e: any) { error.value = e?.data?.statusMessage || "Publishing failed."; }
  finally { publishing.value = false; }
}
async function copyUrl() {
  await navigator.clipboard.writeText(publicUrl());
  toast.add({ title: "URL copied", color: "success" });
}
async function copyEmbed() {
  const url = publicUrl();
  await navigator.clipboard.writeText('<iframe src="' + url + '" title="Community Staff" style="width:100%;min-height:50rem;border:0;border-radius:1rem" loading="lazy"></iframe>');
  toast.add({ title: "Embed copied", color: "success" });
}
onMounted(async () => {
  await Promise.all([loadRoles(), loadChannels()]);
  const saved = getModuleConfig("staff-list");
  if (saved && Object.keys(saved).length) Object.assign(settings, saved);
  else {
    settings.groups = [
      { id: "ownership", title: "Ownership Team", description: "Community leadership", roleIds: [], memberIds: [] },
      { id: "developers", title: "Discord Developers", description: "Building our community", roleIds: [], memberIds: [] },
      { id: "admins", title: "Discord Admins", description: "Maintaining our server", roleIds: [], memberIds: [] },
      { id: "twitch-mods", title: "Twitch Moderators", description: "Keeping streams welcoming", roleIds: [], memberIds: [] },
      { id: "editors", title: "Twitch Editors", description: "Stream titles, VODs and content", roleIds: [], memberIds: [] },
      { id: "discord-mods", title: "Discord Moderators", description: "Keeping chat safe", roleIds: [], memberIds: [] },
    ];
  }
  targetChannelId.value = settings.publishedChannelId || "";
});
</script>
