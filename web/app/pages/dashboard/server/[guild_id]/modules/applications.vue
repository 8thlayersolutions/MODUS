<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <DashboardModuleHeader :guild-id="guildId" icon="i-lucide-clipboard-list"
      title="Applications" description="Build application forms for Discord and web, then review every submission."
      :enabled="isModuleEnabled('applications')" />

    <div class="flex flex-wrap gap-2">
      <UButton :variant="tab === 'forms' ? 'solid' : 'soft'" @click="tab = 'forms'">Forms</UButton>
      <UButton :variant="tab === 'review' ? 'solid' : 'soft'" @click="tab = 'review'; loadQueue()">Submissions</UButton>
      <UButton :variant="tab === 'settings' ? 'solid' : 'soft'" @click="tab = 'settings'">Settings</UButton>
    </div>

    <DashboardModuleSection v-if="tab === 'forms'" title="Application forms"
      description="Each form can be completed in Discord if it has five or fewer text questions. Larger forms use the MODUS website.">
      <template #actions>
        <UButton icon="i-lucide-plus" color="primary" @click="newForm">New form</UButton>
      </template>
      <p v-if="loading" class="text-sm text-gray-400">Loading forms…</p>
      <p v-if="!loading && !forms.length" class="py-6 text-sm text-gray-400">No applications configured yet.</p>
      <div v-for="form in forms" :key="form.id" class="flex flex-wrap items-center gap-3 border-b border-white/10 py-3">
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-white">{{ form.title }}</p>
          <p class="text-xs text-gray-400">{{ form.open ? 'Open' : 'Closed' }} · {{ form.questions.length }} questions · v{{ form.version }}</p>
        </div>
        <UButton size="sm" variant="soft" @click="editForm(form)">Edit</UButton>
        <UButton size="sm" variant="soft" icon="i-lucide-send" @click="panelForm = form; tab = 'settings'">Post panel</UButton>
        <UButton size="sm" variant="ghost" :to="`/apply/${guildId}/${form.id}`" target="_blank">Preview link</UButton>
      </div>
    </DashboardModuleSection>

    <DashboardModuleSection v-if="tab === 'forms' && editor" title="Form builder"
      description="Changing questions creates a new form version. Existing submissions retain their original question labels.">
      <div class="space-y-5">
        <UFormField label="Title"><UInput v-model="draft.title" maxlength="100" class="w-full" /></UFormField>
        <UFormField label="Description"><UTextarea v-model="draft.description" :rows="3" maxlength="2000" class="w-full" /></UFormField>
        <div class="flex flex-wrap gap-5 text-sm text-gray-300">
          <label class="flex items-center gap-2"><input v-model="draft.open" type="checkbox" /> Open for applications</label>
          <label class="flex items-center gap-2">Reapply cooldown (days)
            <input v-model.number="draft.cooldownDays" type="number" min="0" max="365"
              class="w-24 rounded border border-white/20 bg-gray-900 px-2 py-1 text-white" />
          </label>
        </div>
        <UFormField label="Role granted on approval">
          <select v-model="draft.approvalRoleId" class="w-full rounded border border-white/20 bg-gray-900 p-2 text-white">
            <option :value="null">No automatic role</option>
            <option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option>
          </select>
        </UFormField>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-white">Questions ({{ draft.questions.length }}/20)</h3>
          <UButton variant="soft" size="sm" icon="i-lucide-plus" :disabled="draft.questions.length >= 20"
            @click="addQuestion">Add question</UButton>
        </div>
        <div v-for="(q, index) in draft.questions" :key="q.id"
          class="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <div class="flex justify-between gap-3">
            <span class="text-xs font-medium text-gray-400">Question {{ index + 1 }}</span>
            <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2"
              @click="draft.questions.splice(index, 1)">Remove</UButton>
          </div>
          <UInput v-model="q.label" maxlength="100" placeholder="Question text" class="w-full" />
          <div class="flex flex-wrap gap-4 text-sm text-gray-300">
            <select v-model="q.type" class="rounded border border-white/20 bg-gray-900 p-2 text-white">
              <option value="short">Short text</option>
              <option value="paragraph">Long text</option>
              <option value="select">Dropdown</option>
            </select>
            <label class="flex items-center gap-2"><input v-model="q.required" type="checkbox" /> Required</label>
          </div>
          <UTextarea v-if="q.type === 'select'" :model-value="(q.options || []).join('\n')"
            :rows="3" placeholder="One option per line (2–20)"
            @update:model-value="q.options = String($event).split('\n').map(x => x.trim()).filter(Boolean)" />
        </div>
        <p v-if="formError" class="text-sm text-red-300">{{ formError }}</p>
        <div class="flex gap-2">
          <UButton color="primary" :loading="saving" @click="saveForm">Save form</UButton>
          <UButton color="neutral" variant="soft" @click="editor = false">Cancel</UButton>
        </div>
      </div>
    </DashboardModuleSection>

    <DashboardModuleSection v-if="tab === 'review'" title="Application review queue"
      description="Decisions are final. All submissions are restricted to this Discord server.">
      <div class="mb-4 flex flex-wrap gap-2">
        <select v-model="status" class="rounded border border-white/20 bg-gray-900 p-2 text-sm text-white"
          @change="loadQueue">
          <option value="">All statuses</option><option value="pending">Pending</option>
          <option value="in_review">In review</option><option value="approved">Approved</option>
          <option value="denied">Denied</option>
        </select>
        <UButton variant="soft" :loading="queueLoading" @click="loadQueue">Refresh</UButton>
      </div>
      <p v-if="queueLoading" class="text-gray-400">Loading submissions…</p>
      <p v-else-if="!submissions.length" class="py-6 text-gray-400">No applications found.</p>
      <div v-for="s in submissions" :key="s.id" class="space-y-3 border-b border-white/10 py-4">
        <div class="flex flex-wrap justify-between gap-2">
          <div>
            <p class="font-semibold text-white">{{ formTitle(s.formId) }}</p>
            <p class="text-xs text-gray-400">Applicant: {{ s.applicantId }} · {{ s.source }} · {{ new Date(s.createdAt).toLocaleString() }}</p>
          </div>
          <UBadge variant="subtle">{{ s.status }}</UBadge>
        </div>
        <details class="text-sm text-gray-200">
          <summary class="cursor-pointer text-violet-300">View answers</summary>
          <div v-for="q in s.questionsSnapshot" :key="q.id" class="mt-3 rounded bg-white/[0.03] p-3">
            <p class="text-xs font-semibold text-gray-400">{{ q.label }}</p>
            <p class="mt-1 whitespace-pre-wrap break-words">{{ s.answers[q.id] || '—' }}</p>
          </div>
        </details>
        <div v-if="['pending', 'in_review'].includes(s.status)" class="flex flex-wrap items-center gap-2">
          <UButton v-if="s.status === 'pending'" size="sm" variant="soft"
            @click="review(s, 'in_review')">In review</UButton>
          <UButton size="sm" color="success" @click="review(s, 'approved')">Approve</UButton>
          <UButton size="sm" color="error" @click="review(s, 'denied')">Deny</UButton>
        </div>
        <p v-if="s.reason" class="text-xs text-gray-400">Decision note: {{ s.reason }}</p>
      </div>
    </DashboardModuleSection>

    <DashboardModuleSection v-if="tab === 'settings'" title="Notifications and Discord panels"
      description="Reviewer roles apply to Discord commands. Dashboard reviewers can also be delegated through Module Access.">
      <div class="space-y-4">
        <UFormField label="Review notification channel">
          <select v-model="config.reviewChannelId" class="w-full rounded border border-white/20 bg-gray-900 p-2 text-white">
            <option value="">None</option>
            <option v-for="ch in channels" :key="ch.id" :value="ch.id">#{{ ch.name }}</option>
          </select>
        </UFormField>
        <UFormField label="Reviewer roles">
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label v-for="role in roles" :key="role.id" class="flex items-center gap-2 text-sm text-gray-300">
              <input v-model="config.staffRoleIds" type="checkbox" :value="role.id" /> {{ role.name }}
            </label>
          </div>
        </UFormField>
        <UButton :loading="savingSettings" @click="saveSettings">Save settings</UButton>
        <div class="border-t border-white/10 pt-5">
          <h3 class="font-semibold text-white">Publish a panel</h3>
          <p class="mb-3 text-sm text-gray-400">Members click Apply Now in Discord to open the native form or web link.</p>
          <select v-model="panelId" class="mb-3 w-full rounded border border-white/20 bg-gray-900 p-2 text-white">
            <option value="">Choose a form</option>
            <option v-for="form in forms" :key="form.id" :value="form.id">{{ form.title }}</option>
          </select>
          <select v-model="panelChannelId" class="mb-3 w-full rounded border border-white/20 bg-gray-900 p-2 text-white">
            <option value="">Choose a channel</option>
            <option v-for="ch in channels" :key="ch.id" :value="ch.id">#{{ ch.name }}</option>
          </select>
          <div><UButton :loading="posting" :disabled="!panelId || !panelChannelId" @click="postPanel">
            Post or update panel
          </UButton></div>
        </div>
      </div>
    </DashboardModuleSection>
    <p v-if="notice" class="rounded-lg border border-white/10 px-4 py-3 text-sm text-gray-200">{{ notice }}</p>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const guildId = String(route.params.guild_id);
