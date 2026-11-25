<script setup lang="ts">
import { ref, watch } from 'vue'
import AppModal from './AppModal.vue'
import { usePrefs } from '../stores/preferences'
const props = defineProps<{ images: string[]; name: string }>(),
  emit = defineEmits<{ refresh: [] }>(),
  p = usePrefs(),
  active = ref(-1),
  failed = ref<string[]>([]),
  attempted = new Set<string>()
function broken(url: string) {
  if (!failed.value.includes(url)) failed.value.push(url)
  if (!attempted.size) {
    attempted.add(url)
    emit('refresh')
  }
}
watch(
  () => props.images,
  () => {
    if (active.value >= props.images.length) active.value = -1
  },
)
</script>
<template>
  <div v-if="images.some((i) => !failed.includes(i))" class="gallery">
    <button
      v-for="(img, i) in images"
      v-show="!failed.includes(img)"
      :key="img"
      :aria-label="p.t('gallery') + ' ' + (i + 1)"
      @click="active = i"
    >
      <img :src="img" :alt="name + ' · ' + (i + 1)" referrerpolicy="no-referrer" @error="broken(img)" />
    </button>
  </div>
  <div v-else class="placeholder">
    <img src="/images/placeholders/toilet-placeholder.svg" :alt="p.t('photoMissing')" />
    <small>{{ p.t('photoMissing') }}</small>
  </div>
  <AppModal fullscreen v-if="active >= 0" :title="name" @close="active = -1">
    <img
      class="lightbox-image mx-auto"
      tabindex="0"
      @keydown.left.prevent="active = Math.max(0, active - 1)"
      @keydown.right.prevent="active = Math.min(images.length - 1, active + 1)"
      :src="images[active]"
      :alt="name"
      referrerpolicy="no-referrer"
    />
    <div class="pager">
      <button :disabled="active === 0" @click="active--">{{ p.t('previous') }}</button>
      {{ active + 1 }} / {{ images.length }}
      <button :disabled="active === images.length - 1" @click="active++">{{ p.t('next') }}</button>
    </div>
  </AppModal>
</template>
