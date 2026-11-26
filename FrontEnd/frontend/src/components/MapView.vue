<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import L from '../vendor/leaflet'
import type { Point, Toilet } from '../types/api'
import { point } from '../services/records'
import { usePrefs } from '../stores/preferences'
const props = withDefaults(
  defineProps<{ rows?: Toilet[]; origin?: Point; selected?: Point; picker?: boolean }>(),
  { rows: () => [] },
)
const emit = defineEmits<{ pick: [Point] }>()
const p = usePrefs(),
  el = ref<HTMLElement>(),
  tileError = ref(false)
const center =
  point(import.meta.env.VITE_DEFAULT_LATITUDE, import.meta.env.VITE_DEFAULT_LONGITUDE) ??
  ([11.5564, 104.9282] as Point)
const baseZoom = Math.max(1, Math.min(19, Number(import.meta.env.VITE_DEFAULT_MAP_ZOOM) || 13))
let map: ReturnType<typeof L.map>,
  group: ReturnType<typeof L.layerGroup>,
  resize: ResizeObserver | undefined
const icon = (name: string) =>
  L.icon({
    iconUrl: '/icons/' + name + '.svg',
    iconSize: [31, 40],
    iconAnchor: [16, 38],
    popupAnchor: [0, -36],
  })
// Several triggers can fire in one frame (rows + origin + zoom); redraw once per frame.
let frame = 0
function draw() {
  if (!map || frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    paint()
  })
}
function paint() {
  group.clearLayers()
  const cells = new Map<string, Toilet[]>()
  for (const wc of props.rows) {
    if (!wc.point) continue
    const v = map.project(wc.point, map.getZoom()),
      cell =
        props.rows.length > 35 && map.getZoom() < 18
          ? Math.floor(v.x / 55) + ',' + Math.floor(v.y / 55)
          : wc.id
    cells.set(cell, [...(cells.get(cell) ?? []), wc])
  }
  for (const list of cells.values()) {
    const wc = list[0],
      loc = wc.point!,
      name = (p.lang === 'km' && wc.nameKm) || wc.name
    if (list.length > 1) {
      L.marker(loc, {
        icon: L.divIcon({ className: 'cluster', html: String(list.length), iconSize: [36, 36] }),
        title: String(list.length) + ' ' + p.t('locations'),
      })
        .on('click', () => map.setView(loc, map.getZoom() + 2))
        .addTo(group)
      continue
    }
    // Built only when the popup opens, so photos are not downloaded for every marker on every redraw.
    const popup = () => {
      const div = document.createElement('div')
      if (wc.images[0]) {
        const img = document.createElement('img')
        img.src = wc.images[0]
        img.alt = name
        img.referrerPolicy = 'no-referrer'
        div.append(img)
      }
      const a = document.createElement('a')
      a.href = '/toilets/' + encodeURIComponent(wc.id)
      a.textContent = name
      div.append(a)
      const addr = document.createElement('small')
      addr.textContent = wc.address
      div.append(addr)
      return div
    }
    L.marker(loc, {
      icon: icon(
        wc.wheelchair ? 'accessible-marker' : wc.access === 'PAID' ? 'paid-wc-marker' : 'wc-marker',
      ),
      title: name,
      alt: name,
    })
      .bindPopup(popup)
      .addTo(group)
  }
  if (props.origin)
    L.circleMarker(props.origin, {
      radius: 8,
      color: '#fff',
      weight: 3,
      fillColor: '#1767a6',
      fillOpacity: 1,
    }).addTo(group)
  if (props.selected) {
    const marker = L.marker(props.selected, {
      icon: icon('wc-marker'),
      draggable: props.picker,
      title: p.t('location'),
    }).addTo(group)
    if (props.picker)
      marker.on('dragend', () => {
        const v = marker.getLatLng()
        emit('pick', [v.lat, v.lng])
      })
  }
}
function focus() {
  const v = props.selected ?? props.origin
  if (v) map?.setView(v, 15)
  else if (props.rows.length) {
    const pts = props.rows.flatMap((r) => (r.point ? [r.point] : []))
    if (pts.length) map?.fitBounds(pts, { padding: [32, 32], maxZoom: 16 })
  }
}
onMounted(() => {
  map = L.map(el.value!, { zoomControl: false, scrollWheelZoom: false }).setView(center, baseZoom)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
    .on('tileerror', () => (tileError.value = true))
    .on('tileload', () => (tileError.value = false))
    .addTo(map)
  group = L.layerGroup().addTo(map)
  paint()
  focus()
  map.on('zoomend', draw)
  if (props.picker) map.on('click', (e) => emit('pick', [e.latlng.lat, e.latlng.lng]))
  if (typeof ResizeObserver !== 'undefined') {
    resize = new ResizeObserver(() => map.invalidateSize())
    resize.observe(el.value!)
  }
})
watch(() => [props.rows, props.selected, props.origin, p.lang], draw)
watch(() => [props.origin, props.selected, props.rows], focus)
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  resize?.disconnect()
  map?.remove()
})
</script>
<template>
  <div class="map-frame">
    <div ref="el" class="leaflet-map" :aria-label="p.t('map')"></div>
    <div class="map-zoom">
      <button type="button" :aria-label="p.t('zoomIn')" @click="map.setZoom(map.getZoom() + 1)">+</button>
      <button type="button" :aria-label="p.t('zoomOut')" @click="map.setZoom(map.getZoom() - 1)">−</button>
    </div>
    <small v-if="tileError" class="map-warning">{{ p.t('mapTiles') }}</small>
  </div>
</template>
