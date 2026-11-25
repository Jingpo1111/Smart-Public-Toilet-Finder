<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { userNav } from '../router'
import { useAccount } from '../stores/account'
import { usePrefs, statusKey } from '../stores/preferences'
import { useDiscovery } from '../stores/discovery'
import { discover, failure, isRow, op, request, supports, unwrap } from '../services/api'
import { uploadField, validatePhotos } from '../services/upload'
import { ownerOf } from '../stores/resources'
import { detailPaths, resources, sections, type Action } from '../services/workspace'
import { idOf, imageURL, pageOf } from '../services/records'
import type { Row } from '../types/api'
import UserLayout from '../layouts/UserLayout.vue'
import AdminLayout from '../layouts/AdminLayout.vue'
import ManagerLayout from '../layouts/ManagerLayout.vue'
import Icon from '../components/Icon.vue'
import StatePanel from '../components/StatePanel.vue'
import FacilityPhotoActions from '../components/FacilityPhotoActions.vue'
import MutationForm from '../components/MutationForm.vue'
import RecordTable from '../components/RecordTable.vue'
import RecordDetail from '../components/RecordDetail.vue'
import StatsPanel from '../components/StatsPanel.vue'
import AppModal from '../components/AppModal.vue'
const props = defineProps<{ section?: string }>()
const route = useRoute(),
  router = useRouter(),
  a = useAccount(),
  p = usePrefs(),
  publicData = useDiscovery()
const path = route.path,
  id = String(route.params.id ?? ''),
  base = id ? path.slice(0, path.lastIndexOf('/')) : path
const admin = path.startsWith('/admin/'),
  manager = path.startsWith('/manager/'),
  layout = admin ? AdminLayout : manager ? ManagerLayout : UserLayout
const title = props.section ?? String(route.meta.title),
  endpoint = resources[base],
  profile = title === 'profile',
  dashboard = title === 'dashboard',
  create = path === '/admin/toilets/new',
  personal = path === '/dashboard'
const page = ref(1),
  pages = ref(1),
  q = ref(''),
  filter = ref(''),
  archived = ref('exclude'),
  phase = ref('loading'),
  error = ref(''),
  rows = ref<Row[]>([]),
  detail = ref<Row>(),
  selected = ref<Row>(),
  stats = ref<Row>({}),
  summaries = ref<{ path: string; rows: Row[]; error: string }[]>([]),
  action = ref<Action>(),
  uploading = ref(false)
const cleaningTab = ref('cleaning-logs'),
  qr = ref<{ url: string; png: string }>()
const extra = ref<{ key: string; rows: Row[] }[]>([]),
  extraError = ref(''),
  roleAssigned = base === '/manager/cleaning'
let version = 0,
  timer: ReturnType<typeof setTimeout> | undefined
