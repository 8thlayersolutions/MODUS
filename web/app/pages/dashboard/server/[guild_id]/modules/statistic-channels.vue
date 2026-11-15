<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <DashboardModuleHeader :guild-id="guildId" icon="i-lucide-chart-no-axes-combined" title="Statistic Channels"
      description="Display live Discord, social media, and custom statistics as locked voice channels."
      :enabled="isModuleEnabled('statistic-channels')" />
    <DashboardModuleSection title="Refresh settings" description="Only changed channel names are updated. A failed provider leaves the previous name intact.">
      <UFormField label="Refresh interval (minutes)">
        <UInput v-model.number="settings.refreshMinutes" type="number" :min="10" :max="1440" class="w-full max-w-xs" />
      </UFormField>
      <p class="mt-2 text-xs text-gray-400">Minimum 10 minutes. Online/offline are approximate unless the bot has Guild Presences enabled. Twitch and YouTube need platform credentials; TikTok requires the authorized account's statistics scope.</p>
    </DashboardModuleSection>
    <DashboardModuleSection title="Social connections" description="Connect accounts securely to display their authorized statistics. Credentials stay on the server.">
      <div class="flex flex-wrap gap-2 items-center">
        <UButton color="neutral" variant="soft" icon="i-lucide-radio-tower" :to="`/dashboard/server/${guildId}/modules/twitch-sync`">Connect Twitch broadcaster</UButton>
        <UButton v-if="tiktok.configured" color="neutral" variant="soft" icon="i-lucide-link" @click="connectTikTok">{{ tiktok.connected ? 'Reconnect TikTok' : 'Connect TikTok' }}</UButton>
        <UButton v-if="tiktok.connected" color="error" variant="soft" @click="disconnectTikTok">Disconnect TikTok</UButton>
        <span v-if="tiktok.connected" class="text-sm text-emerald-300">TikTok: {{ tiktok.name }}</span>
        <span v-else-if="!tiktok.configured" class="text-xs text-gray-400">TikTok OAuth requires administrator configuration.</span>
      </div>
      <p v-if="route.query.tiktok === 'error' || route.query.tiktok === 'denied'" class="mt-2 text-sm text-red-300">TikTok authorization was not completed.</p>
    </DashboardModuleSection>
    <DashboardModuleSection title="Statistic channels" description="Choose a metric, customize the name, and assign an existing voice room or create a locked counter. Save to activate changes.">
      <div class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <UButton icon="i-lucide-plus" :disabled="settings.counters.length >= MAX_STATISTIC_COUNTERS" @click="addCounter()">Add counter</UButton>
          <UButton color="neutral" variant="soft" icon="i-lucide-users" :disabled="settings.counters.length > MAX_STATISTIC_COUNTERS - 5" @click="addPreset">Add Discord essentials</UButton>
          <UButton color="neutral" variant="soft" icon="i-lucide-radio-tower" :disabled="settings.counters.length > MAX_STATISTIC_COUNTERS - 4" @click="addCreatorPreset">Add creator essentials</UButton>
        </div>
        <div v-if="!settings.counters.length" class="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-gray-400">No statistic channels yet. Add a counter to get started.</div>
        <div v-for="(counter, index) in settings.counters" :key="counter.id" class="space-y-4 rounded-xl border border-white/10 p-4">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-400">Counter {{ index + 1 }}</span>
            <USwitch v-model="counter.enabled" label="Enabled" />
            <UButton class="ml-auto" size="xs" color="error" variant="soft" icon="i-lucide-trash-2" :disabled="!!creating" @click="settings.counters.splice(index, 1)">Remove</UButton>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Statistic">
              <select v-model="counter.metric" class="w-full rounded-lg border border-white/15 bg-gray-950 px-3 py-2 text-sm" @change="changeMetric(counter)">
                <optgroup v-for="group in groups" :key="group" :label="group">
                  <option v-for="metric in STATISTIC_METRICS.filter(m => m[2] === group)" :key="metric[0]" :value="metric[0]">{{ metric[1] }}</option>
                </optgroup>
              </select>
            </UFormField>
            <UFormField v-if="sourceType(counter) === 'role'" label="Discord role">
              <USelectMenu v-model="counter.source" :items="roleOptions" value-key="value" searchable class="w-full" />
            </UFormField>
            <UFormField v-else-if="sourceType(counter) === 'voice'" label="Source voice channel">
              <USelectMenu v-model="counter.source" :items="voiceOptions" value-key="value" searchable class="w-full" />
            </UFormField>
            <UFormField v-else-if="['twitch', 'youtube', 'github', 'minecraft', 'modrinth', 'custom'].includes(sourceType(counter) || '')" :label="sourceLabel(counter)">
              <UInput v-model="counter.source" :placeholder="sourcePlaceholder(counter)" maxlength="120" class="w-full" />
            </UFormField>
            <p v-else-if="sourceType(counter) === 'linked-twitch'" class="self-end text-xs text-gray-400">Uses the broadcaster connected in Twitch Role Sync.</p>
            <p v-else-if="counter.metric.startsWith('tiktok_')" class="self-end text-xs text-gray-400">Uses the TikTok account authorized for this server by the MODUS administrator.</p>
            <UFormField label="Channel name template" description="Include {value}; add any emoji or text.">
              <UInput v-model="counter.template" maxlength="100" class="w-full" />
            </UFormField>
            <UFormField label="Destination voice channel">
              <USelectMenu v-model="counter.channelId" :items="voiceOptions" value-key="value" searchable placeholder="Select a channel…" class="w-full" />
            </UFormField>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <USwitch v-model="counter.compact" label="Compact numbers (1.2K)" />
            <span class="rounded bg-white/5 px-3 py-1 text-sm text-cyan-300"><UIcon name="i-lucide-volume-2" class="mr-2" />{{ formatStatisticName(counter, sample(counter)) }}</span>
          </div>
          <div v-if="!counter.channelId" class="flex flex-wrap items-end gap-2">
            <UFormField label="New channel category (optional)" class="min-w-48 flex-1">
              <select v-model="categoryIds[counter.id]" class="w-full rounded-lg border border-white/15 bg-gray-950 px-3 py-2 text-sm">
                <option value="">No category</option><option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
              </select>
            </UFormField>
            <UButton icon="i-lucide-lock" color="neutral" variant="soft" :loading="creating === counter.id" :disabled="!!creating" @click="createChannel(counter)">Create locked channel</UButton>
          </div>
          <p v-else class="text-xs text-gray-400">Existing channels keep their permissions. Removing a counter stops updates but does not delete a Discord channel.</p>
        </div>
        <UButton color="primary" icon="i-lucide-save" :loading="saving" :disabled="!!creating" @click="save">Save statistic channels</UButton>
        <p v-if="error" class="text-sm text-red-300">{{ error }}</p>
      </div>
    </DashboardModuleSection>
  </div>
