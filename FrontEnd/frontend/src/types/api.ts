export type Row = Record<string, unknown>
export type Role = 'USER' | 'MANAGER' | 'ADMIN'
export type Method = 'get' | 'post' | 'patch' | 'delete'
export type Point = [number, number]
export interface Page<T> {
  items: T[]
  page: number
  pages: number
  total?: number
}
export interface Toilet {
  id: string
  name: string
  nameKm: string
  address: string
  description: string
  descriptionKm: string
  point?: Point
  access: string
  price?: number
  rating?: number
  cleanliness?: number
  open?: boolean
  status: string
  verifiedAt: string
  images: string[]
  water?: boolean
  soap?: boolean
  wheelchair?: boolean
  baby?: boolean
  hours: { day: number; opens: string; closes: string; nextDay: boolean }[]
  district: string
  sample: boolean
}
export interface Photo {
  file: File
  url: string
}
export interface Schema {
  $ref?: string
  type?: string
  format?: string
  enum?: string[]
  required?: string[]
  items?: Schema
  properties?: Record<string, Schema>
  allOf?: Schema[]
  nullable?: boolean
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
}
export interface Operation {
  parameters?: { name: string; in: string; required?: boolean; schema?: Schema }[]
  requestBody?: { content?: Record<string, { schema?: Schema }> }
}
export interface Spec {
  paths: Record<string, Partial<Record<Method, Operation>>>
  components?: { schemas?: Record<string, Schema> }
}
