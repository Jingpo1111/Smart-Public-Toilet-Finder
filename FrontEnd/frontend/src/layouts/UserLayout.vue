<script setup lang="ts">
import { userNav } from '../router'
import RoleLayout from './RoleLayout.vue'
defineProps<{ title: string }>()
</script>
<template>
  <RoleLayout scope="account" :nav="userNav" :title="title"><slot /></RoleLayout>
</template>
