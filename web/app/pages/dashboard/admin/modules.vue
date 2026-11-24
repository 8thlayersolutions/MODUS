<template>
  <div class="p-8 space-y-8">
    <!-- Header -->
    <AdminPageHeader
      icon="i-heroicons-squares-2x2"
      title="Global Modules"
      description="Enable or disable modules globally for all servers. Server-specific settings can still override these if the module is enabled here."
    />

    <!-- CHAOS SMP is a web dashboard feature, not a Discord bot module. -->
    <section class="glide-tile rounded-2xl border border-purple-500/15 p-6 space-y-5" aria-labelledby="minecraft-visibility-heading">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-purple-500/15 text-purple-200">
            <UIcon name="i-lucide-pickaxe" class="h-5 w-5" />
          </span>
          <div>
            <h2 id="minecraft-visibility-heading" class="text-base font-bold text-white">
              Minecraft Dashboard — Guild Visibility
            </h2>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-gray-400">
              Show the CHAOS SMP dashboard in only the Discord server dashboards
              listed below. This does not enable a Minecraft bot module in other servers.
            </p>
          </div>
        </div>
        <USwitch
          v-model="minecraftEnabled"
          :disabled="minecraftLoading || !minecraftLoaded || minecraftSaving"
          aria-label="Enable Minecraft dashboard navigation"
        />
      </div>
      <div v-if="minecraftLoading" class="text-sm text-gray-400">Loading guild settings…</div>
      <div v-else-if="!minecraftLoaded" class="space-y-2">
        <p class="text-sm text-amber-300">Could not load saved guild settings. Editing is disabled.</p>
        <UButton size="sm" variant="soft" @click="fetchMinecraftVisibility">Retry</UButton>
      </div>
      <template v-else>
        <UFormField label="Allowed Discord Guild IDs" hint="One per line, or separated by commas/spaces. Maximum 50.">
          <UTextarea
            v-model="minecraftGuildText"
            :rows="4"
            class="w-full font-mono"
            placeholder="978327073196232704"
            :disabled="minecraftSaving"
          />
        </UFormField>
        <p v-if="minecraftValidationError" class="text-xs text-rose-300" role="alert">
          {{ minecraftValidationError }}
        </p>
        <p v-else class="text-xs text-gray-400">
          {{ minecraftParsedIds.length }} guild{{ minecraftParsedIds.length === 1 ? '' : 's' }} allowed.
          An empty list hides the dashboard everywhere.
        </p>
        <UFormField label="Reason for changing visibility" hint="Required; recorded in the bot administration audit trail.">
          <UInput
            v-model="minecraftReason"
            class="w-full"
            placeholder="e.g. Limit the Minecraft portal to CHAOS HQ"
            :disabled="minecraftSaving"
          />
        </UFormField>
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <p class="max-w-xl text-xs leading-5 text-gray-400">
            Only approved guild dashboards show the link. Private Discord role data
            is checked server-side; public Minecraft server statistics remain public.
          </p>
          <UButton
            icon="i-lucide-save"
            :loading="minecraftSaving"
            :disabled="!minecraftDirty || Boolean(minecraftValidationError) || !minecraftReason.trim() || minecraftSaving"
            @click="saveMinecraftVisibility"
          >
            Save Minecraft Guild Access
          </UButton>
        </div>
      </template>
    </section>

    <!-- Loading -->
    <div v-if="modulesLoading" class="flex justify-center py-12">
      <UIcon
        name="i-lucide-loader-circle"
        class="w-8 h-8 animate-spin text-primary-400"
      />
    </div>

    <!-- Empty -->
    <div
      v-else-if="modules.length === 0"
      class="text-center py-16 rounded-3xl border-2 border-dashed border-white/8"
    >
      <UIcon
        name="i-lucide-package-open"
        class="w-12 h-12 text-gray-600 mx-auto mb-3"
      />
      <p class="text-gray-500">
        No modules found. Make sure the bot has registered them.
      </p>
      <UButton
        icon="i-lucide-loader-circle"
        variant="ghost"
        class="mt-4"
        @click="fetchModules"
      >
        Refresh
      </UButton>
    </div>

    <!-- Modules list -->
    <div v-else class="space-y-3">
      <div
        v-for="module in modules"
        :key="module.$id"
        class="glide-tile glide-tile-hover rounded-2xl p-5 flex items-center gap-4"
      >
        <div
          class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          :class="getModuleDisplay(module).bgClass"
        >
          <UIcon
            :name="getModuleDisplay(module).icon"
            class="w-5 h-5"
            :class="getModuleDisplay(module).iconClass"
          />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold text-white truncate">{{ module.name }}</p>
          <p class="text-xs text-gray-500 truncate mt-0.5">
            {{ module.description }}
          </p>
        </div>
        <UBadge
          :color="module.enabled ? 'success' : 'neutral'"
          variant="soft"
          class="shrink-0"
        >
          {{ module.enabled ? "Active" : "Disabled" }}
        </UBadge>
        <USwitch
          :model-value="module.enabled"
          :loading="updating === module.$id"
          @update:model-value="(value) => requestToggle(module, Boolean(value))"
          class="shrink-0"
        />
      </div>
    </div>

    <!-- Toggle confirmation -->
    <UModal v-model:open="confirmOpen" :title="confirmTitle">
      <template #body>
        <div class="space-y-4 p-1">
          <p class="text-sm text-gray-400">{{ confirmDescription }}</p>
          <UFormField
            label="Reason"
            :required="pendingEnabled === false"
            :hint="pendingEnabled === false ? undefined : 'Optional'"
          >
            <UTextarea
              v-model="reason"
              placeholder="Why is this changing?"
              class="w-full"
              :rows="3"
            />
          </UFormField>
        </div>
        <div class="flex justify-end gap-2 pt-4">
          <UButton variant="ghost" @click="confirmOpen = false">Cancel</UButton>
          <UButton
            :color="pendingEnabled === false ? 'error' : 'primary'"
            :loading="submitting"
            :disabled="pendingEnabled === false && !reason.trim()"
            @click="submitToggle"
          >
            {{ pendingEnabled === false ? "Disable" : "Enable" }}
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Admin Access Info -->
    <div
      class="rounded-2xl p-6 border border-primary-500/10 bg-primary-500/5"
    >
      <div class="flex items-center gap-3 mb-2">
        <UIcon
          name="i-lucide-info"
          class="w-5 h-5 text-primary-400 flex-shrink-0"
        />
        <h2 class="text-sm font-bold text-white">Admin Access</h2>
      </div>
      <p class="text-sm text-gray-400">
        Admin access is managed via the
        <code class="text-xs bg-gray-800 px-1.5 py-0.5 rounded">
          NUXT_PUBLIC_BOT_ADMIN_IDS
        </code>
        env var. Discord user IDs listed there get access to this
        dashboard.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { ModuleDoc } from "@modus/db";