const listPath = computed(() => (roleAssigned ? '/manager/' + cleaningTab.value : endpoint))
const params = computed(
  () =>
    op('get', listPath.value)
      ?.parameters?.filter((p) => p.in === 'query')
      .map((p) => p.name) ?? [],
)
const searchParam = computed(() => ['search', 'q'].find((k) => params.value.includes(k)))
const displayRows = computed(() =>
  rows.value.filter((r) => base !== '/admin/managers' || r.role === 'MANAGER'),
)
const photo = computed(() => {
  const v = a.user?.avatar
  return imageURL(isRow(v) ? v.url : v) || '/images/placeholders/avatar-placeholder.svg'
})
const record = computed(() => detail.value ?? selected.value)
const recordId = computed(() => (record.value ? idOf(record.value) : ''))
function launch(form: Action) {
  if (supports(form.method, form.path)) action.value = form
  else p.toast('unsupported')
}
function addAction(list: Action[], v: Action) {
  if (supports(v.method, v.path)) list.push(v)
}
const actions = computed(() => {
  const r = record.value
  if (!r) return []
  const list: Action[] = [],
    id = recordId.value
  if (
    base === '/admin/submissions' &&
    r.status === 'PENDING' &&
    (!isRow(r.contributor) || r.contributor.id !== a.user?.id)
  ) {
    const path = '/admin/suggestions/:id/status'
    addAction(list, {
      title: 'approve',
      path,
      method: 'patch',
      id,
      fixed: { status: 'APPROVED' },
      keys: ['reviewNote', 'corrections'],
      images: Array.isArray(r.images) ? r.images.filter(isRow) : undefined,
      confirm: true,
    })
    addAction(list, {
      title: 'reject',
      path,
      method: 'patch',
      id,
      fixed: { status: 'REJECTED' },
      keys: ['rejectionReason', 'reason', 'reviewNote'],
      confirm: true,
    })
  }
  if (base === '/favorites')
    addAction(list, {
      title: 'remove',
      method: 'delete',
      path: '/me/favorites/:toiletId',
      id: String(r.toiletId ?? (isRow(r.toilet) ? r.toilet.id : '')),
      confirm: true,
    })
  if (base === '/my-reviews') {
    addAction(list, { title: 'edit', method: 'patch', path: '/reviews/:id', id, initial: r })
    addAction(list, { title: 'delete', method: 'delete', path: '/reviews/:id', id, confirm: true })
  }
  if (base === '/notifications' && !r.readAt)
    addAction(list, { title: 'markRead', path: '/me/notifications/:id/read', method: 'patch', id })
  if (['/admin/users', '/admin/managers'].includes(base))
    addAction(list, {
      title: 'role',
      path: '/admin/users/:id/role',
      method: 'patch',
      id,
      initial: r,
      confirm: true,
    })
  if (base === '/admin/toilets' || base === '/manager/toilets') {
    addAction(list, { title: 'edit', method: 'patch', path: base + '/:id', id, initial: r })
    if (admin && !r.archivedAt)
      addAction(list, { title: 'archive', method: 'delete', path: base + '/:id', id, confirm: true })
  }
  if (base === '/manager/toilets') {
    addAction(list, {
      title: 'cleaning',
      method: 'post',
      path: '/manager/toilets/:id/cleaning-logs',
      id,
    })
    addAction(list, {
      title: 'schedule',
      method: 'post',
      path: '/manager/toilets/:id/cleaning-schedules',
      id,
    })
  }
  if (roleAssigned && cleaningTab.value === 'cleaning-schedules') {
    addAction(list, {
      title: 'edit',
      method: 'patch',
      path: '/manager/cleaning-schedules/:id',
      id,
      initial: r,
    })
    addAction(list, {
      title: 'delete',
      method: 'delete',
      path: '/manager/cleaning-schedules/:id',
      id,
      confirm: true,
    })
  }
  if (base === '/admin/reports' || base === '/manager/reports')
    addAction(list, {
      title: 'status',
      path: base + '/:id/status',
      method: 'patch',
      id,
      initial: r,
      confirm: true,
    })
  if (base === '/admin/assignments')
    addAction(list, {
      title: 'remove',
      method: 'delete',
      path: '/admin/manager-assignments/:id',
      id,
      confirm: true,
    })
  if (base === '/admin/users' || base === '/admin/managers')
    addAction(list, {
      title: 'accountStatus',
      method: 'patch',
      path: '/admin/users/:id/status',
      id,
      initial: r,
      confirm: true,
    })
  if (base === '/admin/toilets' && r.archivedAt)
    addAction(list, {
      title: 'restore',
      method: 'post',
      path: '/admin/toilets/:id/restore',
      id,
      confirm: true,
    })
  if (base === '/admin/toilets' && r.isVerified === false)
    addAction(list, {
      title: 'verify',
      method: 'post',
      path: '/admin/toilets/:id/verify',
      id,
      confirm: true,
    })
  if (base === '/admin/reviews')
    addAction(list, { title: 'delete', method: 'delete', path: '/admin/reviews/:id', id, confirm: true })
  if (base === '/admin/reviews')
    addAction(list, {
      title: 'edit',
      path: '/admin/reviews/:id/moderation',
      method: 'patch',
      id,
      initial: r,
      confirm: true,
    })
  return list
})
async function readExtra(toiletId: string) {
  extra.value = []
  extraError.value = ''
  if (base !== '/manager/toilets') return
  for (const [key, suffix] of [
    ['schedule', 'cleaning-schedules'],
    ['cleaning', 'cleaning-logs'],
    ['reviews', 'reviews'],
  ]) {
    const ep = key === 'reviews' ? '/toilets/:id/reviews' : '/manager/toilets/:id/' + suffix
    if (supports('get', ep)) {
      try {
        const list = pageOf(await request('get', ep, { id: toiletId }))
        extra.value.push({ key, rows: list.items })
      } catch (e) {
        extraError.value = failure(e)
      }
    }
  }
  if (supports('get', '/manager/toilets/:id/qr')) {
    try {
      const v = unwrap(await request('get', '/manager/toilets/:id/qr', { id: toiletId }))
      if (
        isRow(v) &&
        typeof v.pngDataUrl === 'string' &&
        /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v.pngDataUrl)
      ) {
        const url = new URL(String(v.url))
        if (['http:', 'https:'].includes(url.protocol)) qr.value = { url: url.href, png: v.pngDataUrl }
      }
    } catch (e) {
      extraError.value = failure(e)
    }
  }
}
async function load(force = false, silent = false) {
  const current = ++version
  if (!silent) phase.value = 'loading'
  error.value = ''
  selected.value = undefined
  try {
    await discover(force)
    if (profile) await a.identify()
    else if (personal) {
      summaries.value = await Promise.all(
        sections.map(async (s) => {
          try {
            const result = await ownerOf(resources[s]).list(resources[s], { page: 1, limit: 3 })
            return { path: s, rows: result.items, error: '' }
          } catch (e) {
            return { path: s, rows: [], error: failure(e) }
          }
        }),
      )
      if (supports('get', '/me/summary')) {
        const summary = unwrap(await request('get', '/me/summary'))
        if (isRow(summary)) stats.value = summary
      }
    } else if (dashboard || title === 'analytics') {
      const r = unwrap(await request('get', path))
      if (!isRow(r)) throw new Error('incompatible')
      stats.value = r
      if (admin && dashboard && Array.isArray(r.recentPendingSuggestions))
        rows.value = r.recentPendingSuggestions.filter(isRow)
    } else if (create || title === 'changePassword' || title === 'settings') {
    } else if (id) {
      const r = unwrap(await request('get', detailPaths[base], { id }))
      if (!isRow(r)) throw new Error('incompatible')
      detail.value = r
      await readExtra(id)
    } else if (endpoint) {
      const query: Row = {
        page: page.value,
        limit: 15,
        role: base === '/admin/managers' ? 'MANAGER' : undefined,
        status: filter.value || undefined,
        archived: params.value.includes('archived') ? archived.value : undefined,
      }
      if (searchParam.value) query[searchParam.value] = q.value.trim() || undefined
      const result = await ownerOf(listPath.value).list(listPath.value, query)
      if (current !== version) return
      rows.value = result.items
      pages.value = result.pages
    } else throw new Error('unsupported')
    if (current === version) phase.value = 'ok'
  } catch (e) {
    if (current === version) {
      phase.value = 'error'
      error.value = failure(e)
    }
  }
}
watch([q, filter, archived, cleaningTab], () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (page.value === 1) void load()
    else page.value = 1
  }, 200)
})
if (base === '/admin/submissions')
  watch(
    () => route.query.status,
    (v) => {
      filter.value = typeof v === 'string' && ['PENDING', 'APPROVED', 'REJECTED'].includes(v) ? v : ''
    },
    { immediate: true },
  )
