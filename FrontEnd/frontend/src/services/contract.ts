import type { Method, Operation, Schema, Spec } from '../types/api'
export function operation(spec: Spec | null, method: Method, template: string): Operation | undefined {
  // Nest may export the global prefix as part of every path.
  const pattern = template.replace(/:[\w]+/g, '{}')
  for (const [path, methods] of Object.entries(spec?.paths ?? {})) {
    const normalized = path.replace(/\{[^}]+\}/g, '{}')
    if (normalized === pattern || normalized === '/api' + pattern) return methods[method]
  }
}
export function resolveSchema(spec: Spec | null, input?: Schema, depth = 0): Schema {
  if (!input || depth > 12) return {}
  if (input.$ref)
    return resolveSchema(spec, spec?.components?.schemas?.[input.$ref.split('/').pop() ?? ''], depth + 1)
  if (!input.allOf) return input
  const parts = [...input.allOf.map((s) => resolveSchema(spec, s, depth + 1)), input]
  return {
    ...input,
    properties: Object.assign({}, ...parts.map((s) => s.properties)),
    required: [...new Set(parts.flatMap((s) => s.required ?? []))],
  }
}
export function fillPath(template: string, id?: string, ids: Record<string, string> = {}) {
  if (!/^\/(?!\/)[\w/:{}-]+$/.test(template)) throw new Error('unsupported')
  const single = (template.match(/:[\w]+/g) ?? []).length === 1
  return template.replace(/:([\w]+)/g, (_segment, key: string) => {
    const value = ids[key] ?? (single || key === 'id' ? id : undefined)
    if (!value || value === '.' || value === '..') throw new Error('unsupported')
    return encodeURIComponent(value)
  })
}
