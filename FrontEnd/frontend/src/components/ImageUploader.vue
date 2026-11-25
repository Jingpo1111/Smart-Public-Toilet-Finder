<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import type { Photo } from '../types/api'
import { validatePhotos } from '../services/upload'
import { usePrefs } from '../stores/preferences'
import Icon from './Icon.vue'
const photos = defineModel<Photo[]>({ required: true }),
  p = usePrefs(),
  error = ref(''),
  drag = ref(false)
const owned = new Set<string>()
function add(files: File[]) {
  try {
    validatePhotos(files, photos.value.length)
    photos.value = [
      ...photos.value,
      ...files.map((file) => {
        const url = URL.createObjectURL(file)
        owned.add(url)
        return { file, url }
      }),
    ]
    error.value = ''
  } catch {
    error.value = 'photoLimits'
  }
}
function pick(e: Event) {
  const input = e.target as HTMLInputElement
  add(Array.from(input.files ?? []))
  input.value = ''
}
function remove(photo: Photo) {
  photos.value = photos.value.filter((p) => p !== photo)
  URL.revokeObjectURL(photo.url)
  owned.delete(photo.url)
}
onBeforeUnmount(() => {
  for (const url of owned) URL.revokeObjectURL(url)
})
function drop(event: DragEvent) {
  drag.value = false
  add(Array.from(event.dataTransfer?.files ?? []))
}
</script>
<template>
  <div class="stack">
    <p class="notice">{{ p.t('photoWarning') }}</p>
    <div
      :class="['dropzone', { drag }]"
      @dragover.prevent="drag = true"
      @dragleave="drag = false"
      @drop.prevent="drop"
    >
      <Icon name="upload" :size="28" />
      <strong>{{ p.t('drop') }}</strong>
      <small>{{ p.t('photoLimits') }}</small>
      <div class="row">
        <label class="btn outline file-btn">
          {{ p.t('browse') }}
          <input type="file" multiple accept="image/jpeg,image/png,image/webp" @change="pick" />
        </label>
        <label class="btn outline file-btn">
          <Icon name="camera" :size="16" />
          {{ p.t('camera') }}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            @change="pick"
          />
        </label>
      </div>
    </div>
    <p v-if="error" class="error" role="alert">{{ p.t(error) }}</p>
    <div class="previews">
      <div v-for="(photo, i) in photos" :key="photo.url">
        <img :src="photo.url" :alt="photo.file.name" />
        <small>{{ photo.file.name }}</small>
        <button
          v-if="i"
          type="button"
          @click="photos = [photo, ...photos.filter((item) => item !== photo)]"
        >
          {{ p.t('setCover') }}
        </button>
        <b v-else>{{ p.t('cover') }}</b>
        <button type="button" @click="remove(photo)">{{ p.t('remove') }}</button>
      </div>
    </div>
  </div>
</template>
