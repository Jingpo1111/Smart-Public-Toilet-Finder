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
  a = useAccount(),
  menu = ref(false)
const nav = [
  ['home', '/', 'house'],
  ['explore', '/explore', 'map'],
  ['add', '/add-toilet', 'circle-plus'],
  ['about', '/about', 'info'],
]
const accountPage = computed(() => (a.role === 'USER' ? '/dashboard' : landing(a.role)))
watch(
  () => route.fullPath,
  () => {
    menu.value = false
  },
)
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
    menu.value = false
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
        <button v-else class="btn primary small" @click="menu = !menu" :aria-expanded="menu">
          <Icon name="user" :size="16" />
          {{ p.t('account') }}
        </button>
        <button
          class="mobile-menu iconbtn"
          :aria-label="p.t('menu')"
          :aria-expanded="menu"
          @click="menu = !menu"
        >
          <Icon name="menu" />
        </button>
      </div>
      <div v-if="menu" class="menubox">
        <RouterLink v-for="[key, path] in nav" :key="path" :to="path">{{ p.t(key) }}</RouterLink>
        <RouterLink v-if="a.user" :to="accountPage">{{ p.t('dashboard') }}</RouterLink>
        <RouterLink v-if="a.user" to="/notifications">{{ p.t('notifications') }}</RouterLink>
        <RouterLink v-if="a.user" :to="a.role === 'MANAGER' ? '/manager/profile' : '/profile'">
          {{ p.t('profile') }}
        </RouterLink>
        <button v-if="a.user" @click="logout">{{ p.t('logout') }}</button>
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
