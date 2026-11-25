<script setup lang="ts">
import { computed } from 'vue'
import { usePrefs, statusKey } from '../stores/preferences'
import { isRow } from '../services/api'
import { imageURL, pictures, point } from '../services/records'
import type { Row } from '../types/api'
import ImageGallery from './ImageGallery.vue'
import MapView from './MapView.vue'
const props = defineProps<{ record: Row; facility?: boolean }>(),
  p = usePrefs()
defineEmits<{ refresh: [] }>()
const subject = computed(() => (isRow(props.record.toilet) ? props.record.toilet : props.record))
const loc = computed(() => point(subject.value.latitude, subject.value.longitude))
const fields: Record<string, string> = {
  description: 'description',
  address: 'address',
  province: 'province',
  district: 'district',
  sangkat: 'sangkat',
  notes: 'notes',
  accessType: 'access',
  priceKhr: 'price',
  hasWater: 'water',
  hasSoap: 'soap',
  wheelchairAccessible: 'accessible',
  babyChanging: 'baby',
  rating: 'stars',
  cleanlinessRating: 'cleanliness',
  comment: 'comment',
  resolutionNote: 'resolutionNote',
  rejectionReason: 'feedback',
  reviewNote: 'reviewNote',
  category: 'categoryLabel',
  role: 'role',
  email: 'email',
  phone: 'phone',
  preferredLanguage: 'language',
  message: 'notifications',
}
const data = computed(() => ({
  ...subject.value,
  ...(isRow(subject.value.facilities) ? subject.value.facilities : {}),
  ...(isRow(props.record.feedback) ? props.record.feedback : {}),
  ...props.record,
}))
function format(v: unknown, k: string) {
  if (v == null) return p.t('unknown')
  if (k === 'priceKhr' && typeof v === 'number') return p.money(v)
  if (typeof v === 'boolean') return p.t(v ? 'yes' : 'no')
  return p.t(statusKey(String(v)))
}
const contributor = computed(() =>
  isRow(props.record.contributor) ? props.record.contributor : undefined,
)
const avatar = computed(() => {
  const a = contributor.value?.avatar
  return imageURL(isRow(a) ? a.url : a) || '/images/placeholders/avatar-placeholder.svg'
})
</script>
<template>
  <article class="stack min-w-0 break-words">
    <div class="row between">
      <h2>{{ subject.name ?? subject.fullName ?? subject.title ?? p.t('details') }}</h2>
      <span v-if="record.status" :class="['badge', record.status]">
        {{ p.t(statusKey(String(record.status))) }}
      </span>
    </div>
    <div v-if="contributor" class="row">
      <img :src="avatar" alt="" class="profile-photo" referrerpolicy="no-referrer" />
      <div>
        <small>{{ p.t('contributor') }}</small>
        <p>{{ contributor.fullName }}</p>
      </div>
    </div>
    <ImageGallery
      v-if="facility || pictures(record).length"
      :images="pictures(record)"
      :name="String(subject.name ?? p.t('photos'))"
      @refresh="$emit('refresh')"
    />
    <dl class="details-list">
      <template v-for="(label, key) in fields" :key="key">
        <template v-if="key in data">
          <dt>{{ p.t(label) }}</dt>
          <dd>{{ format(data[key], key) }}</dd>
        </template>
      </template>
      <template v-if="loc">
        <dt>{{ p.t('coordinates') }}</dt>
        <dd>{{ loc.join(', ') }}</dd>
      </template>
    </dl>
    <div v-if="Array.isArray(data.openingHours)">
      <strong>{{ p.t('hours') }}</strong>
      <p v-if="!data.openingHours.length">{{ p.t('unknown') }}</p>
      <p v-for="(h, i) in data.openingHours.filter(isRow)" :key="i">
        {{
          new Intl.DateTimeFormat(p.lang, { weekday: 'long', timeZone: 'UTC' }).format(
            new Date(Date.UTC(2025, 0, 5 + Number(h.dayOfWeek))),
          )
        }}
        · {{ h.opensAt }}–{{ h.closesAt }}
      </p>
    </div>
    <div v-if="Array.isArray(record.history) && record.history.length" class="notice">
      <strong>{{ p.t('history') }}</strong>
      <p v-for="(h, i) in record.history.filter(isRow)" :key="i">
        {{ p.date(String(h.reviewedAt ?? h.createdAt)) }} ·
        {{ p.t(statusKey(String(h.status ?? h.toStatus))) }} ·
        {{ h.rejectionReason ?? h.reviewNote ?? h.note }}
      </p>
    </div>
    <MapView v-if="loc" :selected="loc" />
    <aside
      v-if="
        record.hasPotentialDuplicate ||
        (Array.isArray(record.duplicateCandidates) && record.duplicateCandidates.length)
      "
      class="notice"
    >
      <strong>{{ p.t('duplicate') }}</strong>
      <p
        v-for="(d, i) in Array.isArray(record.duplicateCandidates)
          ? record.duplicateCandidates.filter(isRow)
          : []"
        :key="i"
      >
        {{ d.name }} {{ d.address }}
      </p>
    </aside>
    <slot />
  </article>
</template>
