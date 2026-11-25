<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Row } from '../types/api'
import { isRow } from '../services/api'
import { usePrefs, statusKey } from '../stores/preferences'
const props = defineProps<{ data: Row }>(),
  p = usePrefs(),
  canvas = ref<HTMLCanvasElement>(),
  chosen = ref(0)
type Series = { key: string; labels: string[]; values: number[] }
function visit(input: Row, outer = '') {
  const counts: { key: string; value: number }[] = [],
    series: Series[] = []
  for (const [k, v] of Object.entries(input)) {
    const key = outer ? outer + '.' + k : k
    if (typeof v === 'number') counts.push({ key, value: v })
    if (isRow(v)) {
      const entries = Object.entries(v)
      if (
        entries.length > 1 &&
        entries.every(([, n]) => typeof n === 'number') &&
        ['suggestions', 'byStatus', 'accessTypes', 'reportCategories', 'toiletsByStatus'].includes(k)
      ) {
        series.push({ key, labels: entries.map(([k]) => k), values: entries.map(([, n]) => Number(n)) })
      }
      const part = visit(v, key)
      counts.push(...part.counts)
      series.push(...part.series)
    }
    if (Array.isArray(v) && v.length && v.every(isRow)) {
      const labelKey = Object.keys(v[0]).find((k) =>
        ['month', 'date', 'district', 'status', 'label', 'day', 'period'].includes(k),
      )
      if (!labelKey) continue
      for (const col of Object.keys(v[0]).filter((k) => k !== labelKey && typeof v[0][k] === 'number')) {
        series.push({
          key: col === 'count' ? key : key + '.' + col,
          labels: v.map((r) => String(r[labelKey])),
          values: v.map((r) => Number(r[col])),
        })
      }
    }
  }
  return { counts, series }
}
const parsed = computed(() => visit(props.data)),
  current = computed(() => parsed.value.series[chosen.value])
const label = (k: string) =>
  k
    .split('.')
    .map((v) => {
      const l = p.t(statusKey(v))
      return l === v ? v.replace(/([a-z])([A-Z])/g, '$1 $2') : l
    })
    .join(' · ')
let chart: { destroy: () => void } | undefined,
  version = 0
watch(
  [current, canvas, () => p.lang],
  async () => {
    const id = ++version
    chart?.destroy()
    chart = undefined
    await nextTick()
    const s = current.value,
      el = canvas.value
    if (!el || !s) return
    const mod = await import('../vendor/chart')
    if (id === version)
      chart = new mod.default(el, {
        type: 'bar',
        data: {
          labels: s.labels.map(label),
          datasets: [{ label: label(s.key), data: s.values, backgroundColor: '#059669' }],
        },
        options: { responsive: true, animation: false },
      })
  },
  { flush: 'post' },
)
onBeforeUnmount(() => {
  version++
  chart?.destroy()
})
</script>
<template>
  <div class="stack">
    <div v-if="parsed.counts.length" class="stats-grid">
      <article v-for="n in parsed.counts" :key="n.key" class="stat">
        <small>{{ label(n.key) }}</small>
        <b>{{ n.value.toLocaleString(p.lang) }}</b>
      </article>
    </div>
    <template v-if="current">
      <select v-model.number="chosen" class="field" :aria-label="p.t('chart')">
        <option v-for="(s, i) in parsed.series" :key="s.key" :value="i">{{ label(s.key) }}</option>
      </select>
      <div><canvas ref="canvas" :aria-label="label(current.key)" /></div>
      <div class="table-wrap">
        <table>
          <tbody>
            <tr v-for="(v, i) in current.values" :key="i">
              <th>{{ label(current.labels[i]) }}</th>
              <td>{{ v }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <p v-if="!current && !parsed.counts.length">{{ p.t('noRecords') }}</p>
  </div>
</template>
