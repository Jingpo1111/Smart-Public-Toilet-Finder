// Store the API shape used by the application without examples, servers or credentials.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const input = process.argv[2] ?? '../../BackEnd/backend/openapi.json'
const document = JSON.parse(await readFile(resolve(input), 'utf8'))
if (!document.openapi || !document.paths || !document.components?.schemas)
  throw new Error('Expected a NestJS OpenAPI export.')
const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]))
const refs = new Set()
function schema(s = {}) {
  const result = pick(s, [
    '$ref',
    'type',
    'format',
    'enum',
    'required',
    'nullable',
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
  ])
  if (s.$ref) refs.add(s.$ref.split('/').pop())
  if (s.items) result.items = schema(s.items)
  if (s.properties)
    result.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, schema(v)]))
  if (s.allOf) result.allOf = s.allOf.map(schema)
  return result
}
const paths = {}
for (const [path, ops] of Object.entries(document.paths)) {
  const methods = {}
  for (const [method, op] of Object.entries(ops)) {
    if (!['get', 'post', 'patch', 'delete'].includes(method)) continue
    const out = {}
    const params = [...(ops.parameters ?? []), ...(op.parameters ?? [])].filter((p) => p.in === 'query')
    if (params.length)
      out.parameters = params.map((p) => ({
        ...pick(p, ['in', 'name', 'required']),
        schema: schema(p.schema),
      }))
    if (op.requestBody?.content)
      out.requestBody = {
        content: Object.fromEntries(
          Object.entries(op.requestBody.content).map(([k, v]) => [k, { schema: schema(v.schema) }]),
        ),
      }
    methods[method] = out
  }
  if (Object.keys(methods).length) paths[path] = methods
}
const schemas = {}
for (const key of refs) {
  const entry = document.components.schemas[key]
  if (!entry) throw new Error('Missing DTO ' + key)
  schemas[key] = schema(entry)
}
await writeFile(
  new URL('../src/services/openapi.generated.json', import.meta.url),
  JSON.stringify({ version: document.info?.version, paths, components: { schemas } }, null, 2) + '\n',
)
console.log(
  'Synchronized ' + Object.keys(paths).length + ' paths and ' + Object.keys(schemas).length + ' DTOs.',
)
