import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { AxiosHeaders } from '../src/vendor/axios'
import { acceptTokens, api, checked, spec } from '../src/services/api'
import { usePrefs } from '../src/stores/preferences'
import { useDiscovery } from '../src/stores/discovery'
import { uploadPhotos } from '../src/services/upload'
import { type Photo, type Row, type Schema } from '../src/types/api'
import en from '../src/locales/en.json'
import km from '../src/locales/km.json'
import PublicLayout from '../src/layouts/PublicLayout.vue'
import { useAccount } from '../src/stores/account'
import HomeView from '../src/views/HomeView.vue'
import ExploreView from '../src/views/ExploreView.vue'
import ImageUploader from '../src/components/ImageUploader.vue'
import AddToiletView from '../src/views/AddToiletView.vue'
import WorkspaceView from '../src/views/WorkspaceView.vue'
import RegisterView from '../src/views/auth/RegisterView.vue'
import ToiletCard from '../src/components/ToiletCard.vue'
import { publicToilet } from '../src/services/records'
const pinia = () => setActivePinia(createPinia())
const router = () =>
  createRouter({
    history: createMemoryHistory(),
    routes: [
      '/',
      '/explore',
      '/login',
      '/register',
      '/my-submissions',
      '/add-toilet',
      '/admin/submissions/:id',
      '/:pathMatch(.*)*',
    ].map((path) => ({ path, component: { template: '<div/>' }, meta: { title: 'submissions' } })),
  })