import { getModuleDisplay } from "~/utils/module-metadata";

const toast = useToast();
interface MinecraftVisibility {
  enabled: boolean;
  allowedGuildIds: string[];
}
const minecraftLoading = ref(false);
const minecraftLoaded = ref(false);
const minecraftSaving = ref(false);
const minecraftEnabled = ref(true);
const minecraftGuildText = ref("");
const minecraftReason = ref("");
const savedMinecraft = ref<MinecraftVisibility | null>(null);

const minecraftRawIds = computed(() => minecraftGuildText.value.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean));
const minecraftParsedIds = computed(() => [...new Set(minecraftRawIds.value)]);
const minecraftValidationError = computed(() => {
  if (minecraftRawIds.value.length > 50) return "Maximum 50 Discord Guild IDs.";
  if (minecraftRawIds.value.some((id) => !/^\d{17,22}$/.test(id))) {
    return "Each Guild ID must contain 17–22 digits (numbers only).";
  }
  return "";
});
const minecraftDirty = computed(() => {
  const prev = savedMinecraft.value;
  if (!prev) return false;
  return prev.enabled !== minecraftEnabled.value ||
    JSON.stringify([...prev.allowedGuildIds].sort()) !== JSON.stringify([...minecraftParsedIds.value].sort());
});

