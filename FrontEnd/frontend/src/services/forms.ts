import { resolveSchema } from './contract'
import { isRow, spec } from './api'
import type { Schema } from '../types/api'
export const labels: Record<string, string> = {
  reason: 'reason',
  rejectionReason: 'reason',
  rating: 'stars',
  cleanlinessRating: 'cleanliness',
  hasWater: 'water',
  hasSoap: 'soap',
  babyChanging: 'baby',
  wheelchairAccessible: 'accessible',
  accessType: 'access',
  priceKhr: 'price',
  openingHours: 'hours',
  imageIds: 'photos',
  status: 'status',
  archiveReason: 'notes',
  preferredLanguage: 'language',
}
// Nest reflects nullable union types as Object. These DTO fields have explicit validators in the backend.
export function fieldSchema(input: Schema, key: string) {
  const s = resolveSchema(spec.value, input)
  if (s.type !== 'object' || s.properties) return s
  if (
    [
      'hasWater',
      'hasSoap',
      'wheelchairAccessible',
      'babyChanging',
      'hasToiletPaper',
      'hasHandDryer',
      'isGenderNeutral',
    ].includes(key)
  )
    return { ...s, type: 'boolean' }
  if (key === 'priceKhr') return { ...s, type: 'integer' }
  return { ...s, type: 'string' }
}
export function valueFor(input: Schema, value: unknown, key = ''): unknown {
  const schema = fieldSchema(input, key)
  if (value === null && schema.nullable) return null
  if (value == null || value === '') return undefined
  if (schema.properties && isRow(value)) {
    const entries = Object.entries(schema.properties)
      .map(([k, s]) => [k, valueFor(s, value[k], k)])
      .filter(([, v]) => v !== undefined)
    return entries.length ? Object.fromEntries(entries) : undefined
  }
  if (schema.type === 'array' && Array.isArray(value))
    return value.map((v) => valueFor(schema.items ?? {}, v)).filter((v) => v !== undefined)
  if (schema.type === 'integer' || schema.type === 'number') return Number(value)
  if (schema.type === 'boolean') return value === true || value === 'true'
  return typeof value === 'string' && !key.toLowerCase().includes('password') ? value.trim() : value
}
