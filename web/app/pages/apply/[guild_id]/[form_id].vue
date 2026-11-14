<template>
  <main class="mx-auto max-w-3xl px-4 py-12 text-white">
    <div class="mb-8">
      <NuxtLink to="/" class="text-sm text-violet-300 hover:underline">← MODUS</NuxtLink>
      <h1 class="mt-4 text-3xl font-bold">Server application</h1>
      <p class="mt-2 text-gray-400">Complete your application securely using your Discord account.</p>
    </div>
    <div v-if="loading" class="rounded-2xl border border-white/10 bg-white/5 p-8 text-gray-300">
      Loading application…
    </div>
    <div v-else-if="!store.isLoggedIn" class="rounded-2xl border border-white/10 bg-white/5 p-8 space-y-4">
      <p>Sign in with Discord to verify your server membership and submit this application.</p>
      <UButton color="primary" icon="i-simple-icons-discord" @click="store.loginWithDiscord(route.fullPath)">
        Continue with Discord
      </UButton>
    </div>
    <div v-else-if="error" class="rounded-xl border border-red-400/20 bg-red-400/5 p-6 text-red-200">
      {{ error }}
    </div>
    <div v-else-if="done" class="space-y-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-8">
      <UIcon name="i-lucide-circle-check" class="h-10 w-10 text-emerald-300" />
      <h2 class="text-xl font-semibold">Application submitted</h2>
      <p>Staff can now review your answers. Your reference number is <code>{{ done }}</code>.</p>
      <p class="text-sm text-gray-400">Submitting the same form again while it is pending is not allowed.</p>
    </div>
    <form v-else-if="form" class="space-y-6 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8" @submit.prevent="submit">
      <div>
        <h2 class="text-2xl font-semibold">{{ form.title }}</h2>
        <p class="mt-2 whitespace-pre-wrap text-sm text-gray-400">{{ form.description }}</p>
      </div>
      <div v-for="question in form.questions" :key="question.id" class="space-y-2">
        <label :for="question.id" class="block text-sm font-semibold">
          {{ question.label }} <span v-if="question.required" class="text-rose-400">*</span>
        </label>
        <textarea v-if="question.type === 'paragraph'" :id="question.id" v-model="answers[question.id]"
          :required="question.required" maxlength="4000" rows="5"
          class="w-full rounded-lg border border-white/15 bg-gray-900 p-3 text-white outline-none focus:border-violet-400" />
        <select v-else-if="question.type === 'select'" :id="question.id" v-model="answers[question.id]"
          :required="question.required"
          class="w-full rounded-lg border border-white/15 bg-gray-900 p-3 text-white outline-none focus:border-violet-400">
          <option value="">Choose an option</option>
          <option v-for="option in question.options" :key="option" :value="option">{{ option }}</option>
        </select>
        <input v-else :id="question.id" v-model="answers[question.id]" :required="question.required"
          maxlength="1000" type="text"
          class="w-full rounded-lg border border-white/15 bg-gray-900 p-3 text-white outline-none focus:border-violet-400" />
      </div>
      <p v-if="submitError" class="text-sm text-red-300">{{ submitError }}</p>
      <UButton type="submit" color="primary" :loading="sending" :disabled="sending">
        Submit application
      </UButton>
    </form>
  </main>
</template>

<script setup lang="ts">
definePageMeta({ layout: "auth" });
const route = useRoute();
const store = useUserStore();
const guildId = String(route.params.guild_id);
const formId = String(route.params.form_id);
interface Question { id: string; label: string; required: boolean;
  type: "short" | "paragraph" | "select"; options?: string[] }
interface FormData { id: string; title: string; description: string; questions: Question[] }
const form = ref<FormData | null>(null);
const answers = reactive<Record<string, string>>({});
const loading = ref(true);
const sending = ref(false);
const error = ref("");
const submitError = ref("");
const done = ref("");
onMounted(async () => {
  try {
    await store.init();
    if (store.isLoggedIn) {
      const result = await $fetch<{ form: FormData }>("/api/applications/form", {
        params: { guild_id: guildId, form_id: formId },
      });
      form.value = result.form;
      for (const question of result.form.questions) answers[question.id] = "";
    }
  } catch (e: any) {
    error.value = e?.data?.statusMessage || e?.message || "Unable to load this application.";
  } finally { loading.value = false; }
});
async function submit() {
  sending.value = true;
  submitError.value = "";
  try {
    const response = await $fetch<{ submission: { id: string } }>("/api/applications/submit", {
      method: "POST",
      body: { guild_id: guildId, form_id: formId, answers: { ...answers } },
    });
    done.value = response.submission.id;
  } catch (e: any) {
    submitError.value = e?.data?.statusMessage || e?.message || "Unable to submit.";
  } finally { sending.value = false; }
}
useHead({ title: "Application | MODUS" });
</script>
