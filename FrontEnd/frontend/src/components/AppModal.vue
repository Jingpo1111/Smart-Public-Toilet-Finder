<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { usePrefs } from '../stores/preferences'
import Icon from './Icon.vue'
defineProps<{ title: string; fullscreen?: boolean }>()
const emit = defineEmits<{ close: [] }>(),
  p = usePrefs(),
  el = ref<HTMLDialogElement>(),
  previous = document.activeElement
onMounted(() => el.value?.showModal())
onBeforeUnmount(() => {
  el.value?.close()
  if (previous instanceof HTMLElement) previous.focus()
})
</script>
<template>
  <Teleport to="body">
    <dialog
      ref="el"
      :class="['modal', { fullscreen }]"
      :aria-label="title"
      @cancel.prevent="emit('close')"
      @click="$event.target === el && emit('close')"
    >
      <section>
        <header class="row between">
          <h2>{{ title }}</h2>
          <button class="iconbtn" :aria-label="p.t('close')" @click="emit('close')">
            <Icon name="x" />
          </button>
        </header>
        <slot />
      </section>
    </dialog>
  </Teleport>
</template>
