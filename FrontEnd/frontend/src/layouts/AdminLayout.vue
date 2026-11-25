<script setup lang="ts">
import { adminNav } from '../router'
import RoleLayout from './RoleLayout.vue'
defineProps<{ title: string }>()
</script>
<template>
  <RoleLayout scope="admin" :nav="adminNav" :title="title"><slot /></RoleLayout>
</template>