const wrappers: VueWrapper[] = []
const paths = (props: Record<string, Schema>, required: string[] = []) => ({
  requestBody: { content: { 'application/json': { schema: { properties: props, required } } } },
})
const fixture = {
  id: 'sample',
  name: 'Test only',
  address: 'Test street',
  isVerified: true,
  latitude: 11.56,
  longitude: 104.93,
}
const stubs = { MapView: true }
function respond(handler: (method: string, path: string, payload: unknown) => unknown) {
  api.defaults.adapter = async (config) => {
    const raw = config.data
    const data = handler(
      config.method ?? '',
      config.url ?? '',
      typeof raw === 'string' ? JSON.parse(raw) : raw,
    )
    return {
      data: { success: true, data },
      config,
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
    }
  }
}
beforeEach(() => {
  checked.value = true
  spec.value = { paths: { '/toilets': { get: {} } } }
  vi.stubGlobal('scrollTo', vi.fn())
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true
    },
  })
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false
    },
  })
  URL.createObjectURL = vi.fn(() => 'blob:test-' + Math.random())
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('public pages and preferences', () => {
  it('shows one navigation: account actions pop up, site links live in the navbar and bottom bar', async () => {
    const store = pinia()
    useAccount(store).user = { id: 'manager', role: 'MANAGER' }
    const r = router()
    await r.push('/')
    const w = mount(PublicLayout, { attachTo: document.body, global: { plugins: [store, r] } })
    wrappers.push(w)
    // No hamburger popup: it duplicated the bottom bar.
    expect(w.find('button[aria-controls="navigation-links"]').exists()).toBe(false)
    expect(w.find('#navigation-links').exists()).toBe(false)
    const links = (selector: string) => w.findAll(selector + ' a').map((link) => link.attributes('href'))
    expect(links('.desktop-nav')).toEqual(['/', '/explore', '/add-toilet', '/about'])
    expect(links('.bottomnav')).toEqual(['/', '/explore', '/add-toilet', '/about'])

    const account = w.get('button[aria-controls="account-links"]')
    const actions = w.get('#account-links')
    expect(actions.isVisible()).toBe(false)
    await account.trigger('click')
    expect(actions.isVisible()).toBe(true)
    expect(actions.findAll('a').map((link) => link.attributes('href'))).toEqual([
      '/manager/dashboard', '/notifications', '/manager/profile',
    ])
    expect(actions.get('button').text()).toBe(en.logout)

    await actions.get('a').trigger('keydown', { key: 'Escape' })
    expect(account.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(account.element)

    await account.trigger('click')
    await w.get('main').trigger('pointerdown')
    expect(account.attributes('aria-expanded')).toBe('false')
  })
  it('keeps translations in sync and persists theme and language', async () => {
    pinia()
    const prefs = usePrefs()
    expect(Object.keys(en).sort()).toEqual(Object.keys(km).sort())
    expect(Object.values(km).every((v) => v.trim())).toBe(true)
    prefs.lang = 'km'
    prefs.dark = true
    await flushPromises()
    expect(document.documentElement.lang).toBe('km')
    expect(localStorage.getItem('tg-theme')).toBe('dark')
    expect(prefs.t('free')).toBe(km.free)
  })
  it('searches through the real router and renders confirmed empty results', async () => {
    const r = router()
    await r.push('/')
    respond(() => [])
    const w = mount(HomeView, { global: { plugins: [pinia(), r] } })
    wrappers.push(w)
    await flushPromises()
    expect(w.text()).toContain(en.nonePublished)
    await w.get('input[type=search]').setValue('Riverside')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(r.currentRoute.value.fullPath).toBe('/explore?q=Riverside')
  })
  it('keeps the Users search field focused when filtered results arrive', async () => {
    const r = router()
    await r.push('/admin/users')
    spec.value!.paths['/admin/users'] = {
      get: { parameters: [{ in: 'query', name: 'search' }] },
    }
    acceptTokens({ accessToken: 'test' })
    const list = vi.fn(() => [])
    respond(list)
    const w = mount(WorkspaceView, {
      attachTo: document.body,
      global: { plugins: [pinia(), r] },
    })
    wrappers.push(w)
    await flushPromises()
    const input = w.get<HTMLInputElement>('.searchbox input[type=search]')
    input.element.focus()
    await input.setValue('Sokha')
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    await flushPromises()
    expect(document.activeElement).toBe(input.element)
    expect(input.element.value).toBe('Sokha')
  })
  it('requests GPS only on user action and preserves manual search after denial', async () => {
    pinia()
    const get = vi.fn((_ok: unknown, deny: (e: Error) => void) => deny(new Error('denied')))
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: get },
    })
    const s = useDiscovery()
    expect(get).not.toHaveBeenCalled()
    await expect(s.locate()).rejects.toThrow('gpsDenied')
    expect(s.origin).toBeUndefined()
    expect(s.gpsBusy).toBe(false)
  })
  it('keeps the search term when clearing filters and can reset an empty search', async () => {
    const r = router()
    await r.push('/explore?q=Riverside&category=free')
    respond(() => [])
    const w = mount(ExploreView, { global: { plugins: [pinia(), r], stubs } })
    wrappers.push(w)
    await flushPromises()
    await w.get('.toolbar button').trigger('click')
    const dialog = document.querySelector('dialog')!
    const clear = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === en.clear)!
    clear.click()
    dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    const input = w.get<HTMLInputElement>('input[type=search]')
    expect(input.element.value).toBe('Riverside')
    expect(w.get('.toolbar button').text()).toBe(en.filters)
    await w.findAll('button').find(b => b.text() === en.resetSearch)!.trigger('click')
    expect(input.element.value).toBe('')
  })
  it('labels missing facility photos and does not infer open-now', async () => {
    const r = router()
    await r.push('/')
    const w = mount(ToiletCard, {
      props: { item: publicToilet(fixture)! },
      global: { plugins: [pinia(), r] },
    })
    wrappers.push(w)
    expect(w.text()).toContain(en.photoMissing)
    expect(w.text()).not.toContain(en.open)
  })
})
describe('photos and submission', () => {
  it('previews, reorders and releases local images', async () => {
    const w = mount(ImageUploader, {
      props: { modelValue: [], 'onUpdate:modelValue': (v: Photo[]) => w.setProps({ modelValue: v }) },
      global: { plugins: [pinia()] },
    })
    wrappers.push(w)
    const input = w.get('input[type=file]').element
    Object.defineProperty(input, 'files', {
      value: [
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
      ],
    })
    await w.get('input[type=file]').trigger('change')
    await flushPromises()
    expect(w.findAll('.previews img')).toHaveLength(2)
    await w
      .findAll('.previews button')
      .find((b) => b.text() === en.setCover)!
      .trigger('click')
    expect(w.find('.previews img').attributes('alt')).toBe('b.jpg')
    await w
      .findAll('.previews button')
      .find((b) => b.text() === en.remove)!
      .trigger('click')
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })
  it('reuses successful private upload IDs on retry', async () => {
    spec.value!.paths['/uploads/suggestions'] = {
      post: {
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: { properties: { files: { type: 'array', items: { format: 'binary' } } } },
            },
          },
        },
      },
    }
    acceptTokens({ accessToken: 'test' })
    let count = 0
    respond(() => {
      count++
      if (count === 2) throw new Error('failed')
      return [{ id: 'upload-' + count }]
    })
    const photos = ['a', 'b'].map((s) => ({
        file: new File([s], s + '.jpg', { type: 'image/jpeg' }),
        url: '',
      })),
      cache = new Map<File, string>()
    await expect(uploadPhotos('/uploads/suggestions', photos, () => {}, cache)).rejects.toThrow()
    expect(await uploadPhotos('/uploads/suggestions', photos, () => {}, cache)).toEqual([
      'upload-1',
      'upload-3',
    ])
    expect(count).toBe(3)
  })
  it('submits a private pending suggestion without posting status or publishing a toilet', async () => {
    const r = router()
    await r.push('/add-toilet')
    spec.value!.paths['/toilet-suggestions'] = {
      post: paths(
        Object.fromEntries(
          ['name', 'address', 'province', 'latitude', 'longitude', 'accessType', 'facilities'].map(
            (k) => [k, {}],
          ),
        ),
        ['name', 'address', 'latitude', 'longitude'],
      ),
    }
    acceptTokens({ accessToken: 'test' })
    const handler = vi.fn(() => ({ id: 's', status: 'PENDING' }))
    respond(handler)
    const w = mount(AddToiletView, { global: { plugins: [pinia(), r], stubs } })
    wrappers.push(w)
    await flushPromises()
    await w.findAll('input')[0].setValue('Test only')
    await w.findAll('input')[1].setValue('Test street')
    await w.get('form').trigger('submit')
    await w.findAll('input[type=number]')[0].setValue('11.55')
    await w.findAll('input[type=number]')[1].setValue('104.92')
    await w.get('.steps button').trigger('click')
    expect(w.get<HTMLInputElement>('input').element.value).toBe('Test only')
    await w.get('form').trigger('submit')
    expect(w.get<HTMLInputElement>('input[type=number]').element.value).toBe('11.55')
    await w.get('form').trigger('submit')
    await w.get('form').trigger('submit')
    await w.get('form').trigger('submit')
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(w.text()).toContain(en.submitted)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler.mock.calls[0]).toEqual([
      'post',
      '/toilet-suggestions',
      {
        name: 'Test only',
        address: 'Test street',
        province: 'Phnom Penh',
        latitude: 11.55,
        longitude: 104.92,
        accessType: 'UNKNOWN',
      },
    ])
  })
})
describe('accounts and approval screens', () => {
  it('registers with only allowed fields and retrieves the current account', async () => {
    const r = router()
    await r.push('/register')
    spec.value!.paths['/auth/register'] = { post: paths({ email: {}, password: {}, fullName: {} }) }
    spec.value!.paths['/auth/me'] = { get: {} }
    const send = vi.fn((_m: string, url: string) =>
      url === '/auth/register' ? { accessToken: 'session' } : { id: 'user', role: 'USER' },
    )
    respond(send)
    const w = mount(RegisterView, { global: { plugins: [pinia(), r] } })
    wrappers.push(w)
    const inputs = w.findAll('input')
    for (const [i, value] of [
      'Test User',
      'user@example.test',
      'StrongPass123',
      'StrongPass123',
    ].entries())
      await inputs[i].setValue(value)
    await w.get('form').trigger('submit')
    await flushPromises()
    expect(send).toHaveBeenCalledWith('post', '/auth/register', {
      fullName: 'Test User',
      email: 'user@example.test',
      password: 'StrongPass123',
    })
    expect(r.currentRoute.value.path).toBe('/')
  })
  it.each(['APPROVED', 'REJECTED'])(
    'confirms %s through the API and reloads the reviewed record',
    async (target) => {
      const r = router()
      await r.push('/admin/submissions/s')
      let status = 'PENDING'
      const ep = '/admin/suggestions/{id}'
      spec.value!.paths[ep] = { get: {} }
      spec.value!.paths[ep + '/status'] = {
        patch: paths({ status: {}, rejectionReason: { type: 'string' } }),
      }
      acceptTokens({ accessToken: 'test' })
      const send = vi.fn((m: string, url: string, body: unknown) => {
        if (m === 'patch') {
          status = String((body as Row).status)
          return { status }
        }
        if (url === '/toilets') return []
        return { ...fixture, id: 's', status }
      })
      respond(send)
      const w = mount(WorkspaceView, {
        attachTo: document.body,
        global: { plugins: [pinia(), r], stubs },
      })
      wrappers.push(w)
      await flushPromises()
      await w
        .findAll('button')
        .find((b) => b.text() === (target === 'APPROVED' ? en.approve : en.reject))!
        .trigger('click')
      const form = document.querySelector('dialog form')!
      if (target === 'REJECTED') {
        const text = form.querySelector('textarea')!
        expect(text.required).toBe(true)
        text.value = 'Duplicate'
        text.dispatchEvent(new Event('input', { bubbles: true }))
      }
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flushPromises()
      expect(status).toBe('PENDING')
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flushPromises()
      expect(status).toBe(target)
      expect(send).toHaveBeenCalledWith(
        'patch',
        '/admin/suggestions/s/status',
        target === 'REJECTED' ? { status: target, rejectionReason: 'Duplicate' } : { status: target },
      )
      expect(w.find('.badge').text()).toBe(target === 'APPROVED' ? en.approved : en.rejected)
    },
  )
})
