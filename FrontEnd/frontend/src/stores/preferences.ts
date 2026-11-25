import { computed, ref, watch, type App, type Ref } from 'vue'
import { defineStore } from 'pinia'
import en from '../locales/en.json'
import km from '../locales/km.json'
const messages: Record<string, Record<string, string>> = { en, km }
const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* preferences still apply to this tab */
  }
}
type Composer = { locale: Ref<string>; t: (k: string) => string }
let composer: Composer | undefined
export async function installI18n(app: App) {
  const loader = Object.values(import.meta.glob('/node_modules/vue-i18n/dist/vue-i18n.mjs'))[0]
  if (loader) {
    const mod = (await loader()) as {
      createI18n: (o: unknown) => { global: Composer; install: (app: App) => void }
    }
    const plugin = mod.createI18n({
      legacy: false,
      locale: read('tg-language') === 'km' ? 'km' : 'en',
      fallbackLocale: 'en',
      messages,
    })
    app.use(plugin)
    composer = plugin.global
  }
}
export const usePrefs = defineStore('preferences', () => {
  const lang = ref(read('tg-language') === 'km' ? 'km' : 'en')
  const dark = ref(
    read('tg-theme') === 'dark' ||
      (!read('tg-theme') && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true),
  )
  const notice = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined
  function toast(key: string) {
    notice.value = key
    clearTimeout(timer)
    timer = setTimeout(() => (notice.value = ''), 5000)
  }
  watch(
    lang,
    (v) => {
      document.documentElement.lang = v
      write('tg-language', v)
      if (composer) composer.locale.value = v
    },
    { immediate: true },
  )
  watch(
    dark,
    (v) => {
      document.documentElement.dataset.theme = v ? 'dark' : 'light'
      write('tg-theme', v ? 'dark' : 'light')
    },
    { immediate: true },
  )
  const t = (key: string) => {
    const value = messages[lang.value]?.[key]
    return value ? (composer?.t(key) ?? value) : key
  }
  const money = (n: number) =>
    new Intl.NumberFormat(lang.value === 'km' ? 'km-KH' : 'en-KH', {
      style: 'currency',
      currency: 'KHR',
      maximumFractionDigits: 0,
    }).format(n)
  const date = (s: string) =>
    Number.isFinite(Date.parse(s))
      ? new Intl.DateTimeFormat(lang.value === 'km' ? 'km-KH' : 'en-GB', {
          timeZone: 'Asia/Phnom_Penh',
          dateStyle: 'medium',
        }).format(new Date(s))
      : ''
  return {
    lang,
    dark,
    t,
    money,
    date,
    notice,
    toast,
    localeName: computed(() => (lang.value === 'en' ? 'EN' : 'ខ្មែរ')),
  }
})
export function statusKey(s: string) {
  return (
    (
      {
        PENDING: 'pending',
        APPROVED: 'approved',
        REJECTED: 'rejected',
        OPEN: 'operational',
        CLOSED: 'closed',
        UNDER_MAINTENANCE: 'maintenance',
        IN_PROGRESS: 'inProgress',
        RESOLVED: 'resolved',
        FREE: 'free',
        PAID: 'paid',
        UNKNOWN: 'unknown',
        DIRTY: 'dirty',
        NO_WATER: 'noWater',
        NO_SOAP: 'noSoap',
        BROKEN_DOOR: 'brokenDoor',
        BROKEN_EQUIPMENT: 'broken',
        INCORRECT_LOCATION: 'incorrectLocation',
        INCORRECT_PRICE: 'incorrectPrice',
        OTHER: 'other',
      } as Record<string, string>
    )[s] ?? s
  )
}
