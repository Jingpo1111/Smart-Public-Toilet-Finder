<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { usePrefs, statusKey } from '../stores/preferences'
import { useAccount } from '../stores/account'
import { useDiscovery } from '../stores/discovery'
import { bodySchema, discover, failure, isRow, request, supports, unwrap } from '../services/api'
import { distance, imageURL, pageOf, publicToilet, string } from '../services/records'
import { uploadField, uploadPhotos } from '../services/upload'
import type { Photo, Row, Toilet } from '../types/api'
import StatePanel from '../components/StatePanel.vue'
import Icon from '../components/Icon.vue'
import ImageGallery from '../components/ImageGallery.vue'
import ImageUploader from '../components/ImageUploader.vue'
import MapView from '../components/MapView.vue'
import AppModal from '../components/AppModal.vue'
const p = usePrefs(),
  a = useAccount(),
  discovery = useDiscovery(),
  route = useRoute(),
  router = useRouter(),
  id = String(route.params.id),
  item = ref<Toilet | null>(null),
  error = ref(''),
  loading = ref(true),
  reviewError = ref('')
const reviews = ref<Row[]>([]),
  reviewPage = ref(1),
  reviewPages = ref(1),
  saved = ref<boolean>(),
  busy = ref(false),
  modal = ref(''),
  formError = ref(''),
  rating = ref(5),
  clean = ref(5),
  comment = ref(''),
  category = ref('DIRTY'),
  photos = ref<Photo[]>([]),
  progress = ref(0),
  uploaded = new Map<File, string>()
const name = computed(() => (p.lang === 'km' && item.value?.nameKm) || item.value?.name || '')
const description = computed(
  () => (p.lang === 'km' && item.value?.descriptionKm) || item.value?.description || '',
)
const dayName = (day: number) =>
  new Intl.DateTimeFormat(p.lang === 'km' ? 'km-KH' : 'en', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2025, 0, 5 + day)))
const sharedURL = window.location.href
const favPath = '/me/favorites/:toiletId',
  endpoint = computed(() => '/toilets/:id/' + (modal.value === 'review' ? 'reviews' : 'reports'))
