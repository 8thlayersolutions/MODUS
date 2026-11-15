<template>
  <main class="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
    <UIcon :name="status === 'success' ? 'i-lucide-check-circle-2' : 'i-lucide-alert-circle'" class="h-12 w-12 text-teal-300" />
    <h1 class="text-2xl font-semibold text-white">{{ title }}</h1>
    <p class="text-sm text-gray-300">{{ description }}</p>
    <UButton to="/" variant="outline">Return to MODUS</UButton>
  </main>
</template>
<script setup lang="ts">
const route = useRoute();
const status = computed(() => String(route.query.status || "error"));
const title = computed(() => status.value === "success" ? "Twitch account linked" : "Unable to link Twitch");
const description = computed(() => ({
  success: "MODUS can now check your existing Discord-connected Twitch account to assign your configured server roles.",
  denied: "Discord authorization was declined.",
  "no-connection": "Your Discord account does not currently have a Twitch connection. Add one in Discord Settings → Connections, then try again.",
  error: "MODUS could not verify your Discord account, server membership, or Twitch connection. Please try again.",
}[status.value] || "Please retry the link.");
</script>
