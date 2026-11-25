import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from '../src/vendor/axios'
import {
  acceptTokens,
  api,
  checked,
  hasToken,
  prepare,
  request,
  resetSession,
  spec,
} from '../src/services/api'
import { useAccount } from '../src/stores/account'
import { authorized, intended } from '../src/router'
import type { Role } from '../src/types/api'
const answer = (config: InternalAxiosRequestConfig, data: unknown, status = 200) => ({
  config,
  data: { success: true, data },
  status,
  statusText: '',
  headers: new AxiosHeaders(),
})
const reject = (config: InternalAxiosRequestConfig, status: number) => {
  throw new AxiosError('failure', 'ERR_BAD_REQUEST', config, {}, answer(config, null, status))
}
beforeEach(() => {
  setActivePinia(createPinia())
  resetSession()
  checked.value = true
  spec.value = {
    paths: {
      '/auth/login': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: { properties: { email: {}, password: {} }, required: ['email', 'password'] },
              },
            },
          },
        },
      },
      '/auth/me': { get: {} },
      '/auth/refresh': { post: {} },
      '/me/favorites': { get: {} },
    },
  }
})
describe('authenticated requests', () => {
  it('uses the identity endpoint for role and never persists an access token', async () => {
    api.defaults.adapter = async (c) =>
      answer(
        c,
        c.url === '/auth/login'
          ? { accessToken: 'test-token', user: { role: 'ADMIN' } }
          : { id: 'u', role: 'USER' },
      )
    const a = useAccount()
    await a.login({ email: 'user@example.test', password: 'a' })
    expect(a.role).toBe('USER')
    expect(localStorage.getItem('accessToken')).toBeNull()
  })
  it('restores an HttpOnly-cookie session through refresh and me', async () => {
    const urls: string[] = []
    api.defaults.adapter = async (c) => {
      urls.push(String(c.url))
      return answer(c, c.url === '/auth/refresh' ? { accessToken: 'new' } : { id: 'm', role: 'MANAGER' })
    }
    const a = useAccount()
    await Promise.all([a.restore(), a.restore()])
    expect(urls).toEqual(['/auth/refresh', '/auth/me'])
    expect(a.role).toBe('MANAGER')
  })
  it('shares refresh between concurrent 401s and retries each only once', async () => {
    const first = vi.fn(),
      refresh = vi.fn(),
      again = vi.fn()
    acceptTokens({ accessToken: 'old' })
    api.defaults.adapter = async (c) => {
      if (c.url === '/auth/refresh') {
        refresh()
        expect(c.headers.get('X-CSRF-Protection')).toBe('1')
        await new Promise((r) => setTimeout(r, 10))
        return answer(c, { accessToken: 'new' })
      }
      if (c.headers.get('Authorization') === 'Bearer old') {
        first()
        return reject(c, 401)
      }
      again()
      return answer(c, [])
    }
    await Promise.all([request('get', '/me/favorites'), request('get', '/me/favorites')])
    expect(first).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(again).toHaveBeenCalledTimes(2)
  })
  it('clears an expired session on failed refresh', async () => {
    acceptTokens({ accessToken: 'old' })
    api.defaults.adapter = async (c) => reject(c, 401)
    await expect(request('get', '/me/favorites')).rejects.toBeTruthy()
    expect(hasToken()).toBe(false)
  })
  it('does not issue undocumented calls or accept extra role fields', async () => {
    const send = vi.fn()
    api.defaults.adapter = send
    await expect(request('post', '/absent')).rejects.toThrow('unsupported')
    expect(() => prepare('post', '/auth/login', { email: 'a', password: 'b', role: 'ADMIN' })).toThrow(
      'incompatible',
    )
    expect(send).not.toHaveBeenCalled()
  })
  it('drops stale responses after a session change', async () => {
    acceptTokens({ accessToken: 'old' })
    api.defaults.adapter = async (c) => {
      resetSession()
      return answer(c, [{ private: true }])
    }
    await expect(request('get', '/me/favorites')).rejects.toThrow('cancelled')
  })
})
describe('navigation', () => {
  it.each([
    ['USER', '/403'],
    ['MANAGER', '/403'],
    ['ADMIN', ''],
  ])('guards admin screens for %s', (role, target) =>
    expect(authorized({ requiresAuth: true, allowedRoles: ['ADMIN'] }, role as Role)).toBe(target),
  )
  it('redirects guests, preserves permitted return paths and rejects external destinations', () => {
    expect(authorized({ requiresAuth: true })).toBe('/login')
    expect(intended('/favorites', 'USER')).toBe('/favorites')
    expect(intended('/admin/dashboard', 'USER')).toBe('/')
    expect(intended('//example.org', 'USER')).toBe('/')
  })
})
describe('private resource storage', () => {
  it('requires authentication before a private request can reach the adapter', async () => {
    const send = vi.fn()
    api.defaults.adapter = send
    await expect(request('get', '/me/favorites')).rejects.toThrow('expired')
    expect(send).not.toHaveBeenCalled()
  })
  it('clears the previous account’s list synchronously', async () => {
    const { useFavorites } = await import('../src/stores/resources')
    acceptTokens({ accessToken: 'old' })
    api.defaults.adapter = async (c) => answer(c, [{ id: 'private-favorite' }])
    const s = useFavorites()
    await s.list('/me/favorites')
    expect(s.last?.items).toHaveLength(1)
    resetSession()
    expect(s.last).toBeUndefined()
  })
})