</template>

<script setup lang="ts">
import { STATISTIC_METRICS, MAX_STATISTIC_COUNTERS, defaultStatisticSettings, parseStatisticSettings, validateStatisticSettings, statisticMetric, formatStatisticName, type StatisticCounter, type StatisticMetric } from '@modus/db/statistic-channels';
const route = useRoute();
const toast = useToast();
const guildId = route.params.guild_id as string;
const { getModuleConfig, saveModuleSettings, isModuleEnabled, roleOptions, loadRoles } = useServerSettings(guildId);
const settings = reactive(defaultStatisticSettings());
const groups = [...new Set(STATISTIC_METRICS.map(metric => metric[2]))];
const voiceOptions = ref<{ label: string; value: string }[]>([]);
const categories = ref<{ id: string; name: string }[]>([]);
const categoryIds = reactive<Record<string, string>>({});
const creating = ref('');
const error = ref('');
const saving = ref(false);
const tiktok = ref<{ configured: boolean; connected: boolean; name: string | null }>({ configured: false, connected: false, name: null });
async function loadTikTok() {
  try { tiktok.value = await $fetch('/api/statistic-channels/tiktok/status', { params: { guild_id: guildId } }); }
  catch { /* The editor remains usable without a social connection. */ }
}
function connectTikTok() { window.location.assign('/api/statistic-channels/tiktok/connect?guild_id=' + encodeURIComponent(guildId)); }
async function disconnectTikTok() {
  if (!window.confirm('Disconnect the TikTok account from MODUS? Counters will stop updating.')) return;
  try { await $fetch('/api/statistic-channels/tiktok/disconnect', { method: 'POST', body: { guildId } }); await loadTikTok(); }
  catch { error.value = 'Could not disconnect the TikTok account.'; }
}

