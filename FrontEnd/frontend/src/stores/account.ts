import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  acceptTokens,
  canRestore,
  discover,
  hasToken,
  isRow,
  logoutRequest,
  refresh,
  request,
  resetSession,
  sessionVersion,
  unwrap,
} from '../services/api'
import type { Role, Row } from '../types/api'
export const landing = (role?: Role) =>
  role === 'ADMIN' ? '/admin/dashboard' : role === 'MANAGER' ? '/manager/dashboard' : '/'
export const useAccount = defineStore('account', () => {
  const user = ref<Row | null>(null),
    restored = ref(false)
  const role = computed(() => user.value?.role as Role | undefined)
  watch(
    sessionVersion,
    () => {
      user.value = null
    },
    { flush: 'sync' },
  )
  async function identify() {
    const account = unwrap(await request('get', '/auth/me', { auth: true }))
    if (
      !isRow(account) ||
      !['USER', 'MANAGER', 'ADMIN'].includes(String(account.role)) ||
      account.id == null
    )
      throw new Error('incompatible')
    user.value = account
  }
  let restoration: Promise<void> | undefined
  async function restore() {
    if (restored.value) return
    restoration ??= (async () => {
      try {
        if (canRestore()) {
          await discover()
          await refresh()
          await identify()
        }
      } catch {
        resetSession()
      } finally {
        restored.value = true
      }
    })()
    return restoration
  }
  async function login(values: Row) {
    resetSession()
    try {
      acceptTokens(await request('post', '/auth/login', { body: values }))
      await identify()
    } catch (e) {
      resetSession()
      throw e
    }
  }
  async function logout() {
    if (hasToken()) await logoutRequest()
    else resetSession()
  }
  return { user, role, restore, login, logout, identify }
})
