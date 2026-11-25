<script setup lang="ts">
import { useRoute } from 'vue-router'
import { usePrefs } from '../stores/preferences'
const p = usePrefs(),
  route = useRoute()
</script>
<template>
  <section class="wrap page centered">
    <img src="/images/illustrations/error.svg" width="160" alt="" />
    <h1>{{ route.path === '/403' ? '403' : '404' }}</h1>
    <p>{{ p.t(route.path === '/403' ? 'forbidden' : 'missing') }}</p>
    <RouterLink to="/" class="btn primary">{{ p.t('backHome') }}</RouterLink>
  </section>
</template>
