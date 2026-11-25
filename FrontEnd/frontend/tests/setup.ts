import { beforeEach, vi } from 'vitest'
beforeEach(() => {
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, v: string) => items.set(key, v),
    removeItem: (key: string) => items.delete(key),
    clear: () => items.clear(),
  })
})