const { isModuleEnabled, getModuleConfig, saveModuleSettings, loadChannels, loadRoles,
  channelOptions, roleOptions } = useServerSettings(guildId);
const tab = ref<"forms" | "review" | "settings">("forms");
type Question = { id: string; label: string; type: "short" | "paragraph" | "select";
  required: boolean; options?: string[] };
type Form = { id: string; guildId: string; title: string; description: string;
  questions: Question[]; version: number; open: boolean; approvalRoleId: string | null;
  cooldownDays: number; panelChannelId: string | null; panelMessageId: string | null };
type Submission = { id: string; formId: string; applicantId: string; source: string;
  status: string; createdAt: string; answers: Record<string, string>;
  questionsSnapshot: Question[]; reason: string | null };
const forms = ref<Form[]>([]);
const submissions = ref<Submission[]>([]);
const loading = ref(true);
const queueLoading = ref(false);
const saving = ref(false);
const savingSettings = ref(false);
const posting = ref(false);
const editor = ref(false);
const formError = ref("");
const notice = ref("");
const status = ref("");
const roles = computed(() => roleOptions.value);
const channels = computed(() => channelOptions.value);
const panelId = ref("");
const panelChannelId = ref("");
const panelForm = computed({
  get: () => forms.value.find(f => f.id === panelId.value) || null,
  set: (form: Form | null) => { panelId.value = form?.id || ""; },
});
const config = reactive<{ reviewChannelId: string; staffRoleIds: string[] }>({
  reviewChannelId: "", staffRoleIds: [],
});
const empty = () => ({ id: "", title: "", description: "", open: true,
  approvalRoleId: null as string | null, cooldownDays: 7, questions: [] as Question[] });
