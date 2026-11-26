<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePrefs } from '../stores/preferences'
import { useDiscovery } from '../stores/discovery'
import { emptyFilters, filterToilets } from '../services/records'
import { isRow, request, supports, unwrap } from '../services/api'
import Icon from '../components/Icon.vue'
import StatePanel from '../components/StatePanel.vue'
import ToiletCard from '../components/ToiletCard.vue'
const p = usePrefs(),
  store = useDiscovery(),
  router = useRouter(),
  q = ref(''),
  tab = ref('nearby')
const counts = ref<{ key: string; value: number }[]>([])
const categories = [
  ['free', 'ticket', 'mint'],
  ['open', 'clock-3', 'amber'],
  ['accessible', 'accessibility', 'blue'],
  ['rated', 'star', 'rose'],
  ['paid', 'banknote', 'lilac'],
]
const filtered = computed(() =>
  filterToilets(
    store.rows,
    { ...emptyFilters(), rated: tab.value === 'popular' },
    tab.value === 'nearby' ? store.origin : undefined,
  ).slice(0, 3),
)
function explore() {
  void router.push({ path: '/explore', query: q.value.trim() ? { q: q.value.trim() } : undefined })
}
async function gps() {
  try {
    await store.locate()
    await router.push({ path: '/explore', query: { nearby: '1', q: q.value.trim() || undefined } })
  } catch {
    p.toast('gpsDenied')
  }
}
onMounted(async () => {
  // The list and the optional statistics are independent: request them together.
  void store.load()
  if (supports('get', '/stats')) {
    try {
      const data = unwrap(await request('get', '/stats', { auth: false }))
      if (isRow(data))
        counts.value = [
          'verifiedToilets',
          'wheelchairAccessibleToilets',
          'districtsCovered',
          'publicReviews',
        ].flatMap((key) => (typeof data[key] === 'number' ? [{ key, value: data[key] as number }] : []))
    } catch {
      /* An unavailable optional statistic is omitted. */
    }
  }
})
</script>
<template>
  <div class="wrap home-wrap">
    <section class="hero">
      <div class="hero-art" role="img" :aria-label="p.t('city')"></div>
      <div class="hero-copy">
        <div class="city-label">
          <span class="city-dot" />
          {{ p.t('city') }}
        </div>
        <h1>
          {{ p.t('headline') }}
          <em>{{ p.t('nearYou') }}</em>
        </h1>
        <p>{{ p.t('intro') }}</p>
        <form class="hero-search" @submit.prevent="explore">
          <Icon name="search" :size="20" />
          <input
            v-model="q"
            type="search"
            :placeholder="p.t('searchHint')"
            :aria-label="p.t('searchHint')"
          />
          <button class="btn primary" type="submit">
            {{ p.t('explore') }}
            <Icon name="arrow-right" :size="16" />
          </button>
        </form>
        <button class="gps-link" :disabled="store.gpsBusy" @click="gps">
          <Icon name="locate-fixed" :size="17" />
          {{ p.t(store.gpsBusy ? 'locating' : 'gps') }}
        </button>
      </div>
      <div class="hero-caption">
        <Icon name="map-pin" :size="13" />
        Phnom Penh
        <i />
        11.56° N, 104.93° E
      </div>
    </section>
    <section class="home-section">
      <div class="section-head">
        <div>
          <h2>{{ p.t('category') }}</h2>
          <p>{{ p.t('categoryIntro') }}</p>
        </div>
        <RouterLink to="/explore" class="text-link">
          {{ p.t('all') }}
          <Icon name="arrow-right" :size="16" />
        </RouterLink>
      </div>
      <div class="categories">
        <RouterLink
          v-for="[key, icon, color] in categories"
          :key="key"
          :to="{ path: '/explore', query: { category: key } }"
          class="category-card"
        >
          <span :class="['category-icon', color]"><Icon :name="icon" :size="22" /></span>
          <strong>{{ p.t(key) }}</strong>
          <Icon name="chevron-right" :size="14" />
        </RouterLink>
      </div>
    </section>
    <section class="home-section">
      <div class="section-head">
        <h2>{{ p.t(tab === 'nearby' && !store.origin ? 'cityRestrooms' : tab) }}</h2>
        <div class="segmented">
          <button v-for="s in ['nearby', 'popular']" :key="s" :aria-pressed="tab === s" @click="tab = s">
            {{ p.t(s === 'nearby' ? 'locations' : s) }}
          </button>
        </div>
      </div>
      <StatePanel
        v-if="store.phase !== 'ok' || !filtered.length"
        :phase="store.phase"
        :error="store.error"
        :retry="store.phase === 'error'"
        :cards="3"
        description="nonePublished"
        @retry="store.load(true)"
      />
      <div v-else class="card-grid">
        <ToiletCard v-for="wc in filtered" :key="wc.id" :item="wc" :origin="store.origin" />
      </div>
    </section>
    <section v-if="counts.length" class="home-section public-stats">
      <article v-for="n in counts" :key="n.key">
        <strong>{{ n.value.toLocaleString(p.lang) }}</strong>
        <p>{{ p.t(n.key) }}</p>
      </article>
    </section>
    <section class="home-section">
      <h2>{{ p.t('how') }}</h2>
      <div class="how-grid">
        <article
          v-for="[title, desc, img] in [
            ['find', 'findText', 'find-toilet'],
            ['checkDetails', 'detailsText', 'location-approved'],
            ['contribute', 'contributeText', 'add-location'],
          ]"
          :key="title"
        >
          <img
            :src="'/images/illustrations/' + img + '.svg'"
            alt=""
            loading="lazy"
            width="120"
            height="93"
          />
          <div>
            <h3>{{ p.t(title) }}</h3>
            <p>{{ p.t(desc) }}</p>
          </div>
        </article>
      </div>
    </section>
    <aside class="cta">
      <div>
        <h2>{{ p.t('community') }}</h2>
        <p>{{ p.t('communityText') }}</p>
      </div>
      <RouterLink class="btn primary" to="/add-toilet">
        <Icon name="plus" />
        {{ p.t('add') }}
      </RouterLink>
    </aside>
  </div>
</template>
