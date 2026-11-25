<script setup lang="ts">
import { managerNav } from '../router'
import RoleLayout from './RoleLayout.vue'
defineProps<{ title: string }>()
</script>
<template>
  <RoleLayout scope="manager" :nav="managerNav" :title="title"><slot /></RoleLayout>
</template>
