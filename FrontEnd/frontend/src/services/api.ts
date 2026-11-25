import { ref, shallowRef } from 'vue'
import axios, { AxiosHeaders, type InternalAxiosRequestConfig } from '../vendor/axios'
import type { Method, Row, Spec } from '../types/api'
import bundledContract from './openapi.generated.json'
import { fillPath, operation, resolveSchema } from './contract'

export const baseURL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const cookieAuth = import.meta.env.VITE_COOKIE_AUTH !== 'false'
export const api = axios.create({ baseURL, timeout: 15000, headers: { Accept: 'application/json' } })
export const spec = shallowRef<Spec | null>(null)
export const checked = ref(false)
let discovery: Promise<void> | undefined
export function discover(force = false) {
  if (discovery) return discovery
  if (checked.value && !force) return Promise.resolve()
  if (import.meta.env.VITE_API_CONTRACT === 'bundled') {
    spec.value = bundledContract
    checked.value = true
    return Promise.resolve()
  }
  discovery = axios
    .get(import.meta.env.VITE_OPENAPI_URL || baseURL + '/docs-json', {
      timeout: 4500,
      withCredentials: false,
    })
    .then(({ data }) => {
      spec.value = data?.paths && typeof data.paths === 'object' ? data : null
    })
    .catch((e) => {
      spec.value =
        axios.isAxiosError(e) && e.response?.status === 404 && !import.meta.env.VITE_OPENAPI_URL
          ? bundledContract
          : null
    })
    .finally(() => {
      checked.value = true
      discovery = undefined
    })
  return discovery
}
export const supports = (method: Method, path: string) => !!operation(spec.value, method, path)
export const op = (method: Method, path: string) => operation(spec.value, method, path)
export function bodySchema(method: Method, path: string, media = 'application/json') {
  return resolveSchema(spec.value, op(method, path)?.requestBody?.content?.[media]?.schema)
}
export function isRow(value: unknown): value is Row {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
export function unwrap(value: unknown): unknown {
  return isRow(value) && 'data' in value ? value.data : value
}
export function failure(e: unknown): string {
  if (!axios.isAxiosError(e))
    return e instanceof Error &&
      [
        'unsupported',
        'incompatible',
        'expired',
        'cancelled',
        'networkError',
        'photoLimits',
        'invalid',
      ].includes(e.message)
      ? e.message
      : 'requestError'
  return (
    (
      {
        400: 'invalid',
        401: 'expired',
        403: 'forbidden',
        404: 'missing',
        409: 'conflict',
        422: 'invalid',
        429: 'rateLimit',
      } as Record<number, string>
    )[e.response?.status ?? 0] ?? (e.response ? 'serverError' : 'networkError')
  )
}
type Config = InternalAxiosRequestConfig & { authenticated?: boolean; retried?: boolean; epoch?: number }
let token = '',
  refreshToken = '',
  epoch = 0
export const sessionVersion = ref(0)
let refreshFlight: Promise<void> | undefined
export function resetSession() {
  const signedIn = !!token
  token = ''
  refreshToken = ''
  epoch++
  if (signedIn) sessionVersion.value++
  refreshFlight = undefined
}
export function acceptTokens(data: unknown) {
  const record = unwrap(data)
  if (!isRow(record) || typeof record.accessToken !== 'string' || !record.accessToken)
    throw new Error('incompatible')
  token = record.accessToken
  if (typeof record.refreshToken === 'string') refreshToken = record.refreshToken
}
export const hasToken = () => !!token
export const canRestore = () => cookieAuth
export async function refresh() {
  if (refreshFlight) return refreshFlight
  if (!supports('post', '/auth/refresh') || (!cookieAuth && !refreshToken)) throw new Error('expired')
  const version = epoch
  const body = refreshToken ? prepare('post', '/auth/refresh', { refreshToken }) : undefined
  const flight = api
    .post('/auth/refresh', body, { withCredentials: cookieAuth })
    .then(({ data }) => {
      if (version !== epoch) throw new Error('cancelled')
      acceptTokens(data)
    })
    .catch((e) => {
      if (version === epoch) resetSession()
      throw e
    })
    .finally(() => {
      if (refreshFlight === flight) refreshFlight = undefined
    })
  refreshFlight = flight
  return flight
}
api.interceptors.request.use((config: Config) => {
  if (config.withCredentials && config.url?.startsWith('/auth/'))
    config.headers.set('X-CSRF-Protection', '1')
  if (config.authenticated && token) {
    config.headers.set('Authorization', 'Bearer ' + token)
    config.epoch ??= epoch
  }
  return config
})
api.interceptors.response.use(
  (response) => {
    const config = response.config as Config
    if (config.authenticated && config.epoch !== epoch) throw new Error('cancelled')
    return response
  },
  async (e) => {
    const config = e.config as Config | undefined
    if (e.response?.status !== 401 || !config?.authenticated || config.epoch !== epoch) throw e
    if (config.retried || config.url === '/auth/logout') {
      resetSession()
      throw e
    }
    config.retried = true
    if (token && config.headers.get('Authorization') !== 'Bearer ' + token) return api.request(config)
    try {
      await refresh()
    } catch (error) {
      if (epoch === config.epoch) resetSession()
      throw error
    }
    return api.request(config)
  },
)
// Reject undocumented fields instead of discarding a user's input during a mutation.
export function prepare(method: Method, path: string, values: Row, media = 'application/json'): Row {
  const schema = bodySchema(method, path, media)
  const body = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined && v !== ''))
  if (
    Object.keys(body).some((k) => !Object.hasOwn(schema.properties ?? {}, k)) ||
    schema.required?.some((k) => !(k in body))
  )
    throw new Error('incompatible')
  return body
}
export interface Options {
  id?: string
  ids?: Record<string, string>
  params?: Row
  body?: Row | FormData
  auth?: boolean
  signal?: AbortSignal
  progress?: (n: number) => void
}
export async function request(method: Method, path: string, options: Options = {}): Promise<unknown> {
  await discover()
  const endpoint = op(method, path)
  if (!endpoint) throw new Error(spec.value ? 'unsupported' : 'networkError')
  const query = Object.fromEntries(
    Object.entries(options.params ?? {}).filter(
      ([k, v]) => v !== undefined && endpoint.parameters?.some((p) => p.in === 'query' && p.name === k),
    ),
  )
  if (endpoint.parameters?.some((p) => p.required && p.in === 'query' && !(p.name in query)))
    throw new Error('incompatible')
  const auth =
    options.auth ??
    !(
      (path.startsWith('/auth/') && !['/auth/me', '/auth/logout'].includes(path)) ||
      (method === 'get' && (path === '/health' || path.startsWith('/toilets')))
    )
  if (auth && !token) throw new Error('expired')
  const isForm = options.body instanceof FormData
  const config = {
    method,
    url: fillPath(path, options.id, options.ids),
    params: query,
    data: isForm ? options.body : options.body ? prepare(method, path, options.body as Row) : undefined,
    headers: new AxiosHeaders(),
    authenticated: auth,
    epoch,
    withCredentials: cookieAuth && (path.startsWith('/auth/') || path === '/me/change-password'),
    signal: options.signal,
    onUploadProgress: options.progress
      ? (event: { progress?: number }) => options.progress!(Math.round((event.progress ?? 0) * 100))
      : undefined,
  }
  const { data } = await api.request(config)
  if (path === '/me/change-password') acceptTokens(data)
  return data
}
export async function logoutRequest() {
  try {
    if (supports('post', '/auth/logout'))
      await request('post', '/auth/logout', {
        body:
          refreshToken && bodySchema('post', '/auth/logout').properties?.refreshToken
            ? { refreshToken }
            : undefined,
      })
  } finally {
    resetSession()
  }
}