const fetchMinecraftVisibility = async () => {
  minecraftLoading.value = true;
  minecraftLoaded.value = false;
  try {
    const config = await $fetch<MinecraftVisibility>("/api/admin/minecraft-dashboard");
    minecraftEnabled.value = config.enabled;
    minecraftGuildText.value = config.allowedGuildIds.join("\n");
    savedMinecraft.value = config;
    minecraftLoaded.value = true;
    minecraftReason.value = "";
  } catch (error) {
    console.error("Failed to read Minecraft guild settings:", error);
    toast.add({ title: "Minecraft configuration unavailable", color: "error" });
  } finally {
    minecraftLoading.value = false;
  }
};

const saveMinecraftVisibility = async () => {
  if (!minecraftLoaded.value || !minecraftDirty.value ||
      minecraftValidationError.value || !minecraftReason.value.trim()) return;
  minecraftSaving.value = true;
  try {
    await $fetch("/api/admin/minecraft-dashboard", {
      method: "PATCH",
      body: {
        enabled: minecraftEnabled.value,
        allowedGuildIds: minecraftParsedIds.value,
        reason: minecraftReason.value.trim(),
      },
    });
    toast.add({
      title: "Minecraft visibility saved",
      description: "Allowed guilds will see the dashboard after refreshing their VORTIQ navigation.",
      color: "success",
    });
    await fetchMinecraftVisibility();
  } catch (error) {
    console.error("Failed to save Minecraft guild settings:", error);
    toast.add({ title: "Could not save Minecraft guild access", color: "error" });
  } finally {
    minecraftSaving.value = false;
  }
};


const modulesLoading = ref(false);
const modules = ref<ModuleDoc[]>([]);
const updating = ref<string | null>(null);

const fetchModules = async () => {
  modulesLoading.value = true;
  try {
    modules.value = await $fetch<ModuleDoc[]>("/api/modules");
  } catch (error) {
    console.error("Error fetching modules:", error);
  } finally {
    modulesLoading.value = false;
  }
};

const confirmOpen = ref(false);
const pendingModule = ref<ModuleDoc | null>(null);
const pendingEnabled = ref(true);
const reason = ref("");
const submitting = ref(false);

const confirmTitle = computed(() =>
  pendingModule.value
    ? `${pendingEnabled.value ? "Enable" : "Disable"} ${pendingModule.value.name}?`
    : "",
);
const confirmDescription = computed(() =>
  pendingEnabled.value
    ? "This re-enables the module fleet-wide for every server. A reason is optional."
    : "This disables the module fleet-wide for every server. A reason is required.",
);

const requestToggle = (module: ModuleDoc, enabled: boolean) => {
  pendingModule.value = module;
  pendingEnabled.value = enabled;
  reason.value = "";
  confirmOpen.value = true;
};

const submitToggle = async () => {
  const module = pendingModule.value;
  if (!module || (pendingEnabled.value === false && !reason.value.trim())) return;

  submitting.value = true;
  updating.value = module.$id;
  try {
    const response = await $fetch<{
      success: true;
      auditEventId: string;
      syncWarning?: string;
    }>(`/api/modules/${encodeURIComponent(module.name)}`, {
      method: "PATCH",
      body: {
        enabled: pendingEnabled.value,
        reason: reason.value.trim() || undefined,
      },
    });
    module.enabled = pendingEnabled.value;
    confirmOpen.value = false;
    toast.add({
      title: response.syncWarning ? "Saved with a warning" : "Success",
      description:
        response.syncWarning ?? `Global status for ${module.name} updated.`,
      color: response.syncWarning ? "warning" : "success",
    });
  } catch (error) {
    console.error("Error updating module:", error);
    toast.add({
      title: "Error",
      description: "Failed to update global module status.",
      color: "error",
    });
  } finally {
    submitting.value = false;
    updating.value = null;
  }
};

onMounted(() => { void fetchModules(); void fetchMinecraftVisibility(); });
</script>
