<script setup lang="ts">
import { ref } from 'vue'
import { usePrefs, statusKey } from '../stores/preferences'
import Icon from '../components/Icon.vue'
defineProps<{ scope: string; nav: string[][]; title: string }>()
const p = usePrefs(),
  collapsed = ref(false)
</script>
<template>
  <div class="wrap page workspace">
    <aside>
      <button class="text-link" :aria-expanded="!collapsed" @click="collapsed = !collapsed">
        <Icon name="menu" />
        {{ p.t(scope) }}
      </button>
      <nav v-show="!collapsed" class="sidebar">
        <template v-for="[label, url, icon] in nav" :key="url">
          <RouterLink :to="url">
            <Icon :name="icon" :size="17" />
            {{ p.t(label) }}
          </RouterLink>
          <div
            v-if="scope === 'admin' && label === 'submissions' && $route.path.startsWith(url)"
            class="subnav"
          >
            <RouterLink
              v-for="status in ['PENDING', 'APPROVED', 'REJECTED']"
              :key="status"
              :to="{ path: url, query: { status } }"
            >
              {{ p.t(statusKey(status)) }}
            </RouterLink>
          </div>
        </template>
      </nav>
    </aside>
    <div class="min-w-0 stack">
      <p class="breadcrumbs">{{ p.t(scope) }} / {{ p.t(title) }}</p>
      <slot />
    </div>
  </div>
</template>
