<script setup lang="ts">
import type { Row } from '../types/api'
import { usePrefs, statusKey } from '../stores/preferences'
import { idOf, pictures, imageURL } from '../services/records'
import { isRow } from '../services/api'
const props = defineProps<{ rows: Row[]; base: string }>(),
  p = usePrefs()
defineEmits<{ select: [Row] }>()
const subject = (r: Row) => (isRow(r.toilet) ? r.toilet : r)
const avatar = (r: Row) => imageURL(isRow(r.avatar) ? r.avatar.url : r.avatarUrl)
function name(r: Row) {
  const v = subject(r)
  return String(
    v.name ??
      v.fullName ??
      ((p.lang === 'km' && v.titleKm) || v.title) ??
      v.category ??
      v.email ??
      v.comment ??
      v.notes ??
      v.id ??
      '',
  )
}
function thumbnail(r: Row) {
  return (
    pictures(subject(r))[0] ||
    avatar(subject(r)) ||
    (props.base.includes('users') || props.base.includes('managers')
      ? '/images/placeholders/avatar-placeholder.svg'
      : '')
  )
}
</script>
<template>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>{{ p.t('details') }}</th>
          <th>{{ p.t('status') }}</th>
          <th>{{ p.t('date') }}</th>
          <th>{{ p.t('actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="idOf(r) || i">
          <td>
            <div class="row">
              <img
                v-if="thumbnail(r)"
                :src="thumbnail(r)"
                alt=""
                loading="lazy"
                referrerpolicy="no-referrer"
              />
              <div>
                <strong>{{ name(r) }}</strong>
                <p>
                  {{
                    subject(r).address ??
                    r.email ??
                    r.description ??
                    ((p.lang === 'km' && r.messageKm) || r.message)
                  }}
                </p>
                <small v-if="isRow(r.contributor)" class="row">
                  <img
                    v-if="avatar(r.contributor)"
                    :src="avatar(r.contributor)"
                    alt=""
                    class="table-avatar"
                    referrerpolicy="no-referrer"
                  />
                  {{ r.contributor.fullName }}
                </small>
                <small v-if="isRow(r.feedback) && r.feedback.rejectionReason">
                  {{ r.feedback.rejectionReason }}
                </small>
              </div>
            </div>
          </td>
          <td>
            <span v-if="r.status || r.role" :class="['badge', r.status]">
              {{ p.t(statusKey(String(r.status ?? r.role))) }}
            </span>
            <span v-else>—</span>
          </td>
          <td>{{ p.date(String(r.createdAt ?? r.favoritedAt ?? r.cleanedAt ?? '')) || '—' }}</td>
          <td>
            <button class="inline-action" @click="$emit('select', r)">{{ p.t('view') }}</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
