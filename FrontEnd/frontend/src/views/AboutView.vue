<script setup lang="ts">
import { usePrefs } from '../stores/preferences'
const p = usePrefs()
</script>
<template>
  <article class="wrap narrow page">
    <img class="about-hero" src="/images/hero/phnom-penh-hero.svg" :alt="p.t('city')" />
    <h1>{{ p.t('about') }} ToiletGo KH</h1>
    <p class="lede">{{ p.t('aboutText') }}</p>
    <RouterLink class="btn primary" to="/explore">{{ p.t('explore') }}</RouterLink>
  </article>
</template>