watch(page, () => load())
void load()
onBeforeUnmount(() => {
  version++
  clearTimeout(timer)
})
async function select(r: Row) {
  if (admin && dashboard) {
    await router.push('/admin/submissions/' + encodeURIComponent(idOf(r)))
    return
  }
  if (detailPaths[base]) {
    await router.push(base + '/' + encodeURIComponent(idOf(r)))
    return
  }
  const details = (
    {
      '/admin/users': '/admin/users/:id',
      '/admin/managers': '/admin/users/:id',
      '/admin/reports': '/admin/reports/:id',
      '/manager/reports': '/manager/reports/:id',
      '/my-reports': '/me/reports/:id',
    } as Record<string, string>
  )[base]
  if (details && supports('get', details)) {
    try {
      const payload = unwrap(await request('get', details, { id: idOf(r) }))
      if (!isRow(payload)) throw new Error('incompatible')
      selected.value = payload
    } catch (e) {
      p.toast(failure(e))
    }
  } else selected.value = r
}
async function saved() {
  const previous = action.value
  action.value = undefined
  if (previous) ownerOf(previous.path).invalidate()
  if (previous?.title === 'approve' || previous?.title === 'reject') {
    ownerOf('/admin').invalidate()
    ownerOf('/me/toilet-suggestions').invalidate()
    void publicData.load()
  }
  if (create) {
    await router.replace('/admin/toilets')
    return
  }
  await load()
}
async function upload(e: Event) {
  const input = e.target as HTMLInputElement,
    file = input.files?.[0]
  if (!file || uploading.value) return
  const ep = profile ? '/uploads/avatar' : '/uploads/toilets',
    field = uploadField(ep)
  if (!field) return
  uploading.value = true
  try {
    validatePhotos([file])
    const form = new FormData()
    form.append(field[0], file)
    if (!profile) form.append('toiletId', recordId.value)
    await request('post', ep, { body: form })
    p.toast('saved')
    await load()
  } catch (e) {
    p.toast(failure(e))
  } finally {
    uploading.value = false
    input.value = ''
  }
}
const profileAction = () =>
  launch({ title: 'edit', method: 'patch', path: '/me/profile', initial: a.user ?? {} })
