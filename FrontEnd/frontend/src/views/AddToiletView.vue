<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePrefs } from '../stores/preferences'
import {
  bodySchema,
  discover,
  failure,
  isRow,
  prepare,
  request,
  supports,
  unwrap,
} from '../services/api'
import { point } from '../services/records'
import { uploadField, uploadPhotos } from '../services/upload'
import type { Photo, Row } from '../types/api'
import LocationPicker from '../components/LocationPicker.vue'
import MapView from '../components/MapView.vue'
import ImageUploader from '../components/ImageUploader.vue'
const p = usePrefs(),
  route = useRoute(),
  router = useRouter(),
  step = ref(0),
  busy = ref(false),
  error = ref(''),
  done = ref(false),
  progress = ref(0)
const stages = ['basic', 'location', 'facilities', 'photos', 'reviewStep'],
  flags = [
    ['hasWater', 'water'],
    ['hasSoap', 'soap'],
    ['wheelchairAccessible', 'accessible'],
    ['babyChanging', 'baby'],
  ] as const
const data = reactive({
  name: '',
  description: '',
  address: '',
  province: 'Phnom Penh',
  district: '',
  sangkat: '',
  notes: '',
  latitude: '',
  longitude: '',
  accessType: 'UNKNOWN',
  priceKhr: '',
  hasWater: '',
  hasSoap: '',
  wheelchairAccessible: '',
  babyChanging: '',
})
const hours = ref<{ dayOfWeek: number; opensAt: string; closesAt: string }[]>([]),
  photos = ref<Photo[]>([]),
  uploaded = new Map<File, string>(),
  source = ref(''),
  endpoint = '/toilet-suggestions'
const selected = computed(() => point(data.latitude, data.longitude))
const photoSupported = computed(
  () => !!uploadField('/uploads/suggestions') && !!bodySchema('post', endpoint).properties?.imageIds,
)
let redirect: ReturnType<typeof setTimeout> | undefined
onMounted(async () => {
  await discover()
  if (typeof route.query.from === 'string') {
    try {
      const r = unwrap(await request('get', '/me/toilet-suggestions/:id', { id: route.query.from }))
      if (!isRow(r) || r.status !== 'REJECTED') throw new Error('invalid')
      source.value = route.query.from
      for (const key of Object.keys(data) as (keyof typeof data)[]) {
        if (r[key] != null) data[key] = String(r[key])
      }
      if (isRow(r.facilities))
        for (const [k] of flags) {
          if (typeof r.facilities[k] === 'boolean') data[k] = String(r.facilities[k])
        }
      if (Array.isArray(r.openingHours))
        hours.value = r.openingHours.filter(isRow).map((h) => ({
          dayOfWeek: Number(h.dayOfWeek),
          opensAt: String(h.opensAt),
          closesAt: String(h.closesAt),
        }))
    } catch (e) {
      error.value = failure(e)
    }
  }
})
onBeforeUnmount(() => clearTimeout(redirect))
function body(): Row {
  const result: Row = {
    ...data,
    latitude: selected.value?.[0],
    longitude: selected.value?.[1],
    priceKhr: data.accessType === 'PAID' && data.priceKhr !== '' ? Number(data.priceKhr) : undefined,
    openingHours: hours.value.length ? hours.value : undefined,
    resubmittedFromId: source.value || undefined,
  }
  const facilities: Row = {}
  for (const [k] of flags) {
    delete result[k]
    if (data[k] !== '') facilities[k] = data[k] === 'true'
  }
  if (Object.keys(facilities).length) result.facilities = facilities
  return result
}
async function advance() {
  if (busy.value) return
  error.value = ''
  if (step.value === 0 && (!data.name.trim() || !data.address.trim())) {
    error.value = 'invalid'
    return
  }
  if (step.value === 1 && !selected.value) {
    error.value = 'invalid'
    return
  }
  if (step.value < 4) {
    step.value++
    return
  }
  if (!supports('post', endpoint)) return
  busy.value = true
  try {
    const values = body(),
      props = bodySchema('post', endpoint).properties
    if (photos.value.length) {
      if (!photoSupported.value) throw new Error('unsupported')
      prepare('post', endpoint, {
        ...values,
        imageIds: [],
        ...(props?.coverImageId ? { coverImageId: 'pending' } : {}),
      })
      const ids = await uploadPhotos(
        '/uploads/suggestions',
        photos.value,
        (n) => (progress.value = n),
        uploaded,
      )
      values.imageIds = ids
      if (props?.coverImageId) values.coverImageId = ids[0]
    }
    const response = unwrap(await request('post', endpoint, { body: values }))
    if (!isRow(response) || response.status !== 'PENDING') throw new Error('incompatible')
    done.value = true
    redirect = setTimeout(() => router.replace('/my-submissions'), 2200)
  } catch (e) {
    error.value = failure(e)
  } finally {
    busy.value = false
  }
}
const day = (i: number) =>
  new Intl.DateTimeFormat(p.lang === 'km' ? 'km-KH' : 'en', { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2025, 0, 5 + i)),
  )
