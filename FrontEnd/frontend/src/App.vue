<script setup lang="ts">
import { useRoute } from 'vue-router'
import PublicLayout from './layouts/PublicLayout.vue'
import { sessionVersion } from './services/api'
const route = useRoute()
</script>
<template>
  <PublicLayout><RouterView :key="route.path + ':' + sessionVersion" /></PublicLayout>
</template>
<!-- hu -->