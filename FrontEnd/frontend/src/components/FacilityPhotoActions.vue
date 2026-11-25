<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePrefs } from '../stores/preferences'
import { isRow, supports } from '../services/api'
import { idOf, imageURL } from '../services/records'
import type { Row } from '../types/api'
import type { Action } from '../services/workspace'
import MutationForm from './MutationForm.vue'
const props = defineProps<{ record: Row; base: string }>(),
  emit = defineEmits<{ saved: [] }>(),
  p = usePrefs(),
  action = ref<Action>()
const images = computed(() =>
  Array.isArray(props.record.images) ? props.record.images.filter(isRow) : [],
)
const remove = computed(() => props.base + '/:id/images/:imageId'),
  cover = computed(() =>
    [props.base + '/:id/cover', props.base + '/:id/cover-image'].find((path) => supports('patch', path)),
  )
function choose(img: Row) {
  if (cover.value)
    action.value = {
      title: 'setCover',
      method: 'patch',
      path: cover.value,
      id: idOf(props.record),
      fixed: { imageId: idOf(img) },
      confirm: true,
    }
}
function drop(img: Row) {
  action.value = {
    title: 'delete',
    method: 'delete',
    path: remove.value,
    id: idOf(props.record),
    ids: { imageId: idOf(img) },
    confirm: true,
  }
}
function saved() {
  action.value = undefined
  emit('saved')
}
</script>
<template>
  <div v-if="images.length && (cover || supports('delete', remove))" class="previews">
    <div v-for="img in images" :key="idOf(img)">
      <img
        v-if="imageURL(img.url)"
        :src="imageURL(img.url)"
        :alt="p.t('photos')"
        referrerpolicy="no-referrer"
      />
      <button v-if="cover" @click="choose(img)">{{ p.t('setCover') }}</button>
      <button v-if="supports('delete', remove)" @click="drop(img)">{{ p.t('remove') }}</button>
    </div>
  </div>
  <MutationForm v-if="action" v-bind="action" @close="action = undefined" @saved="saved" />
</template>
