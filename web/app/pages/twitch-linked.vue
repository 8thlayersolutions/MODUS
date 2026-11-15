<template>
  <main class="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
    <UIcon :name="status === 'success' ? 'i-lucide-check-circle-2' : 'i-lucide-alert-circle'" class="h-12 w-12 text-teal-300" />
    <h1 class="text-2xl font-semibold text-white">{{ title }}</h1>
    <p class="text-sm text-gray-300">{{ description }}</p>
    <UButton v-if="status === 'success' && validGuildId" type="button" color="neutral" variant="outline" @click="disconnect">Disconnect from MODUS</UButton>
    <UButton to="/" variant="outline">Return to MODUS</UButton>
  </main>
</template>
<script setup lang="ts">
import { twitchOAuthConnectPath } from "~/utils/twitch-oauth-navigation";
const route = useRoute();
const status = computed(() => String(route.query.status || "error"));
const guildId = String(route.query.guild_id || "");
const validGuildId = computed(() => /^[0-9]{15,22}$/.test(guildId));
function disconnect() {
  if (!validGuildId.value) return;
  window.location.assign(twitchOAuthConnectPath("member", guildId, "disconnect"));
}
const title = computed(() => status.value === "success" ? "Twitch account linked" : status.value === "disconnected" ? "Account disconnected" : status.value === "partial" ? "Account disconnected — role cleanup incomplete" : "Unable to link Twitch");
const descriptions: Record<string, string> = {
  success: "MODUS can now check your existing Discord-connected Twitch account to assign your configured server roles.",
  denied: "Discord authorization was declined.",
  "no-connection": "Your Discord account does not currently have a Twitch connection. Add one in Discord Settings → Connections, then try again.",
  disconnected: "Your saved account credentials were deleted and previously granted Twitch Sync roles were removed.",
  partial: "Your credentials were deleted, but some previously assigned roles could not be removed. Ask your server staff to review them.",
  error: "MODUS could not verify your Discord account, server membership, or Twitch connection. Please try again.",
};
const description = computed(() => descriptions[status.value] || "Please retry the link.");
</script>