const stepHeading = ref<HTMLElement>()
watch(step, () => stepHeading.value?.focus(), { flush: 'post' })
function back(to: number) {
  step.value = to
  error.value = ''
}
</script>
<template>
  <section class="wrap narrow page">
    <div v-if="done" class="panel centered" role="status">
      <img src="/images/illustrations/waiting-approval.svg" width="160" alt="" />
      <h2>{{ p.t('submitted') }}</h2>
      <RouterLink class="text-link" to="/my-submissions">{{ p.t('mySubmissions') }}</RouterLink>
    </div>
    <template v-else>
      <h1>{{ p.t('add') }}</h1>
      <ol class="steps">
        <li
          v-for="(s, i) in stages"
          :key="s"
          :class="{ current: step === i }"
          :aria-current="step === i ? 'step' : undefined"
        >
          <button v-if="i < step" type="button" class="text-link" :disabled="busy" @click="back(i)">
            {{ i + 1 }} · {{ p.t(s) }}
          </button>
          <span v-else>{{ i + 1 }} · {{ p.t(s) }}</span>
        </li>
      </ol>
      <form class="panel stack" @submit.prevent="advance">
        <h2 ref="stepHeading" tabindex="-1">{{ p.t(stages[step]) }}</h2>
        <div v-if="step === 0" class="form-grid">
          <label
            v-for="key in ['name', 'address'] as const"
            :key="key"
          >
            {{ p.t(key) }}
            <input
              v-model.trim="data[key]"
              required
              :minlength="key === 'name' ? 2 : 3"
              :maxlength="key === 'name' ? 150 : 300"
            />
          </label>
          <details class="span-all field-group">
            <summary>{{ p.t('optionalDetails') }}</summary>
            <div class="form-grid">
              <label v-for="key in ['province', 'district', 'sangkat'] as const" :key="key">
                {{ p.t(key) }}
                <input v-model.trim="data[key]" maxlength="80" />
              </label>
              <label class="span-all">
                {{ p.t('description') }}
                <textarea v-model.trim="data.description" maxlength="2000" />
              </label>
              <label class="span-all">
                {{ p.t('notes') }}
                <textarea v-model.trim="data.notes" maxlength="1000" />
              </label>
            </div>
          </details>
        </div>
        <div v-if="step === 1" class="stack">
          <LocationPicker v-model:latitude="data.latitude" v-model:longitude="data.longitude" />
          <div class="form-grid">
            <label>
              {{ p.t('latitude') }}
              <input v-model="data.latitude" type="number" step="any" min="9.5" max="14.8" required />
            </label>
            <label>
              {{ p.t('longitude') }}
              <input
                v-model="data.longitude"
                type="number"
                step="any"
                min="102.2"
                max="107.8"
                required
              />
            </label>
          </div>
        </div>
        <div v-if="step === 2" class="form-grid">
          <label>
            {{ p.t('access') }}
            <select v-model="data.accessType">
              <option value="FREE">{{ p.t('free') }}</option>
              <option value="PAID">{{ p.t('paid') }}</option>
              <option value="UNKNOWN">{{ p.t('unknown') }}</option>
            </select>
          </label>
          <label v-if="data.accessType === 'PAID'">
            {{ p.t('price') }}
            <input v-model="data.priceKhr" type="number" step="1" min="1" max="100000" />
          </label>
          <label v-for="[key, label] in flags" :key="key">
            {{ p.t(label) }}
            <select v-model="data[key]">
              <option value="">{{ p.t('unknown') }}</option>
              <option value="true">{{ p.t('yes') }}</option>
              <option value="false">{{ p.t('no') }}</option>
            </select>
          </label>
          <fieldset class="span-all stack">
            <legend>{{ p.t('hours') }}</legend>
            <div v-for="(h, i) in hours" :key="i" class="row">
              <select v-model.number="h.dayOfWeek" :aria-label="p.t('hours')">
                <option v-for="n in 7" :key="n" :value="n - 1">{{ day(n - 1) }}</option>
              </select>
              <input v-model="h.opensAt" type="time" required :aria-label="p.t('open')" />
              <input v-model="h.closesAt" type="time" required :aria-label="p.t('closed')" />
              <button type="button" class="text-link" @click="hours.splice(i, 1)">
                {{ p.t('remove') }}
              </button>
            </div>
            <button
              type="button"
              class="text-link"
              @click="hours.push({ dayOfWeek: hours.length % 7, opensAt: '', closesAt: '' })"
            >
              + {{ p.t('hours') }}
            </button>
          </fieldset>
        </div>
        <div v-show="step === 3">
          <ImageUploader v-if="photoSupported" v-model="photos" />
          <p v-else class="notice">{{ p.t('unsupported') }}</p>
        </div>
        <div v-if="step === 4" class="stack">
          <h3>{{ data.name }}</h3>
          <p>
            {{ [data.address, data.sangkat, data.district, data.province].filter(Boolean).join(', ') }}
          </p>
          <p>{{ data.description }} {{ data.notes }}</p>
          <MapView :selected="selected" />
          <p>
            {{ data.latitude }}, {{ data.longitude }} ·
            {{
              p.t(data.accessType === 'FREE' ? 'free' : data.accessType === 'PAID' ? 'paid' : 'unknown')
            }}
            <span v-if="data.priceKhr">{{ p.money(Number(data.priceKhr)) }}</span>
          </p>
          <dl class="details-list">
            <template v-for="[key, label] in flags" :key="key">
              <dt>{{ p.t(label) }}</dt>
              <dd>
                {{ p.t(data[key] === '' ? 'unknown' : data[key] === 'true' ? 'yes' : 'no') }}
              </dd>
            </template>
          </dl>
          <p v-for="h in hours" :key="h.dayOfWeek + h.opensAt">
            {{ day(h.dayOfWeek) }} · {{ h.opensAt }}–{{ h.closesAt }}
          </p>
          <div class="previews">
            <div v-for="photo in photos" :key="photo.url">
              <img :src="photo.url" :alt="photo.file.name" />
            </div>
          </div>
          <p v-if="!supports('post', endpoint)" class="notice">{{ p.t('unsupported') }}</p>
          <progress v-if="busy && photos.length" :value="progress" max="100" />
        </div>
        <p v-if="error" class="error" role="alert">{{ p.t(error) }}</p>
        <div class="row between">
          <button v-if="step" type="button" class="btn outline" :disabled="busy" @click="back(step - 1)">
            {{ p.t('goBack') }}
          </button>
          <button class="btn primary" :disabled="busy || (step === 4 && !supports('post', endpoint))">
            {{ p.t(busy ? 'submitting' : step === 4 ? 'submit' : 'next') }}
          </button>
        </div>
      </form>
    </template>
  </section>
</template>
