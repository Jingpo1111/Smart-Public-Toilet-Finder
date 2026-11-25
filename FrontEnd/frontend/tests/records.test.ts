import { describe, expect, it } from 'vitest'
import {
  distance,
  emptyFilters,
  filterToilets,
  imageURL,
  pageOf,
  point,
  publicToilet,
} from '../src/services/records'
import { fillPath, operation, resolveSchema } from '../src/services/contract'
import { validatePhotos } from '../src/services/upload'
const wc = {
  id: '1',
  name: 'Test fixture',
  address: 'A street',
  latitude: 11.5,
  longitude: 104.9,
  accessType: 'FREE',
  isVerified: true,
}
describe('public discovery', () => {
  it.each([
    { status: 'REJECTED' },
    { status: 'PENDING' },
    { archivedAt: '2026-01-01' },
    { isVerified: false },
  ])('drops private or archived records %o', (flags) =>
    expect(publicToilet({ ...wc, ...flags })).toBeNull(),
  )
  it('does not infer availability or accessibility from missing fields', () => {
    const r = publicToilet({ ...wc, status: 'OPEN' })!
    expect(r.open).toBeUndefined()
    expect(r.wheelchair).toBeUndefined()
    expect(filterToilets([r], { ...emptyFilters(), open: true })).toEqual([])
  })
  it('filters facility, price, rating, text and radius together', () => {
    const r = publicToilet({
      ...wc,
      averageRating: 4.4,
      facility: { wheelchairAccessible: true, hasSoap: true },
    })!
    const f = {
      ...emptyFilters(),
      q: 'STREET',
      access: 'FREE',
      rated: true,
      wheelchair: true,
      soap: true,
      radius: 1,
    }
    expect(filterToilets([r], f, [11.5, 104.9])).toEqual([r])
    expect(filterToilets([r], f, [12, 104])).toEqual([])
  })
  it('validates coordinates and computes great-circle distance', () => {
    expect(point('', null)).toBeUndefined()
    expect(point(91, 0)).toBeUndefined()
    expect(point('0', '0')).toEqual([0, 0])
    expect(distance([0, 0], [0, 1])).toBeCloseTo(111.195, 2)
  })
  it('limits photo URLs to http(s) and preserves genuine empty results', () => {
    expect(imageURL('javascript:void(0)')).toBe('')
    expect(imageURL('https://a:b@test.local/x')).toBe('')
    expect(pageOf({ data: [], meta: { total: 0, page: 1, totalPages: 1 } }).total).toBe(0)
    expect(() => pageOf({ success: true, data: {} })).toThrow('incompatible')
  })
  it('orders a cover before other unique gallery images and labels seed records', () => {
    const r = publicToilet({
      ...wc,
      isSampleData: true,
      images: [{ url: 'https://a.test/1' }, { url: 'https://a.test/2', isCover: true }],
    })!
    expect(r.images).toEqual(['https://a.test/2', 'https://a.test/1'])
    expect(r.sample).toBe(true)
  })
})
describe('contracts and uploads', () => {
  it('matches only declared verbs and paths with an optional global prefix', () => {
    const doc = { paths: { '/api/toilets/{id}': { get: {} } } }
    expect(operation(doc, 'get', '/toilets/:id')).toEqual({})
    expect(operation(doc, 'post', '/toilets/:id')).toBeUndefined()
  })
  it('resolves referenced and composed request schemas', () => {
    const doc = {
      paths: {},
      components: {
        schemas: { Base: { properties: { name: { type: 'string' } }, required: ['name'] } },
      },
    }
    expect(
      resolveSchema(doc, {
        allOf: [{ $ref: '#/components/schemas/Base' }],
        properties: { street: { type: 'string' } },
      }).properties,
    ).toHaveProperty('name')
  })
  it('encodes identifiers and refuses external paths and traversal', () => {
    expect(fillPath('/toilets/:id', 'a/b')).toBe('/toilets/a%2Fb')
    for (const path of ['//external', 'https://external', '/a/../b'])
      expect(() => fillPath(path)).toThrow()
    expect(() => fillPath('/me/:id', '..')).toThrow()
  })
  it('validates count, MIME type and size before uploading', () => {
    const good = new File(['a'], 'a.webp', { type: 'image/webp' })
    expect(() => validatePhotos([good], 4)).not.toThrow()
    expect(() => validatePhotos([good], 5)).toThrow()
    expect(() => validatePhotos([new File(['a'], 'a.svg', { type: 'image/svg+xml' })])).toThrow()
    expect(() =>
      validatePhotos([new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' })]),
    ).toThrow()
  })
})
