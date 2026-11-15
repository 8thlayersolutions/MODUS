<template>
  <main class="min-h-screen p-4 sm:p-8" :style="{ backgroundColor: data?.theme.backgroundColor || '#0b0b12', color: data?.theme.textColor || '#f1f1f5' }">
    <div class="mx-auto max-w-5xl">
      <div v-if="pending" class="py-12 text-center">Loading staff directory…</div>
      <div v-else-if="error" class="py-12 text-center">This staff directory is unavailable.</div>
      <template v-else-if="data">
        <header class="mb-8">
          <h1 class="text-3xl font-bold">{{ data.title }}</h1>
          <p class="mt-2 opacity-75">{{ data.description }}</p>
        </header>
        <section v-for="group in data.sections" :key="group.id" class="mb-10">
          <div class="mb-4 border-l-4 pl-4" :style="{ borderColor: data.theme.accentColor }">
            <h2 class="text-xl font-semibold">{{ group.title }}</h2>
            <p class="text-sm opacity-70">{{ group.description }}</p>
          </div>
          <div v-if="!group.members.length" class="text-sm opacity-60">No staff listed yet.</div>
          <div v-else :class="data.theme.layout === 'cards' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'flex flex-col gap-2'">
            <article v-for="person in group.members" :key="person.id"
              class="flex items-center gap-3 rounded-xl border border-white/10 p-4"
              :style="{ backgroundColor: data.theme.cardColor }">
              <img v-if="data.theme.showAvatars && person.avatarUrl" :src="person.avatarUrl"
                :alt="person.name" loading="lazy" class="h-12 w-12 rounded-full object-cover" />
              <div v-else class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-bold"
                :style="{ backgroundColor: data.theme.accentColor }">{{ person.name.slice(0, 1).toUpperCase() }}</div>
              <div class="min-w-0">
                <a class="font-semibold hover:underline" :href="'https://discord.com/users/' + person.id" target="_blank" rel="noopener noreferrer">{{ person.name }}</a>
                <div v-if="data.theme.showRoleBadges" class="mt-1 flex flex-wrap gap-1">
                  <span v-for="badge in person.badges" :key="badge.id" class="rounded px-2 py-0.5 text-xs"
                    :style="{ backgroundColor: '#' + badge.color.toString(16).padStart(6, '0') + '33' }">{{ badge.name }}</span>
                </div>
              </div>
            </article>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
const route = useRoute();
const guildId = route.params.guild_id as string;
const { data, pending, error } = await useFetch<any>('/api/staff-list/' + encodeURIComponent(guildId));
useHead({
  title: computed(() => data.value?.title ? data.value.title + ' | Staff Directory' : 'Staff Directory'),
  meta: [{ name: 'robots', content: 'noindex, follow' }],
});
</script>
