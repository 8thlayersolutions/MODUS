<template>
  <div class="mx-auto max-w-4xl space-y-6">
    <DashboardModuleHeader
      :guild-id="guildId"
      icon="i-lucide-radio-tower"
      title="Twitch Role Sync"
      description="Choose the Discord role to assign for each verified Twitch status."
      :enabled="isModuleEnabled('twitch-sync')"
    />

    <div class="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-info" class="mt-0.5 h-4 w-4 shrink-0" />
        <span>Role mappings can be saved now. Account verification, Twitch broadcaster authorization, and automatic role syncing are not connected yet. Saving these settings will not assign roles.</span>
      </div>
    </div>

    <DashboardModuleSection
      title="Twitch channel"
      description="Use the broadcaster's Twitch username. Each Discord server has independent mappings."
    >
      <UFormField label="Channel username" class="w-full">
        <UInput v-model="settings.channelLogin" placeholder="e.g. AnxietyScout" class="w-full" maxlength="25" />
      </UFormField>
    </DashboardModuleSection>

    <DashboardModuleSection
      title="Role mappings"
      description="Map each Twitch status to any Discord role MODUS is allowed to grant. Select No role to disable that mapping."
    >
      <div class="space-y-2">
        <div
          v-for="type in TWITCH_ROLE_TYPES"
          :key="type.id"
          class="flex flex-col gap-3 rounded-lg border border-white/[0.07] p-3 sm:flex-row sm:items-center"
        >
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium text-white">{{ type.label }}</div>
            <p class="mt-0.5 text-xs text-gray-400">{{ type.description }}</p>
          </div>
          <div class="w-full sm:w-64">
            <USelectMenu
              v-model="settings.mappings[type.id]"
              :items="grantableRoleOptions"
              value-key="value"
              searchable
              placeholder="No role"
              class="w-full"
            />
            <p v-if="roleWarning(settings.mappings[type.id])" class="mt-1 text-xs text-amber-300">
              {{ roleWarning(settings.mappings[type.id]) }}
            </p>
          </div>
        </div>
      </div>
    </DashboardModuleSection>

    <DashboardModuleSection
      title="Reconciliation preferences"
      description="These preferences will take effect when the role-sync worker is connected."
    >
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="text-sm font-medium text-white">Sync interval</div>
            <p class="mt-0.5 text-xs text-gray-400">How often to recheck linked members.</p>
          </div>
          <USelect v-model="settings.syncIntervalMinutes" :items="intervalOptions" value-key="value" class="w-44" />
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="text-sm font-medium text-white">Remove expired roles</div>
            <p class="mt-0.5 text-xs text-gray-400">Revoke only roles managed by Twitch Sync when eligibility is conclusively lost; never on API failure.</p>
          </div>
          <USwitch v-model="settings.removeStaleRoles" />
        </div>
      </div>
    </DashboardModuleSection>

    <p v-if="validationError" class="rounded-lg border border-red-400/30 p-3 text-sm text-red-300">{{ validationError }}</p>

    <DashboardModuleAccessSection :guild-id="guildId" module-name="twitch-sync" />
    <DashboardModuleSaveBar :dirty="dirty" :saving="saving" @save="save" @discard="discard" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import {
  TWITCH_ROLE_TYPES,
  defaultTwitchSyncSettings,
  parseTwitchSyncSettings,
  validateTwitchSyncSettings,
  type TwitchSyncSettings,
  type TwitchSyncInterval,
} from "@modus/db/twitch-sync";
import { roleProblem } from "~/utils/autoroles";

const route = useRoute();
const guildId = route.params.guild_id as string;
const { state, isModuleEnabled, saveModuleSettings, getModuleConfig, loadRoles } =
  useServerSettings(guildId);
const toast = useToast();

const settings = reactive<TwitchSyncSettings>(defaultTwitchSyncSettings());
const baseline = ref(JSON.stringify(settings));
const saving = ref(false);
const dirty = computed(() => JSON.stringify(settings) !== baseline.value);
const validationError = computed(() => {
  const validated = validateTwitchSyncSettings(settings);
  if (!validated.ok) return validated.error;
  for (const id of Object.values(settings.mappings)) {
    if (id && roleWarning(id)) return roleWarning(id);
  }
  return "";
});

const intervalOptions: { label: string; value: TwitchSyncInterval }[] = [
  { label: "15 minutes", value: 15 },
  { label: "30 minutes", value: 30 },
  { label: "1 hour", value: 60 },
  { label: "6 hours", value: 360 },
];

const roleById = computed(() => new Map(state.value.roles.map((role) => [role.id, role])));
const grantableRoleOptions = computed(() => [
  { label: "No role", value: "" },
  ...state.value.roles
    .filter((role) => !role.managed && role.id !== guildId)
    .map((role) => ({ label: "@" + role.name, value: role.id })),
]);

function roleWarning(roleId: string): string | null {
  if (!roleId || state.value.rolesLoading || state.value.roles.length === 0) return null;
  return roleProblem(roleById.value.get(roleId), {
    guildId,
    botTopPosition: state.value.botTopPosition,
  });
}

function apply(next: TwitchSyncSettings) {
  settings.channelLogin = next.channelLogin;
  settings.mappings = { ...next.mappings };
  settings.syncIntervalMinutes = next.syncIntervalMinutes;
  settings.removeStaleRoles = next.removeStaleRoles;
}

async function save() {
  if (validationError.value) {
    toast.add({ title: "Invalid Twitch role mapping", description: validationError.value, color: "error" });
    return;
  }
  saving.value = true;
  try {
    const saved = await saveModuleSettings("twitch-sync", JSON.parse(JSON.stringify(settings)));
    if (saved) baseline.value = JSON.stringify(settings);
  } finally {
    saving.value = false;
  }
}
function discard() {
  apply(JSON.parse(baseline.value) as TwitchSyncSettings);
}

onMounted(async () => {
  apply(parseTwitchSyncSettings(getModuleConfig("twitch-sync")));
  baseline.value = JSON.stringify(settings);
  await loadRoles();
});
</script>