const draft = reactive(empty());
const formTitle = (id: string) => forms.value.find(f => f.id === id)?.title || id;
let number = 0;
function addQuestion() {
  if (draft.questions.length >= 20) return;
  number++;
  draft.questions.push({ id: `q_${Date.now().toString(36)}_${number}`,
    label: "", type: "short", required: true });
}
function newForm() {
  Object.assign(draft, empty());
  editor.value = true;
  formError.value = "";
  addQuestion();
}
function editForm(form: Form) {
  Object.assign(draft, { id: form.id, title: form.title,
    description: form.description, open: form.open,
    approvalRoleId: form.approvalRoleId, cooldownDays: form.cooldownDays,
    questions: form.questions.map(q => ({ ...q, options: q.options ? [...q.options] : undefined })) });
  editor.value = true;
  formError.value = "";
}
async function loadForms() {
  loading.value = true;
  try {
    const result = await $fetch<{ forms: Form[] }>("/api/applications/manage", {
      params: { guild_id: guildId },
    });
    forms.value = result.forms;
  } catch (err: any) {
    notice.value = err?.data?.statusMessage || "Couldn't load application forms.";
  } finally { loading.value = false; }
}
async function saveForm() {
  saving.value = true;
  formError.value = "";
  try {
    if (!draft.questions.length) throw new Error("Add at least one question.");
    const body = { guild_id: guildId, title: draft.title, description: draft.description,
      open: draft.open, cooldownDays: draft.cooldownDays,
      approvalRoleId: draft.approvalRoleId, questions: draft.questions };
    if (draft.id) {
      await $fetch(`/api/applications/forms/${draft.id}`, { method: "PUT", body });
    } else {
      await $fetch("/api/applications/forms", { method: "POST", body });
    }
    editor.value = false;
    notice.value = "Form saved.";
    await loadForms();
  } catch (err: any) {
    formError.value = err?.data?.statusMessage || err?.message || "Could not save form.";
  } finally { saving.value = false; }
}
async function loadQueue() {
  queueLoading.value = true;
  try {
    const result = await $fetch<{ submissions: Submission[] }>("/api/applications/queue", {
      params: { guild_id: guildId, ...(status.value ? { status: status.value } : {}) },
    });
    submissions.value = result.submissions;
  } catch (err: any) {
    notice.value = err?.data?.statusMessage || "Couldn't load applications.";
  } finally { queueLoading.value = false; }
}
async function review(s: Submission, next: "approved" | "denied" | "in_review") {
  const reason = next === "in_review" ? "" : (prompt("Optional review note/reason (up to 1,000 characters)") || "");
  if (reason.length > 1000) { notice.value = "Reason is too long."; return; }
  if (!confirm(`Mark application ${s.id} as ${next}?`)) return;
  try {
    const result = await $fetch<{ roleAssigned: boolean | null; notified: boolean }>("/api/applications/review", {
      method: "POST", body: { guild_id: guildId, id: s.id, status: next, reason },
    });
    notice.value = result.roleAssigned === false
      ? "Decision saved, but role assignment failed. Check the bot's permissions and role hierarchy."
      : "Decision saved.";
    await loadQueue();
  } catch (err: any) {
    notice.value = err?.data?.statusMessage || err?.message || "Review failed.";
  }
}
async function saveSettings() {
  savingSettings.value = true;
  try {
    const ok = await saveModuleSettings("applications", {
      reviewChannelId: config.reviewChannelId || null,
      staffRoleIds: config.staffRoleIds,
    });
    notice.value = ok ? "Settings saved." : "Could not save settings.";
  } finally { savingSettings.value = false; }
}
async function postPanel() {
  posting.value = true;
  try {
    await $fetch("/api/applications/panel", { method: "POST",
      body: { guild_id: guildId, form_id: panelId.value, channel_id: panelChannelId.value } });
    notice.value = "Discord panel posted or updated.";
    await loadForms();
  } catch (err: any) {
    notice.value = err?.data?.statusMessage || err?.message || "Panel publish failed.";
  } finally { posting.value = false; }
}
onMounted(async () => {
  await Promise.all([loadForms(), loadChannels(), loadRoles()]);
  const saved = getModuleConfig("applications");
  if (saved) {
    config.reviewChannelId = typeof saved.reviewChannelId === "string" ? saved.reviewChannelId : "";
    config.staffRoleIds = Array.isArray(saved.staffRoleIds) ? saved.staffRoleIds : [];
  }
});
useHead({ title: "Applications | MODUS" });
</script>
