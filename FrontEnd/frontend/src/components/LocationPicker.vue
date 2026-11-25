<script setup lang="ts">
import { computed } from 'vue'
import { point } from '../services/records'
import { useDiscovery } from '../stores/discovery'
import { usePrefs } from '../stores/preferences'
import type { Point } from '../types/api'
import MapView from './MapView.vue'

const props = defineProps<{ latitude?: unknown; longitude?: unknown }>()
const emit = defineEmits<{ 'update:latitude': [string]; 'update:longitude': [string] }>()
const selected = computed(() => point(props.latitude, props.longitude))
const store = useDiscovery()
const p = usePrefs()

function pick([lat, lng]: Point) {
  emit('update:latitude', lat.toFixed(6))
  emit('update:longitude', lng.toFixed(6))
}

async function gps() {
  try {
    pick(await store.locate())
  } catch {
    p.toast('gpsDenied')
  }
}
</script>
<template>
  <p>{{ p.t('mapHint') }}</p>
  <MapView picker :selected="selected" @pick="pick" />
  <button type="button" class="btn outline" :disabled="store.gpsBusy" @click="gps">
    {{ p.t(store.gpsBusy ? 'locating' : 'gps') }}
  </button>
</template>
