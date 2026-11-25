<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Brand from '../components/Brand.vue'
import Icon from '../components/Icon.vue'
import { usePrefs } from '../stores/preferences'
import { landing, useAccount } from '../stores/account'
import { failure, sessionVersion } from '../services/api'
const route = useRoute(),
  router = useRouter(),
  p = usePrefs(),
  a = useAccount()
const openMenu = ref<'account' | 'navigation' | null>(null)
const accountButton = ref<HTMLButtonElement>()
const navigationButton = ref<HTMLButtonElement>()
const nav = computed(() => [
  ['home', '/', 'house'],
  ['explore', '/explore', 'map'],
  ['add', a.role === 'ADMIN' ? '/admin/toilets/new' : '/add-toilet', 'circle-plus'],
  ['about', '/about', 'info'],
])
const accountPage = computed(() => (a.role === 'USER' ? '/dashboard' : landing(a.role)))
function closeMenu() {
  openMenu.value = null
}
function toggleMenu(menu: 'account' | 'navigation') {
  openMenu.value = openMenu.value === menu ? null : menu
}
watch([() => route.fullPath, () => a.user?.id], closeMenu)
watch(openMenu, (menu, _, onCleanup) => {
  if (!menu) return
  const button = menu === 'account' ? accountButton.value : navigationButton.value
  function closeOutside(event: Event) {
    if (event.target instanceof Node && !button?.parentElement?.contains(event.target)) closeMenu()
  }
  function onEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeMenu()
      button?.focus()
    }
  }
  document.addEventListener('pointerdown', closeOutside)
  document.addEventListener('focusin', closeOutside)
  document.addEventListener('keydown', onEscape)
  onCleanup(() => {
    document.removeEventListener('pointerdown', closeOutside)
    document.removeEventListener('focusin', closeOutside)
    document.removeEventListener('keydown', onEscape)
  })
})
watch(sessionVersion, () => {
  if (route.meta.requiresAuth && !a.user)
    void router.replace({ path: '/login', query: { redirect: route.fullPath } })
})
async function logout() {
  try {
    await a.logout()
  } catch (e) {
    p.toast(failure(e))
  } finally {
    closeMenu()
    await router.replace('/')
  }
}
</script>
<template>
  <a class="skip" href="#main">{{ p.t('skip') }}</a>
  <header class="site-header">
    <div class="wrap header-inner">
      <Brand />
      <nav class="desktop-nav" :aria-label="p.t('menu')">
        <RouterLink
          v-for="[key, path] in nav"
          :key="path"
          :to="path"
          :class="{ active: route.path === path }"
        >
          {{ p.t(key) }}
        </RouterLink>
      </nav>
      <div class="tools">
        <button
          class="language"
          :aria-label="p.t('language')"
          @click="p.lang = p.lang === 'en' ? 'km' : 'en'"
        >
          <Icon name="globe" :size="17" />
          {{ p.localeName }}
        </button>
        <button class="iconbtn theme" :aria-label="p.t('theme')" @click="p.dark = !p.dark">
          <Icon :name="p.dark ? 'sun' : 'moon'" :size="18" />
        </button>
        <span class="divider" />
        <RouterLink v-if="!a.user" to="/login" class="btn primary small">
          <Icon name="log-in" :size="16" />
          {{ p.t('login') }}
        </RouterLink>
        <div v-else class="header-dropdown">
          <button
            ref="accountButton"
            class="btn primary small"
            aria-controls="account-links"
            :aria-expanded="openMenu === 'account'"
            @click="toggleMenu('account')"
          >
            <Icon name="user" :size="16" />
            {{ p.t('account') }}
          </button>
          <div v-show="openMenu === 'account'" id="account-links" class="menubox" @click="closeMenu">
            <RouterLink :to="accountPage">{{ p.t('dashboard') }}</RouterLink>
            <RouterLink to="/notifications">{{ p.t('notifications') }}</RouterLink>
            <RouterLink :to="a.role === 'MANAGER' ? '/manager/profile' : '/profile'">
              {{ p.t('profile') }}
            </RouterLink>
            <button @click="logout">{{ p.t('logout') }}</button>
          </div>
        </div>
        <div class="header-dropdown mobile-menu">
          <button
            ref="navigationButton"
            class="iconbtn"
            :aria-label="p.t('menu')"
            aria-controls="navigation-links"
            :aria-expanded="openMenu === 'navigation'"
            @click="toggleMenu('navigation')"
          >
            <Icon :name="openMenu === 'navigation' ? 'x' : 'menu'" />
          </button>
          <nav v-show="openMenu === 'navigation'" id="navigation-links" class="menubox" :aria-label="p.t('menu')" @click="closeMenu">
            <RouterLink v-for="[key, path] in nav" :key="path" :to="path">{{ p.t(key) }}</RouterLink>
          </nav>
        </div>
      </div>
    </div>
  </header>
  <main id="main" tabindex="-1"><slot /></main>
  <footer class="site-footer">
    <div class="wrap row between">
      <div>
        <Brand />
        <p>{{ p.t('footer') }}</p>
      </div>
      <div class="row">
        <RouterLink to="/about">{{ p.t('about') }}</RouterLink>
        <RouterLink to="/explore">{{ p.t('explore') }}</RouterLink>
      </div>
    </div>
  </footer>
  <nav class="bottomnav" :aria-label="p.t('menu')">
    <RouterLink v-for="[key, path, icon] in nav.slice(0, 3)" :key="path" :to="path">
      <Icon :name="icon" :size="19" />
      {{ p.t(key) }}
    </RouterLink>
  </nav>
  <div v-if="p.notice" class="toast" role="status">
    <Icon name="info" :size="17" />
    {{ p.t(p.notice) }}
    <button class="iconbtn" :aria-label="p.t('close')" @click="p.notice = ''">
      <Icon name="x" :size="15" />
    </button>
  </div>
</template>
