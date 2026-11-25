<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDiscovery } from '../stores/discovery'
import { usePrefs } from '../stores/preferences'
import { emptyFilters, filterToilets } from '../services/records'
import ToiletCard from '../components/ToiletCard.vue'
import Icon from '../components/Icon.vue'
import StatePanel from '../components/StatePanel.vue'
import MapView from '../components/MapView.vue'
import AppModal from '../components/AppModal.vue'
const route = useRoute(),
  p = usePrefs(),
  store = useDiscovery(),
  f = reactive(emptyFilters()),
  draft = reactive(emptyFilters()),
  showFilters = ref(false),
  mode = ref('map'),
  page = ref(1)
watch(
  () => route.query,
  (q) => {
    Object.assign(f, emptyFilters(), {
      q: String(q.q ?? ''),
      access: q.category === 'free' ? 'FREE' : q.category === 'paid' ? 'PAID' : '',
      open: q.category === 'open',
      wheelchair: q.category === 'accessible',
      rated: q.category === 'rated',
      radius: store.origin && q.nearby === '1' ? 2 : 0,
    })
  },
  { immediate: true },
)
const results = computed(() => filterToilets(store.rows, f, store.origin)),
  pages = computed(() => Math.max(1, Math.ceil(results.value.length / 9)))
watch(results, () => (page.value = 1))
const switches = [
  ['open', 'open'],
  ['wheelchair', 'accessible'],
  ['water', 'water'],
  ['soap', 'soap'],
  ['rated', 'rated'],
] as const
const filterCount = computed(() => Object.entries(f).filter(([key, value]) => key !== 'q' && value).length)
async function gps() {
  try {
    await store.locate()
    if (showFilters.value) draft.radius ||= 2
    else f.radius ||= 2
  } catch {
    p.toast('gpsDenied')
  }
}
let timer: ReturnType<typeof setTimeout> | undefined
watch(
  [f, () => store.origin],
  () => {
    clearTimeout(timer)
    timer = setTimeout(() => store.load(false, { ...f }), 220)
  },
  { deep: true },
)
onBeforeUnmount(() => clearTimeout(timer))
onMounted(() => store.load(false, { ...f }))
function editFilters() {
  Object.assign(draft, f)
  showFilters.value = true
}
function applyFilters() {
  Object.assign(f, draft)
  showFilters.value = false
}
</script>
<template>
  <section class="wrap page">
    <div class="city-label">
      <span class="city-dot" />
      {{ p.t('city') }}
    </div>
    <h1>{{ p.t('explore') }}</h1>
    <div class="toolbar">
      <label class="searchbox">
        <Icon name="search" />
        <input
          v-model="f.q"
          :aria-label="p.t('search')"
          :placeholder="p.t('searchHint')"
          type="search"
        />
      </label>
      <button class="btn outline" @click="editFilters">
        <Icon name="list-filter" />
        {{ p.t('filters') }}<span v-if="filterCount"> ({{ filterCount }})</span>
      </button>
      <button class="btn outline" :disabled="store.gpsBusy" @click="gps">
        <Icon name="locate-fixed" />
        {{ p.t(store.gpsBusy ? 'locating' : 'gps') }}
      </button>
      <div class="segmented">
        <button v-for="s in ['map', 'list']" :key="s" :aria-pressed="mode === s" @click="mode = s">
          <Icon :name="s" :size="15" />
          {{ p.t(s) }}
        </button>
      </div>
    </div>
    <div :class="['explorer', mode]">
      <div class="results">
        <div class="section-head">
          <h2>{{ p.t('locations') }}</h2>
          <small v-if="store.phase === 'ok'">{{ results.length }} {{ p.t('results') }}</small>
        </div>
        <StatePanel
          v-if="store.phase !== 'ok' || !results.length"
          :phase="store.phase"
          :error="store.error"
          :retry="store.phase === 'error'"
          @retry="store.load(true, { ...f })"
        />
        <button
          v-if="store.phase === 'ok' && !results.length && (f.q || filterCount)"
          class="btn outline"
          @click="Object.assign(f, emptyFilters())"
        >
          {{ p.t('resetSearch') }}
        </button>
        <div v-if="store.phase === 'ok' && results.length" class="card-grid">
          <ToiletCard
            v-for="wc in results.slice((page - 1) * 9, page * 9)"
            :key="wc.id"
            :item="wc"
            :origin="store.origin"
          />
        </div>
        <div v-if="pages > 1" class="pager">
          <button :disabled="page === 1" @click="page--">{{ p.t('previous') }}</button>
          {{ page }} / {{ pages }}
          <button :disabled="page >= pages" @click="page++">{{ p.t('next') }}</button>
        </div>
      </div>
      <MapView v-if="mode === 'map'" :rows="results" :origin="store.origin" />
    </div>
  </section>
  <AppModal v-if="showFilters" :title="p.t('filters')" @close="showFilters = false">
    <form class="stack" @submit.prevent="applyFilters">
      <label>
        {{ p.t('access') }}
        <select v-model="draft.access">
          <option value="">{{ p.t('any') }}</option>
          <option value="FREE">{{ p.t('free') }}</option>
          <option value="PAID">{{ p.t('paid') }}</option>
        </select>
      </label>
      <label v-for="[key, label] in switches" :key="key" class="check">
        <input v-model="draft[key]" type="checkbox" />
        {{ p.t(label) }}
      </label>
      <label>
        {{ p.t('cleanliness') }}
        <select v-model.number="draft.cleanliness">
          <option :value="0">{{ p.t('any') }}</option>
          <option v-for="n in 5" :key="n" :value="n">{{ n }} / 5</option>
        </select>
      </label>
      <label>
        {{ p.t('radius') }}
        <select v-model.number="draft.radius" :disabled="!store.origin">
          <option :value="0">{{ p.t('any') }}</option>
          <option v-for="n in [1, 2, 5, 10, 20]" :key="n" :value="n">{{ n }} km</option>
        </select>
      </label>
      <button v-if="!store.origin" type="button" class="text-link" :disabled="store.gpsBusy" @click="gps">
        {{ p.t(store.gpsBusy ? 'locating' : 'gps') }}
      </button>
      <div class="row between">
        <button type="button" class="btn outline" @click="Object.assign(draft, emptyFilters(), { q: f.q })">
          {{ p.t('clear') }}
        </button>
        <button class="btn primary">{{ p.t('apply') }}</button>
      </div>
    </form>
  </AppModal>
</template>
