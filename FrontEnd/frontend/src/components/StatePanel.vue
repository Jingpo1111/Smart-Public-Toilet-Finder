<script setup lang="ts">
import { usePrefs } from '../stores/preferences'
import Icon from './Icon.vue'
withDefaults(
  defineProps<{
    phase?: string
    error?: string
    title?: string
    description?: string
    retry?: boolean
    cards?: number // show this many card-shaped placeholders while loading (matches the real layout)
  }>(),
  { phase: 'empty' },
)
defineEmits<{ retry: [] }>()
const p = usePrefs()
</script>
<template>
  <div
    v-if="phase === 'loading' && cards"
    class="card-grid"
    role="status"
    aria-busy="true"
    :aria-label="p.t('loading')"
  >
    <div v-for="n in cards" :key="n" class="toilet-card skeleton-card" aria-hidden="true">
      <div class="shimmer photo" />
      <div class="card-info">
        <i class="shimmer" />
        <i class="shimmer" />
        <i class="shimmer short" />
      </div>
    </div>
  </div>
  <div v-else-if="phase === 'loading'" class="skeleton" role="status" :aria-label="p.t('loading')">
    <i class="shimmer" />
    <i class="shimmer" />
    <i class="shimmer" />
  </div>
  <div v-else class="state-panel" role="status">
    <img
      :src="'/images/illustrations/' + (phase === 'error' ? 'error' : 'empty-results') + '.svg'"
      alt=""
      width="88"
      height="69"
    />
    <div>
      <strong>{{ p.t(title || (phase === 'error' ? 'offlineTitle' : 'empty')) }}</strong>
      <p v-if="description !== title || error">
        {{ p.t(error || description || (phase === 'error' ? 'networkError' : 'emptyText')) }}
      </p>
    </div>
    <button v-if="retry" class="btn subtle" @click="$emit('retry')">
      <Icon name="rotate-ccw" :size="15" />
      {{ p.t('retry') }}
    </button>
  </div>
</template>