const categories: Record<string, string> = {
  DIRTY: 'dirty',
  NO_WATER: 'noWater',
  NO_SOAP: 'noSoap',
  BROKEN_DOOR: 'brokenDoor',
  BROKEN_EQUIPMENT: 'broken',
  INCORRECT_LOCATION: 'incorrectLocation',
  INCORRECT_PRICE: 'incorrectPrice',
  CLOSED: 'closed',
  OTHER: 'other',
}
const flags = [
  ['water', 'water'],
  ['soap', 'soap'],
  ['wheelchair', 'accessible'],
  ['baby', 'baby'],
] as const
async function load(silent = false) {
  if (!silent) loading.value = true
  error.value = ''
  try {
    const raw = unwrap(await request('get', '/toilets/:id', { id }))
    item.value = isRow(raw) ? publicToilet(raw) : null
    if (!item.value) error.value = 'missing'
  } catch (e) {
    error.value = failure(e)
  } finally {
    loading.value = false
  }
}
async function getReviews() {
  reviewError.value = ''
  try {
    const list = pageOf(
      await request('get', '/toilets/:id/reviews', { id, params: { page: reviewPage.value } }),
    )
    reviews.value = list.items
    reviewPages.value = list.pages
  } catch (e) {
    reviewError.value = failure(e)
  }
}
async function getFavorite() {
  if (!a.user) return
  try {
    let n = 1
    for (;;) {
      const result = pageOf(await request('get', '/me/favorites', { params: { page: n } }))
      if (result.items.some((r) => r.toiletId === id || (isRow(r.toilet) && r.toilet.id === id))) {
        saved.value = true
        return
      }
      if (n >= result.pages) {
        saved.value = false
        return
      }
      if (result.page !== n) return
      n++
    }
  } catch {
    saved.value = undefined
  }
}
onMounted(async () => {
  await load()
  if (item.value) {
    await Promise.all([getReviews(), getFavorite()])
    if (route.query.feedback === '1') {
      await nextTick()
      document.getElementById('reviews')?.focus()
    }
  }
})
function guest() {
  if (a.user) return false
  void router.push({ path: '/login', query: { redirect: route.fullPath } })
  return true
}
async function favorite() {
  if (guest() || busy.value || saved.value === undefined) return
  busy.value = true
  try {
    await request(saved.value ? 'delete' : 'post', favPath, { id })
    saved.value = !saved.value
    p.toast('saved')
  } catch (e) {
    p.toast(failure(e))
  } finally {
    busy.value = false
  }
}
function action(s: string) {
  if (guest()) return
  modal.value = s
  formError.value = ''
  comment.value = ''
  photos.value = []
  uploaded.clear()
}
async function send() {
  if (busy.value) return
  busy.value = true
  formError.value = ''
  try {
    const body: Row =
      modal.value === 'review'
        ? { rating: rating.value, cleanlinessRating: clean.value, comment: comment.value.trim() }
        : { category: category.value, description: comment.value.trim() }
    if (photos.value.length)
      body.imageIds = await uploadPhotos(
        '/uploads/reports',
        photos.value,
        (n) => (progress.value = n),
        uploaded,
      )
    await request('post', endpoint.value, { id, body })
    modal.value = ''
    p.toast('saved')
    await Promise.all([load(), getReviews()])
  } catch (e) {
    formError.value = failure(e)
  } finally {
    busy.value = false
  }
}
async function share() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    p.toast('copied')
  } catch {
    modal.value = 'share'
  }
}
function changeReviewPage(by: number) {
  reviewPage.value += by
  void getReviews()
}
</script>
<template>
  <section class="wrap page">
    <RouterLink to="/explore" class="text-link">
      <Icon name="chevron-left" :size="16" />
      {{ p.t('explore') }}
    </RouterLink>
    <StatePanel
      v-if="loading || error"
      :phase="loading ? 'loading' : 'error'"
      :error="error"
      title="locations"
      retry
      @retry="discover(true).then(() => load())"
    />
    <template v-else-if="item">
      <header class="details-header">
        <span class="badge">{{ p.t(item.sample ? 'sample' : 'verified') }}</span>
        <h1>{{ name }}</h1>
        <p>{{ item.address }}</p>
        <small v-if="item.point && discovery.origin">
          {{ p.t('distance') }} · {{ distance(item.point, discovery.origin).toFixed(1) }} km
        </small>
      </header>
      <div class="detail-grid">
        <div class="stack">
          <ImageGallery :images="item.images" :name="name" @refresh="load(true)" />
          <p v-if="description">{{ description }}</p>
          <div class="toolbar">
            <a
              v-if="item.point"
              class="btn primary"
              :href="'https://www.google.com/maps/dir/?api=1&destination=' + item.point.join(',')"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="navigation" />
              {{ p.t('directions') }}
            </a>
            <button
              class="btn outline"
              :disabled="
                busy ||
                (!!a.user && (saved === undefined || !supports(saved ? 'delete' : 'post', favPath)))
              "
              @click="favorite"
            >
              <Icon name="heart" />
              {{ p.t(saved ? 'remove' : 'save') }}
            </button>
            <button class="btn outline" @click="share">
              <Icon name="link" />
              {{ p.t('share') }}
            </button>
          </div>
        </div>
        <div class="panel stack">
          <h2>{{ p.t('facilities') }}</h2>
          <dl class="details-list">
            <dt>{{ p.t('access') }}</dt>
            <dd>
              {{ p.t(statusKey(item.access)) }}
              <span v-if="item.price !== undefined">{{ p.money(item.price) }}</span>
            </dd>
            <dt>{{ p.t('stars') }}</dt>
            <dd>{{ item.rating ?? p.t('unknown') }}</dd>
            <dt>{{ p.t('cleanliness') }}</dt>
            <dd>{{ item.cleanliness ?? p.t('unknown') }}</dd>
            <dt>{{ p.t('hours') }}</dt>
            <dd>
              <template v-if="item.hours.length">
                <div v-for="(h, i) in item.hours" :key="i">
                  {{ dayName(h.day) }} · {{ h.opens }}–{{ h.closes }}
                  <small v-if="h.nextDay">(+1)</small>
                </div>
              </template>
              <template v-else>{{ p.t('unknown') }}</template>
            </dd>
            <dt>{{ p.t('status') }}</dt>
            <dd>
              {{ p.t(item.status === 'OPEN' ? 'operational' : statusKey(item.status) || 'unknown') }}
            </dd>
            <dt>{{ p.t('verifiedAt') }}</dt>
            <dd>{{ p.date(item.verifiedAt) || p.t('unknown') }}</dd>
            <template v-for="[key, label] in flags" :key="key">
              <dt>{{ p.t(label) }}</dt>
              <dd>
                {{ p.t(item[key] === undefined ? 'unknown' : item[key] ? 'yes' : 'no') }}
              </dd>
            </template>
          </dl>
        </div>
      </div>
      <MapView v-if="item.point" :selected="item.point" style="margin-block: 20px" />
      <section id="reviews" tabindex="-1" class="panel stack">
        <div class="section-head">
          <h2>{{ p.t('reviews') }}</h2>
          <div class="row">
            <button
              v-for="s in ['review', 'report']"
              :key="s"
              class="btn outline"
              :disabled="
                !!a.user && !supports('post', '/toilets/:id/' + (s === 'review' ? 'reviews' : 'reports'))
              "
              @click="action(s)"
            >
              {{ p.t(s) }}
            </button>
          </div>
        </div>
        <p v-if="reviewError">{{ p.t(reviewError) }}</p>
        <p v-else-if="!reviews.length">{{ p.t('noRecords') }}</p>
        <article v-for="(r, i) in reviews" :key="String(r.id ?? i)" class="review-line">
          <img
            v-if="isRow(r.author) && isRow(r.author.avatar) && imageURL(r.author.avatar.url)"
            class="profile-photo"
            :src="imageURL(r.author.avatar.url)"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
          />
          <strong>
            {{ isRow(r.author) ? string(r.author, 'displayName') : '' }} · {{ r.rating }} / 5
          </strong>
          <p>{{ r.comment }}</p>
        </article>
        <div v-if="reviewPages > 1" class="pager">
          <button :disabled="reviewPage <= 1" @click="changeReviewPage(-1)">
            {{ p.t('previous') }}
          </button>
          {{ reviewPage }} / {{ reviewPages }}
          <button :disabled="reviewPage >= reviewPages" @click="changeReviewPage(1)">
            {{ p.t('next') }}
          </button>
        </div>
      </section>
    </template>
  </section>
  <AppModal v-if="modal" :title="p.t(modal)" @close="!busy && (modal = '')">
    <input
      v-if="modal === 'share'"
      class="field"
      readonly
      :value="sharedURL"
      @focus="($event.target as HTMLInputElement).select()"
    />
    <form v-else class="stack" @submit.prevent="send">
      <template v-if="modal === 'review'">
        <label>
          {{ p.t('stars') }}
          <select v-model.number="rating">
            <option v-for="n in 5" :key="n">{{ n }}</option>
          </select>
        </label>
        <label>
          {{ p.t('cleanliness') }}
          <select v-model.number="clean">
            <option v-for="n in 5" :key="n">{{ n }}</option>
          </select>
        </label>
      </template>
      <label v-else>
        {{ p.t('categoryLabel') }}
        <select v-model="category">
          <option v-for="(val, key) in categories" :key="key" :value="key">{{ p.t(val) }}</option>
        </select>
      </label>
      <label>
        {{ p.t(modal === 'review' ? 'comment' : 'description') }}
        <textarea
          v-model="comment"
          :required="modal === 'report'"
          :minlength="modal === 'report' ? 5 : 0"
          maxlength="2000"
        />
      </label>
      <ImageUploader
        v-if="
          modal === 'report' &&
          uploadField('/uploads/reports') &&
          bodySchema('post', endpoint).properties?.imageIds
        "
        v-model="photos"
      />
      <progress v-if="busy && photos.length" max="100" :value="progress" />
      <p v-if="formError" class="error" role="alert">{{ p.t(formError) }}</p>
      <button class="btn primary" :disabled="busy">{{ p.t(busy ? 'submitting' : 'submit') }}</button>
    </form>
  </AppModal>
</template>