function sourceType(counter: StatisticCounter) { return statisticMetric(counter.metric)?.[3]; }
function sourceLabel(counter: StatisticCounter) {
  return ({ twitch: 'Twitch username', youtube: 'YouTube channel ID or @handle', github: 'Public GitHub repository (owner/name)', minecraft: 'Server address (host or host:port)', modrinth: 'Modrinth project ID or slug', custom: 'Custom value' } as Record<string, string>)[sourceType(counter) || ''] || 'Source';
}
function sourcePlaceholder(counter: StatisticCounter) {
  return ({ twitch: 'anxietyscout', youtube: '@anxietyscout', github: '8thlayersolutions/MODUS', minecraft: 'chaos.mc.anxietyscout.live', modrinth: 'anxietyscout-chaos-smp', custom: 'Welcome to the server!' } as Record<string, string>)[sourceType(counter) || ''] || '';
}
function sample(counter: StatisticCounter) {
  if (counter.metric === 'custom') return counter.source || 'Custom';
  if (counter.metric === 'twitch_status') return 'LIVE';
  if (counter.metric === 'twitch_game') return 'Minecraft';
  if (counter.metric === 'twitch_title') return 'Live stream';
  if (counter.metric.endsWith('_status')) return 'Online';
  if (counter.metric.endsWith('_ratio')) return '12/50';
  return 1234;
}
function changeMetric(counter: StatisticCounter) {
  counter.source = '';
  counter.template = (statisticMetric(counter.metric)?.[1] || 'Statistic') + ': {value}';
}
function addCounter(metric: StatisticMetric = 'members', template?: string) {
  if (settings.counters.length >= MAX_STATISTIC_COUNTERS) return;
  const id = crypto.randomUUID();
  categoryIds[id] = '';
  settings.counters.push({ id, metric, source: '', channelId: '', enabled: true, compact: false, template: template || (statisticMetric(metric)?.[1] || 'Statistic') + ': {value}' });
}
function addPreset() {
  addCounter('members', '👥┃Members: {value}'); addCounter('online', '🟢┃Online: {value}');
  addCounter('offline', '⚫┃Offline: {value}'); addCounter('bots', '🤖┃Bots: {value}'); addCounter('boosts', '💎┃Boosts: {value}');
}
function addCreatorPreset() {
  addCounter('twitch_followers', '🟣┃Twitch: {value}'); addCounter('youtube_subscribers', '🔴┃YouTube: {value}');
  addCounter('tiktok_followers', '🎵┃TikTok: {value}'); addCounter('twitch_status', '🔴┃Stream: {value}');
}
async function loadVoiceChannels() {
  const response = await $fetch<{ channels: { id: string; name: string }[]; categories: { id: string; name: string }[] }>('/api/discord/channels', { params: { guild_id: guildId, types: 'voice' } });
  voiceOptions.value = response.channels.map(channel => ({ label: channel.name, value: channel.id }));
  categories.value = response.categories;
}
async function createChannel(counter: StatisticCounter) {
  error.value = '';
  creating.value = counter.id;
  try {
    if (!counter.template.includes('{value}')) { error.value = 'Include {value} in the channel template.'; return; }
    const name = formatStatisticName(counter, '…');
    const created = await $fetch<{ id: string; name: string }>('/api/statistic-channels/channel', { method: 'POST', body: { guildId, name, parentId: categoryIds[counter.id] || undefined } });
    voiceOptions.value.push({ label: created.name, value: created.id });
    counter.channelId = created.id;
    toast.add({ title: 'Channel created — save to activate updates', color: 'success' });
  } catch (e: any) { error.value = e?.data?.statusMessage || 'Could not create the channel. Check Manage Channels permissions.'; }
  finally { creating.value = ''; }
}
async function save() {
  error.value = '';
  const result = validateStatisticSettings(JSON.parse(JSON.stringify(settings)));
  if (!result.ok) { error.value = result.error; return; }
  saving.value = true;
  try { await saveModuleSettings('statistic-channels', result.settings); }
  finally { saving.value = false; }
}
onMounted(async () => {
  Object.assign(settings, parseStatisticSettings(getModuleConfig('statistic-channels')));
  try { await Promise.all([loadRoles(), loadVoiceChannels(), loadTikTok()]); }
  catch { error.value = 'Could not load Discord channels or roles.'; }
});
</script>
