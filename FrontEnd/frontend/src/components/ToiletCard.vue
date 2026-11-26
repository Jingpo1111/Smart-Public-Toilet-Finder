<script setup lang="ts">
import type { Point, Toilet } from '../types/api'
import { request, supports, unwrap } from '../services/api'
import { distance, pictures } from '../services/records'
import { usePrefs, statusKey } from '../stores/preferences'
import Icon from './Icon.vue'
import { computed, ref, watch } from 'vue'
const props = defineProps<{ item: Toilet; origin?: Point }>(),
  p = usePrefs(),
  broken = ref(false),
  loaded = ref(false)
const name = computed(() => (p.lang === 'km' && props.item.nameKm) || props.item.name)
const replacement = ref(''),
  retried = ref(false)
watch(
  () => props.item.images[0],
  () => {
    broken.value = false
    loaded.value = false
    replacement.value = ''
    retried.value = false
  },
)
async function failed() {
  broken.value = true
  if (retried.value || !supports('get', '/toilets/:id/images')) return
  retried.value = true
  try {
    const images = unwrap(await request('get', '/toilets/:id/images', { id: props.item.id }))
    const fresh = pictures({ images })[0]
    if (fresh && fresh !== props.item.images[0]) {
      replacement.value = fresh
      broken.value = false
    }
  } catch {
    /* Keep the labeled photo placeholder. */
  }
}
</script>
<template>
  <RouterLink :to="'/toilets/' + encodeURIComponent(item.id)" class="toilet-card">
    <div class="toilet-photo">
      <img
        v-if="item.images[0] && !broken"
        :src="replacement || item.images[0]"
        :alt="name"
        :class="{ loaded }"
        loading="lazy"
        decoding="async"
        width="400"
        height="210"
        referrerpolicy="no-referrer"
        @load="loaded = true"
        @error="failed"
      />
      <template v-else>
        <img src="/images/placeholders/toilet-placeholder.svg" alt="" loading="lazy" />
        <small>{{ p.t('photoMissing') }}</small>
      </template>
    </div>
    <div class="card-info">
      <div class="row between">
        <strong>{{ name }}</strong>
        <span v-if="item.rating !== undefined" class="row">
          <Icon name="star" :size="15" />
          {{ item.rating.toFixed(1) }}
        </span>
      </div>
      <p>{{ item.address }}</p>
      <div class="tags">
        <span v-if="item.sample">{{ p.t('sample') }}</span>
        <span>
          {{
            item.access === 'PAID' && item.price !== undefined
              ? p.money(item.price)
              : p.t(statusKey(item.access))
          }}
        </span>
        <span v-if="item.open === true">{{ p.t('open') }}</span>
        <span v-if="item.wheelchair">{{ p.t('accessible') }}</span>
      </div>
      <small v-if="item.point && origin">
        {{ p.t('distance') }} · {{ distance(item.point, origin).toFixed(1) }} km
      </small>
    </div>
  </RouterLink>
</template>
