import type { Method, Row } from '../types/api'
export type Action = {
  title: string
  method: Method
  path: string
  id?: string
  ids?: Record<string, string>
  initial?: Row
  fixed?: Row
  keys?: string[]
  confirm?: boolean
  images?: Row[]
}
export const resources: Record<string, string> = {
  '/my-submissions': '/me/toilet-suggestions',
  '/favorites': '/me/favorites',
  '/my-reviews': '/me/reviews',
  '/my-reports': '/me/reports',
  '/notifications': '/me/notifications',
  '/admin/submissions': '/admin/suggestions',
  '/admin/toilets': '/admin/toilets',
  '/admin/users': '/admin/users',
  '/admin/managers': '/admin/users',
  '/admin/assignments': '/admin/manager-assignments',
  '/admin/reviews': '/admin/reviews',
  '/admin/reports': '/admin/reports',
  '/manager/toilets': '/manager/toilets',
  '/manager/reports': '/manager/reports',
  '/manager/cleaning': '/manager/toilets',
}
export const detailPaths: Record<string, string> = {
  '/my-submissions': '/me/toilet-suggestions/:id',
  '/admin/submissions': '/admin/suggestions/:id',
  '/admin/toilets': '/admin/toilets/:id',
  '/manager/toilets': '/manager/toilets/:id',
}
export const sections = ['/my-submissions', '/favorites', '/my-reviews', '/my-reports', '/notifications']
