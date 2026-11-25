<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { bodySchema, failure, request, spec, supports } from '../services/api'
import { resolveSchema } from '../services/contract'
import { usePrefs } from '../stores/preferences'
import type { Method, Row } from '../types/api'
import { idOf, imageURL } from '../services/records'
import AssignmentPicker from './AssignmentPicker.vue'
import SchemaField from './SchemaField.vue'
import { valueFor } from '../services/forms'
import AppModal from './AppModal.vue'
const props = defineProps<{
    title: string
    path: string
    method: Method
    id?: string
    ids?: Record<string, string>
    initial?: Row
    fixed?: Row
    keys?: string[]
    confirm?: boolean
    images?: Row[]
  }>(),
  emit = defineEmits<{ close: []; saved: []; conflict: [] }>()
const p = usePrefs(),
  busy = ref(false),
  confirming = ref(false),
  error = ref('')
const schema = computed(() => bodySchema(props.method, props.path))
const fields = computed(() =>
  Object.entries(schema.value.properties ?? {})
    .filter(([k]) => !(k in (props.fixed ?? {})) && (!props.keys || props.keys.includes(k)))
    .map(([key, s]) => ({ key, schema: resolveSchema(spec.value, s) })),
)
const values = reactive<Row>({})
for (const { key } of fields.value) {
  if (props.initial?.[key] != null) values[key] = JSON.parse(JSON.stringify(props.initial[key]))
}
const selectedImages = ref((props.images ?? []).map(idOf))
const cover = ref(idOf(props.images?.find((r) => r.isCover === true) ?? props.images?.[0] ?? {}))
function togglePhoto(id: string, selected: boolean) {
  selectedImages.value = selected
    ? [...selectedImages.value, id]
    : selectedImages.value.filter((v) => v !== id)
  if (!selectedImages.value.includes(cover.value)) cover.value = selectedImages.value[0] ?? ''
}
async function save() {
  if (busy.value) return
  if (props.confirm && !confirming.value) {
    confirming.value = true
    return
  }
  busy.value = true
  error.value = ''
  try {
    const body: Row = { ...props.fixed }
    for (const { key, schema: s } of fields.value) {
      const value = valueFor(s, values[key], key)
      const before = valueFor(s, props.initial?.[key], key)
      if (
        value !== undefined &&
        (props.method !== 'patch' ||
          schema.value.required?.includes(key) ||
          JSON.stringify(before) !== JSON.stringify(value))
      )
        body[key] = value
    }
    if (props.images?.length) {
      body.publishImageIds = selectedImages.value
      if (cover.value) body.coverImageId = cover.value
    }
    if (props.title === 'reject' && !String(body.rejectionReason ?? body.reason ?? '').trim())
      throw new Error('invalid')
    await request(props.method, props.path, {
      id: props.id,
      ids: props.ids,
      body: Object.keys(body).length ? body : undefined,
    })
    p.toast('saved')
    emit('saved')
  } catch (e) {
    error.value = failure(e)
    if (error.value === 'conflict') emit('conflict')
    confirming.value = false
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <AppModal :title="p.t(title)" @close="!busy && emit('close')">
    <form class="stack" @submit.prevent="save">
      <template v-if="!confirming">
        <template v-for="{ key, schema: s } in fields" :key="key">
          <AssignmentPicker
            v-if="path === '/admin/manager-assignments' && ['managerId', 'toiletId'].includes(key)"
            v-model="values[key]"
            :field="key"
            required
          />
          <SchemaField
            v-else
            v-model="values[key]"
            :schema="s"
            :field="key"
            :required="
              schema.required?.includes(key) ||
              (title === 'reject' && ['rejectionReason', 'reason'].includes(key))
            "
          />
        </template>
        <div v-if="images?.length" class="stack">
          <strong>{{ p.t('publishPhotos') }}</strong>
          <div v-for="img in images" :key="idOf(img)" class="row approval-photo">
            <img
              v-if="imageURL(img.url)"
              :src="imageURL(img.url)"
              :alt="p.t('photos')"
              referrerpolicy="no-referrer"
            />
            <label class="check">
              <input
                type="checkbox"
                :checked="selectedImages.includes(idOf(img))"
                @change="togglePhoto(idOf(img), ($event.target as HTMLInputElement).checked)"
              />
              {{ p.t('publish') }}
            </label>
            <label class="check">
              <input
                v-model="cover"
                type="radio"
                name="review-cover"
                :value="idOf(img)"
                :disabled="!selectedImages.includes(idOf(img))"
              />
              {{ p.t('cover') }}
            </label>
          </div>
        </div>
      </template>
      <p v-if="confirming || !fields.length" class="notice">{{ p.t('confirmAction') }}</p>
      <p v-if="error" class="error" role="alert">{{ p.t(error) }}</p>
      <div class="row">
        <button type="button" class="btn outline" :disabled="busy" @click="emit('close')">
          {{ p.t('cancel') }}
        </button>
        <button class="btn primary" :disabled="busy || !supports(method, path)">
          {{ p.t(busy ? 'submitting' : confirming || confirm ? 'confirm' : 'save') }}
        </button>
      </div>
    </form>
  </AppModal>
</template>
