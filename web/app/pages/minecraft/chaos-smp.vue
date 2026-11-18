<template>
  <main class="min-h-screen bg-[#0d0916] px-4 py-10 text-slate-100 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-6xl space-y-8">
      <header class="rounded-3xl border border-purple-500/30 bg-gradient-to-br from-[#361751] via-[#20112f] to-[#120b20] p-6 shadow-2xl sm:p-10">
        <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-purple-300/20 bg-purple-400/10 px-3 py-1 text-xs font-semibold tracking-widest text-purple-200">
          <UIcon name="i-lucide-gamepad-2" class="h-4 w-4" />
          ANXIETYSCOUT · CHAOS SMP
        </div>
        <h1 class="text-3xl font-black tracking-tight text-white sm:text-5xl">
          Your Minecraft <span class="text-purple-300">Dashboard</span>
        </h1>
        <p class="mt-4 max-w-2xl text-sm leading-7 text-purple-100/75 sm:text-base">
          Live Java server information, Discord access roles, the official modpack,
          and everything you need to join the CHAOS.
        </p>
        <div class="mt-6 flex flex-wrap gap-3">
          <a
            href="https://modrinth.com/modpack/anxietyscout-chaos-smp"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-500"
          >
            <UIcon name="i-lucide-package" class="h-4 w-4" />
            Download Modpack
          </a>
          <a href="https://anxietyscout.live/whitelist/" class="inline-flex items-center gap-2 rounded-xl border border-purple-300/30 px-5 py-3 text-sm font-semibold text-purple-100 transition hover:bg-purple-400/10">
            <UIcon name="i-lucide-shield-check" class="h-4 w-4" />
            Whitelist Instructions
          </a>
        </div>
      </header>

      <section aria-label="Minecraft server status" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-400">Server reachability</div>
          <div class="mt-3 flex items-center gap-2 text-xl font-bold">
            <span class="h-2.5 w-2.5 rounded-full" :class="status?.state === 'online' ? 'bg-emerald-400' : 'bg-amber-400'" />
            {{ statusPending ? 'Checking…' : status?.state === 'online' ? 'Online' : 'Unavailable' }}
          </div>
          <p class="mt-2 text-xs text-slate-400">An unavailable probe doesn't always mean the server is offline.</p>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-400">Online players</div>
          <div class="mt-3 text-xl font-bold text-white">
            {{ status?.playersOnline === null || status?.playersOnline === undefined ? '—' : status.playersOnline }}
            <span class="text-sm font-normal text-slate-400"> / {{ status?.playersMax ?? '—' }}</span>
          </div>
          <p class="mt-2 text-xs text-slate-400">Live count when status is reachable.</p>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-400">Minecraft version</div>
          <div class="mt-3 break-words text-xl font-bold text-white">{{ status?.version || 'Unknown' }}</div>
          <p class="mt-2 text-xs text-slate-400">Detected from the Java status handshake.</p>
        </div>
        <div class="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div class="text-xs font-semibold uppercase tracking-wide text-slate-400">Response time</div>
          <div class="mt-3 text-xl font-bold text-white">{{ status?.latencyMs === null || status?.latencyMs === undefined ? '—' : status.latencyMs + ' ms' }}</div>
          <button class="mt-2 text-xs font-semibold text-purple-300 hover:text-purple-200" type="button" @click="refreshStatus()">Refresh server status</button>
        </div>
      </section>

      <section class="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div class="rounded-2xl border border-purple-400/20 bg-[#1d132c] p-6">
          <h2 class="flex items-center gap-2 text-xl font-bold text-white">
            <UIcon name="i-lucide-network" class="h-5 w-5 text-purple-300" /> Connect to CHAOS SMP
          </h2>
          <p class="mt-2 text-sm text-slate-400">Minecraft Java Edition · Install the modpack first</p>
          <div class="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-purple-300/20 bg-black/30 p-3">
            <code class="min-w-0 flex-1 break-all text-sm font-bold text-purple-100">chaos.mc.anxietyscout.live</code>
            <button type="button" class="rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white hover:bg-purple-500" @click="copyAddress">
              {{ copied ? 'Copied!' : 'Copy IP' }}
            </button>
          </div>
          <p class="mt-4 text-xs text-slate-400">
            If the server asks for account verification, send the code privately to the designated CHAOS HQ verification bot.
          </p>
        </div>

        <div class="rounded-2xl border border-purple-400/20 bg-[#1d132c] p-6">
          <h2 class="flex items-center gap-2 text-xl font-bold text-white">
            <UIcon name="i-lucide-user-round-check" class="h-5 w-5 text-purple-300" /> Your Discord access
          </h2>
          <div v-if="sessionPending" class="mt-5 text-sm text-slate-300">Checking VORTIQ sign-in…</div>
          <div v-else-if="!session?.user">
            <p class="mt-3 text-sm leading-6 text-slate-300">Sign in with Discord to check your CHAOS HQ membership and SMP roles.</p>
            <a :href="discordLoginUrl" class="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#5865f2] px-4 py-3 text-sm font-bold text-white hover:bg-[#4854db]">
              <UIcon name="i-simple-icons-discord" class="h-4 w-4" /> Continue with Discord
            </a>
          </div>
          <div v-else-if="memberPending" class="mt-5 text-sm text-slate-300">Verifying your live roles with Discord…</div>
          <div v-else-if="memberError" class="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            Discord membership verification is temporarily unavailable. Your permissions were not assumed.
            <button class="ml-2 underline" type="button" @click="refreshMember()">Retry</button>
          </div>
          <div v-else-if="member" class="mt-4 space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full px-3 py-1 text-xs font-bold" :class="member.inGuild ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-200'">
                {{ member.inGuild ? 'CHAOS HQ Member' : 'Not in CHAOS HQ' }}
              </span>
              <span v-if="member.hasWhitelistRole" class="rounded-full bg-purple-400/15 px-3 py-1 text-xs font-bold text-purple-200">SMP Whitelist role</span>
              <span v-if="member.hasVerifiedRole" class="rounded-full bg-purple-400/15 px-3 py-1 text-xs font-bold text-purple-200">SMP Verified role</span>
            </div>
            <p class="text-sm text-slate-300">
              {{ member.roleConfigurationReady
                ? member.canViewMemberResources
                  ? 'Your Discord account has an SMP access role.'
                  : 'Your Discord account does not currently have an SMP access role.'
                : 'The SMP role IDs still need to be configured in VORTIQ.' }}
            </p>
            <p class="text-xs leading-5 text-slate-400">
              Discord role verification is separate from Minecraft account linkage and the actual server whitelist.
            </p>
          </div>
          <div v-else class="mt-4 text-sm text-slate-300">Sign-in complete. Checking your account…</div>
        </div>
      </section>

      <section class="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 class="text-xl font-bold text-white">Getting started</h2>
        <div class="mt-5 grid gap-4 md:grid-cols-3">
          <div v-for="step in steps" :key="step.number" class="rounded-xl border border-white/10 bg-black/20 p-4">
            <div class="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/20 text-sm font-black text-purple-200">{{ step.number }}</div>
            <h3 class="font-semibold text-white">{{ step.title }}</h3>
            <p class="mt-2 text-sm leading-6 text-slate-400">{{ step.description }}</p>
          </div>
        </div>
      </section>
      <footer class="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-400">
        <a href="https://anxietyscout.live/minecraft-dashboard/" class="text-purple-300 hover:text-purple-200">Back to AnxietyScout Community</a>
        <span>Powered by VORTIQ · No Minecraft accounts are linked by this page</span>
      </footer>
    </div>
  </main>
</template>

<script setup lang="ts">
type ServerStatus = {
  address: string;
  state: "online" | "unreachable";
  playersOnline: number | null;
  playersMax: number | null;
  version: string | null;
  latencyMs: number | null;
  checkedAt: string;
};
type Session = {
  user: { id: string; username: string; globalName?: string | null } | null;
};
type MemberAccess = {
  inGuild: boolean;
  roleConfigurationReady: boolean;
  hasWhitelistRole: boolean;
  hasVerifiedRole: boolean;
  canViewMemberResources: boolean;
  discordDisplayName: string | null;
  checkedAt: string;
};
const discordLoginUrl = "/api/auth/discord?returnTo=%2Fminecraft%2Fchaos-smp";
const copied = ref(false);
const steps = [
  { number: 1, title: "Install the modpack", description: "Install the official AnxietyScout Chaos SMP pack from Modrinth and launch the required version." },
  { number: 2, title: "Get your Discord role", description: "Join CHAOS HQ, verify your Discord account, and follow the SMP Whitelist onboarding instructions." },
  { number: 3, title: "Connect and verify", description: "Join chaos.mc.anxietyscout.live. If the server returns a verification code, privately DM it to the verification bot and reconnect once approved." },
];
const { data: status, pending: statusPending, refresh: refreshStatus } =
  await useFetch<ServerStatus>("/api/minecraft/chaos-smp/status", { server: false });
const { data: session, pending: sessionPending } =
  await useFetch<Session>("/api/auth/session", { server: false });
const { data: member, pending: memberPending, error: memberError, execute: refreshMember } =
  useFetch<MemberAccess>("/api/minecraft/chaos-smp/member", {
    server: false,
    immediate: false,
  });
watch(() => session.value?.user?.id, (id) => {
  if (id) void refreshMember();
}, { immediate: true });
async function copyAddress() {
  try {
    await navigator.clipboard.writeText("chaos.mc.anxietyscout.live");
    copied.value = true;
  } catch {
    copied.value = false;
  }
}
useHead({
  title: "CHAOS SMP Minecraft Dashboard | VORTIQ",
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
</script>
