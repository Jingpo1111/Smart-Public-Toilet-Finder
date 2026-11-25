<script setup lang="ts">
import { usePrefs } from '../stores/preferences'
const p = usePrefs()
</script>
<template>
  <RouterLink to="/" class="brand" aria-label="ToiletGo KH">
    <img
      :src="p.dark ? '/images/branding/toiletgo-logo-dark.svg' : '/images/branding/toiletgo-logo.svg'"
      alt=""
      width="37"
      height="37"
    />
    <span>ToiletGo</span>
    <b>KH</b>
  </RouterLink>
</template>
