<script setup lang="ts">
import { computed } from 'vue'
import { usePrefs, statusKey } from '../stores/preferences'
import { resolveSchema } from '../services/contract'
import { isRow, spec } from '../services/api'
import { labels, fieldSchema } from '../services/forms'
import type { Schema } from '../types/api'
const props = defineProps<{ field: string; schema: Schema; modelValue?: unknown; required?: boolean }>(),
  emit = defineEmits<{ 'update:modelValue': [unknown] }>(),
  p = usePrefs()
const s = computed(() => fieldSchema(props.schema, props.field))
const label = computed(() => p.t(labels[props.field] ?? props.field))
const obj = computed(() => (isRow(props.modelValue) ? props.modelValue : {})),
  arr = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []))
const text = computed(() => (props.modelValue == null ? '' : String(props.modelValue)))
function update(v: unknown) {
  emit('update:modelValue', v === '' && s.value.nullable ? null : v)
}
function value(e: Event) {
  return (e.target as HTMLInputElement).value
}
const password = computed(() => props.field.toLowerCase().includes('password'))
</script>
<template>
  <details v-if="s.properties" :open="required" class="field-group">
    <summary>{{ label }}</summary>
    <div class="stack">
      <SchemaField
        v-for="(sub, k) in s.properties"
        :key="k"
        :field="k"
        :schema="sub"
        :model-value="obj[k]"
        :required="s.required?.includes(k)"
        @update:model-value="update({ ...obj, [k]: $event })"
      />
    </div>
  </details>
  <fieldset v-else-if="s.type === 'array'" class="stack field-group">
    <legend>{{ label }}</legend>
    <div v-for="(entry, i) in arr" :key="i" class="stack">
      <SchemaField
        :schema="s.items ?? {}"
        :field="field"
        :model-value="entry"
        @update:model-value="update(arr.map((v, j) => (i === j ? $event : v)))"
      />
      <button type="button" class="text-link" @click="update(arr.filter((_, j) => i !== j))">
        {{ p.t('remove') }}
      </button>
    </div>
    <button
      type="button"
      class="text-link"
      @click="update([...arr, resolveSchema(spec, s.items).properties ? {} : ''])"
    >
      + {{ label }}
    </button>
  </fieldset>
  <label v-else>
    {{ label }}
    <select
      v-if="s.enum || s.type === 'boolean'"
      :value="text"
      :required="required"
      @change="update(value($event))"
    >
      <option value="">{{ p.t('unknown') }}</option>
      <option v-for="option in s.enum ?? ['true', 'false']" :key="option" :value="option">
        {{ p.t(option === 'true' ? 'yes' : option === 'false' ? 'no' : statusKey(option)) }}
      </option>
    </select>
    <textarea
      v-else-if="
        [
          'comment',
          'description',
          'reason',
          'rejectionReason',
          'notes',
          'resolutionNote',
          'reviewNote',
        ].includes(field)
      "
      :value="text"
      :required="required"
      :minlength="s.minLength"
      :maxlength="s.maxLength"
      @input="update(value($event))"
    />
    <input
      v-else
      :value="text"
      :type="
        password
          ? 'password'
          : ['integer', 'number'].includes(s.type ?? '')
            ? 'number'
            : field === 'email'
              ? 'email'
              : 'text'
      "
      :step="s.type === 'integer' ? 1 : 'any'"
      :min="s.minimum"
      :max="s.maximum"
      :minlength="s.minLength"
      :maxlength="s.maxLength"
      :required="required"
      :autocomplete="
        field === 'currentPassword'
          ? 'current-password'
          : field === 'newPassword'
            ? 'new-password'
            : 'off'
      "
      @input="update(value($event))"
    />
  </label>
</template>
