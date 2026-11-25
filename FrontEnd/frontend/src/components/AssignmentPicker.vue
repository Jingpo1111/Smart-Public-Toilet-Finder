<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { usePrefs } from '../stores/preferences'
import { failure, request } from '../services/api'
import { idOf, pageOf } from '../services/records'
import type { Row } from '../types/api'
const props = defineProps<{ field: string; modelValue?: unknown; required?: boolean }>(),
  emit = defineEmits<{ 'update:modelValue': [string] }>(),
  p = usePrefs()
const q = ref(''),
  items = ref<Row[]>([]),
  problem = ref(''),
  loading = ref(false),
  managers = props.field === 'managerId'
let run = 0,
  timer: ReturnType<typeof setTimeout> | undefined
async function load() {
  const id = ++run
  loading.value = true
  try {
    const v = pageOf(
      await request('get', managers ? '/admin/users' : '/admin/toilets', {
        params: { q: q.value || undefined, role: managers ? 'MANAGER' : undefined, limit: 30 },
      }),
    )
    if (id === run) {
      items.value = v.items
      problem.value = ''
    }
  } catch (e) {
    if (id === run) problem.value = failure(e)
  } finally {
    if (id === run) loading.value = false
  }
}
onMounted(load)
watch(q, () => {
  clearTimeout(timer)
  timer = setTimeout(load, 200)
})
onBeforeUnmount(() => {
  clearTimeout(timer)
  run++
})
</script>
<template>
  <div class="stack">
    <label>
      {{ p.t('search') }} · {{ p.t(managers ? 'managers' : 'locations') }}
      <input v-model="q" type="search" />
    </label>
    <label>
      {{ p.t(managers ? 'managerChoice' : 'facilityChoice') }}
      <select
        :value="modelValue ?? ''"
        :required="required"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">
          {{ p.t(loading ? 'loading' : managers ? 'managerChoice' : 'facilityChoice') }}
        </option>
        <option v-for="r in items" :value="idOf(r)" :key="idOf(r)">
          {{ r.fullName ?? r.name }} · {{ r.email ?? r.address }}
        </option>
      </select>
    </label>
    <p v-if="problem" class="error">{{ p.t(problem) }}</p>
  </div>
</template>
