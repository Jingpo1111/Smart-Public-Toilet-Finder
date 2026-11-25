import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { request, sessionVersion } from '../services/api'
import { pageOf } from '../services/records'
import type { Page, Row } from '../types/api'

// Keep only the last visible private page per domain. A session change clears it synchronously.
function resourceStore(name: string) {
  return defineStore(name, () => {
    const last = ref<Page<Row>>(),
      revision = ref(0)
    function invalidate() {
      revision.value++
      last.value = undefined
    }
    watch(sessionVersion, invalidate, { flush: 'sync' })
    async function list(path: string, params: Row = {}, id?: string) {
      const start = revision.value,
        answer = pageOf(await request('get', path, { params, id }))
      if (start !== revision.value) throw new Error('cancelled')
      last.value = answer
      return answer
    }
    return { last, list, invalidate }
  })
}
export const useSuggestions = resourceStore('suggestions')
export const useFavorites = resourceStore('favorites')
export const useNotifications = resourceStore('notifications')
export const useAdmin = resourceStore('admin')
export const useManager = resourceStore('manager')
export const useActivity = resourceStore('activity')
export function ownerOf(path: string) {
  if (path.startsWith('/admin')) return useAdmin()
  if (path.startsWith('/manager')) return useManager()
  if (path.includes('suggestions')) return useSuggestions()
  if (path.includes('favorites')) return useFavorites()
  if (path.includes('notifications')) return useNotifications()
  return useActivity()
}