const passwordAction = () =>
  launch({ title: 'changePassword', method: 'post', path: '/me/change-password' })
function reviewConflict() {
  action.value = undefined
  p.toast('conflict')
  void load()
}
</script>
<template>
  <component :is="layout" :title="title">
    <section class="stack min-w-0">
      <div class="section-head">
        <h1>{{ p.t(title) }}</h1>
        <button class="btn outline" @click="load(true)">
          <Icon name="rotate-ccw" :size="15" />
          {{ p.t('refresh') }}
        </button>
      </div>
      <StatePanel
        v-if="phase !== 'ok'"
        :phase="phase"
        :error="error"
        title="unavailable"
        retry
        @retry="load(true)"
      />
      <template v-else-if="profile || personal">
        <header class="row panel">
          <img class="profile-photo" :src="photo" :alt="p.t('avatar')" referrerpolicy="no-referrer" />
          <div>
            <small>{{ p.t(personal ? 'welcome' : 'profile') }}</small>
            <h2>{{ a.user?.fullName }}</h2>
            <p>{{ a.user?.email }}</p>
          </div>
          <template v-if="profile">
            <button class="btn outline" @click="profileAction">{{ p.t('edit') }}</button>
            <label v-if="uploadField('/uploads/avatar')" class="btn outline file-btn">
              {{ p.t('avatar') }}
              <input
                type="file"
                :disabled="uploading"
                accept="image/png,image/jpeg,image/webp"
                @change="upload"
              />
            </label>
            <button
              v-if="a.user?.avatar && supports('delete', '/uploads/avatar')"
              class="text-link"
              @click="
                launch({
                  title: 'removeAvatar',
                  method: 'delete',
                  path: '/uploads/avatar',
                  confirm: true,
                })
              "
            >
              {{ p.t('removeAvatar') }}
            </button>
            <RouterLink class="text-link" to="/change-password">{{ p.t('changePassword') }}</RouterLink>
          </template>
        </header>
        <template v-if="personal">
          <StatsPanel v-if="Object.keys(stats).length" :data="stats" />
          <section v-for="s in summaries" :key="s.path" class="panel stack">
            <RouterLink :to="s.path" class="text-link">
              {{ p.t(userNav.find((n) => n[1] === s.path)?.[0] ?? 'details') }}
              <Icon name="arrow-right" :size="15" />
            </RouterLink>
            <p v-if="s.error">{{ p.t(s.error) }}</p>
            <RecordTable
              v-else-if="s.rows.length"
              :rows="s.rows"
              :base="s.path"
              @select="router.push(s.path)"
            />
            <p v-else>{{ p.t('noRecords') }}</p>
          </section>
        </template>
      </template>
      <template v-else-if="dashboard || title === 'analytics'">
        <StatsPanel :data="stats" />
        <template v-if="rows.length">
          <h2>{{ p.t('submissions') }}</h2>
          <RecordTable :rows="rows" base="/admin/submissions" @select="select" />
        </template>
      </template>
      <div v-else-if="title === 'settings'" class="panel row">
        <button class="btn outline" @click="p.dark = !p.dark">{{ p.t('theme') }}</button>
        <button class="btn outline" @click="p.lang = p.lang === 'km' ? 'en' : 'km'">
          {{ p.t('language') }}
        </button>
        <RouterLink class="text-link" to="/profile">{{ p.t('profile') }}</RouterLink>
      </div>
      <div v-else-if="title === 'changePassword' || create" class="panel">
        <button
          class="btn primary"
          @click="
            create ? launch({ title: 'add', method: 'post', path: '/admin/toilets' }) : passwordAction()
          "
        >
          {{ p.t(create ? 'add' : 'changePassword') }}
        </button>
      </div>
      <template v-else-if="detail">
        <RecordDetail class="panel" :record="detail" facility @refresh="load(false, true)">
          <div class="row">
            <button
              v-for="act in actions"
              :key="act.title"
              :class="['btn', act.title === 'approve' ? 'primary' : 'outline']"
              @click="launch(act)"
            >
              {{ p.t(act.title) }}
            </button>
            <label
              v-if="base.endsWith('/toilets') && uploadField('/uploads/toilets')"
              class="btn outline file-btn"
            >
              {{ p.t('photos') }}
              <input
                type="file"
                :disabled="uploading"
                accept="image/jpeg,image/png,image/webp"
                @change="upload"
              />
            </label>
            <RouterLink
              v-if="base === '/my-submissions' && detail.status === 'REJECTED' && !detail.resubmissionId"
              :to="{ path: '/add-toilet', query: { from: id } }"
              class="text-link"
            >
              {{ p.t('resubmit') }}
            </RouterLink>
            <RouterLink
              v-if="detail.status === 'APPROVED' && detail.publishedToiletId"
              :to="'/toilets/' + encodeURIComponent(String(detail.publishedToiletId))"
              class="text-link"
            >
              {{ p.t('view') }}
            </RouterLink>
          </div>
          <FacilityPhotoActions
            v-if="base.endsWith('/toilets')"
            :record="detail"
            :base="base"
            @saved="load()"
          />
          <img
            v-if="base === '/my-submissions' && detail.status === 'PENDING'"
            src="/images/illustrations/waiting-approval.svg"
            :alt="p.t('pending')"
            width="110"
          />
        </RecordDetail>
      </template>
      <template v-else>
        <div class="toolbar">
          <button
            v-if="base === '/notifications' && supports('patch', '/me/notifications/read-all')"
            class="btn outline"
            @click="
              launch({
                title: 'markAllRead',
                method: 'patch',
                path: '/me/notifications/read-all',
                confirm: true,
              })
            "
          >
            {{ p.t('markAllRead') }}
          </button>
          <div v-if="roleAssigned" class="segmented">
            <button
              v-for="[tab, key] in [
                ['cleaning-logs', 'cleaning'],
                ['cleaning-schedules', 'schedule'],
              ]"
              :key="tab"
              :aria-pressed="cleaningTab === tab"
              @click="cleaningTab = tab"
            >
              {{ p.t(key) }}
            </button>
          </div>
          <label v-if="searchParam" class="searchbox">
            <Icon name="search" />
            <input v-model="q" :placeholder="p.t('search')" :aria-label="p.t('search')" />
          </label>
          <select
            v-if="base === '/admin/submissions' && params.includes('status')"
            v-model="filter"
            class="field"
            :aria-label="p.t('status')"
          >
            <option value="">{{ p.t('any') }}</option>
            <option v-for="s in ['PENDING', 'APPROVED', 'REJECTED']" :key="s" :value="s">
              {{ p.t(statusKey(s)) }}
            </option>
          </select>
          <select
            v-if="params.includes('archived')"
            v-model="archived"
            class="field"
            :aria-label="p.t('archived')"
          >
            <option v-for="v in ['exclude', 'include', 'only']" :value="v" :key="v">
              {{ p.t(v) }}
            </option>
          </select>
          <RouterLink v-if="base === '/admin/toilets'" class="btn primary" to="/admin/toilets/new">
            {{ p.t('add') }}
          </RouterLink>
          <button
            v-if="base === '/admin/assignments' && supports('post', endpoint)"
            class="btn primary"
            @click="launch({ title: 'assignments', path: endpoint, method: 'post', confirm: true })"
          >
            {{ p.t('assignments') }}
          </button>
        </div>
        <RecordTable v-if="displayRows.length" :rows="displayRows" :base="base" @select="select" />
        <StatePanel v-else title="noRecords" description="noRecords" />
        <div v-if="pages > 1" class="pager">
          <button :disabled="page <= 1" @click="page--">{{ p.t('previous') }}</button>
          {{ page }} / {{ pages }}
          <button :disabled="page >= pages" @click="page++">{{ p.t('next') }}</button>
        </div>
      </template>
      <div v-if="qr" class="panel stack">
        <h2>{{ p.t('feedbackLink') }}</h2>
        <img :src="qr.png" width="148" height="148" :alt="p.t('feedbackLink')" />
        <a class="text-link" :href="qr.url" target="_blank" rel="noopener noreferrer">
          {{ p.t('view') }}
        </a>
      </div>
      <div v-for="section in extra" :key="section.key" class="panel stack">
        <h2>{{ p.t(section.key) }}</h2>
        <p v-if="!section.rows.length">{{ p.t('noRecords') }}</p>
        <article v-for="r in section.rows" :key="idOf(r)">
          <strong>{{ p.date(String(r.cleanedAt ?? r.createdAt ?? '')) }}</strong>
          {{ r.notes ?? r.comment ?? r.startTime }}
        </article>
      </div>
      <p v-if="extraError" class="error">{{ p.t(extraError) }}</p>
    </section>
  </component>
  <AppModal v-if="selected && !action" :title="p.t('details')" @close="selected = undefined">
    <RecordDetail :record="selected" @refresh="load(false, true)">
      <div class="row">
        <button v-for="act in actions" :key="act.title" class="btn outline" @click="launch(act)">
          {{ p.t(act.title) }}
        </button>
        <RouterLink
          v-if="roleAssigned && isRow(selected.toilet)"
          :to="'/manager/toilets/' + encodeURIComponent(String(selected.toilet.id))"
          class="text-link"
        >
          {{ p.t('assigned') }}
        </RouterLink>
        <RouterLink
          v-if="base === '/favorites' && (selected.toiletId || isRow(selected.toilet))"
          :to="
            '/toilets/' +
            encodeURIComponent(
              String(selected.toiletId ?? (isRow(selected.toilet) ? selected.toilet.id : '')),
            )
          "
          class="text-link"
        >
          {{ p.t('view') }}
        </RouterLink>
      </div>
    </RecordDetail>
  </AppModal>
  <MutationForm
    v-if="action"
    v-bind="action"
    @close="action = undefined"
    @saved="saved"
    @conflict="reviewConflict"
  />
</template>
