<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePrefs } from '../stores/preferences'
import { useAccount } from '../stores/account'
import { intended } from '../router'
import { acceptTokens, bodySchema, checked, discover, failure, request, supports } from '../services/api'
import Icon from '../components/Icon.vue'
const { mode } = defineProps<{ mode: 'login' | 'register' | 'forgot-password' | 'reset-password' }>()
const p = usePrefs(),
  account = useAccount(),
  route = useRoute(),
  router = useRouter(),
  endpoint = '/auth/' + mode
const title = (
  {
    login: 'login',
    register: 'register',
    'forgot-password': 'forgot',
    'reset-password': 'reset',
  } as Record<string, string>
)[mode]
const ready = computed(() => supports('post', endpoint)),
  email = ref(''),
  name = ref(''),
  password = ref(''),
  repeat = ref(''),
  token = ref(String(route.query.token ?? '')),
  visible = ref(false),
  busy = ref(false),
  error = ref(''),
  message = ref('')
onMounted(() => discover())
async function submit() {
  if (busy.value || !ready.value) return
  if (['register', 'reset-password'].includes(mode) && password.value !== repeat.value) {
    error.value = 'mismatch'
    return
  }
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    if (mode === 'login') {
      await account.login({ email: email.value.trim(), password: password.value })
      await router.replace(intended(route.query.redirect, account.role))
    }
    if (mode === 'register') {
      const field = bodySchema('post', endpoint).properties?.fullName ? 'fullName' : 'name'
      acceptTokens(
        await request('post', endpoint, {
          body: { [field]: name.value.trim(), email: email.value.trim(), password: password.value },
        }),
      )
      await account.identify()
      await router.replace(intended(route.query.redirect, account.role))
    }
    if (mode === 'forgot-password') {
      await request('post', endpoint, { body: { email: email.value.trim() } })
      message.value = 'resetSent'
    }
    if (mode === 'reset-password') {
      await request('post', endpoint, { body: { token: token.value, newPassword: password.value } })
      p.toast('saved')
      await router.replace('/login')
    }
  } catch (e) {
    error.value = failure(e)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="wrap page auth-layout">
    <aside class="auth-art">
      <img src="/images/illustrations/find-toilet.svg" alt="" />
      <h2>ToiletGo KH</h2>
      <p>{{ p.t('accountIntro') }}</p>
    </aside>
    <form class="stack" @submit.prevent="submit">
      <h1>{{ p.t(title) }}</h1>
      <label v-if="mode === 'register'">
        {{ p.t('name') }}
        <input v-model="name" required minlength="2" maxlength="120" autocomplete="name" />
      </label>
      <label v-if="mode !== 'reset-password'">
        {{ p.t('email') }}
        <input v-model="email" required type="email" maxlength="254" autocomplete="email" />
      </label>
      <label v-if="mode === 'reset-password'">
        {{ p.t('resetToken') }}
        <input v-model="token" required autocomplete="off" />
      </label>
      <label v-if="mode !== 'forgot-password'">
        {{ p.t(mode === 'reset-password' ? 'newPassword' : 'password') }}
        <span class="password-field">
          <input
            v-model="password"
            required
            :type="visible ? 'text' : 'password'"
            :minlength="mode === 'login' ? 1 : 8"
            maxlength="128"
            :pattern="mode === 'login' ? undefined : '(?=.*[A-Za-z])(?=.*[0-9]).{8,128}'"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          />
          <button
            type="button"
            class="iconbtn"
            :aria-label="p.t('showPassword')"
            @click="visible = !visible"
          >
            <Icon :name="visible ? 'eye-off' : 'eye'" :size="17" />
          </button>
        </span>
      </label>
      <label v-if="['register', 'reset-password'].includes(mode)">
        {{ p.t('confirmPassword') }}
        <input v-model="repeat" type="password" required autocomplete="new-password" />
      </label>
      <p v-if="error" class="error" role="alert">{{ p.t(error) }}</p>
      <p v-if="message" class="notice" role="status">{{ p.t(message) }}</p>
      <div v-if="checked && !ready" class="notice row between">
        {{ p.t('unavailable') }}
        <button type="button" class="text-link" @click="discover(true)">{{ p.t('retry') }}</button>
      </div>
      <button class="btn primary" :disabled="!ready || busy">{{ p.t(busy ? 'loading' : title) }}</button>
      <div class="row">
        <RouterLink v-if="mode === 'login'" to="/forgot-password" class="text-link">
          {{ p.t('forgot') }}
        </RouterLink>
        <RouterLink :to="mode === 'login' ? '/register' : '/login'" class="text-link">
          {{ p.t(mode === 'login' ? 'register' : 'login') }}
        </RouterLink>
      </div>
    </form>
  </div>
</template>
