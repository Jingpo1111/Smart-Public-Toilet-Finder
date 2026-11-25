import { bodySchema, isRow, request, supports, unwrap } from './api'
import type { Photo } from '../types/api'
export function validatePhotos(files: File[], count = 0) {
  if (
    files.length + count > 5 ||
    files.some(
      (f) =>
        !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) ||
        !f.size ||
        f.size > 5 * 1024 * 1024,
    )
  )
    throw new Error('photoLimits')
}
export function uploadField(path: string) {
  const props = bodySchema('post', path, 'multipart/form-data').properties ?? {}
  return Object.entries(props).find(([, s]) => s.format === 'binary' || s.items?.format === 'binary')
}
export async function uploadPhotos(
  path: string,
  photos: Photo[],
  progress: (n: number) => void,
  existing = new Map<File, string>(),
) {
  const field = uploadField(path)
  if (!supports('post', path) || !field) throw new Error('unsupported')
  validatePhotos(photos.map((p) => p.file))
  const required = bodySchema('post', path, 'multipart/form-data').required ?? []
  if (required.some((k) => k !== field[0])) throw new Error('incompatible')
  for (const [index, photo] of photos.entries()) {
    if (existing.has(photo.file)) continue
    const form = new FormData()
    form.append(field[0], photo.file)
    const value = unwrap(
      await request('post', path, {
        body: form,
        progress: (n) => progress(Math.round(((index + n / 100) / photos.length) * 100)),
      }),
    )
    const item = Array.isArray(value) ? value[0] : value
    const id = isRow(item) ? (item.id ?? item.imageId) : undefined
    if (typeof id !== 'string' && typeof id !== 'number') throw new Error('incompatible')
    existing.set(photo.file, String(id))
  }
  return photos.map((p) => existing.get(p.file)!)
}
