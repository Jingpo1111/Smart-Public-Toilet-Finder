// Writes isolated acceptance-test records. Run only against a disposable test deployment.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
const env = process.env
const required = [
  'TEST_API_BASE_URL',
  'TEST_USER_EMAIL',
  'TEST_USER_PASSWORD',
  'TEST_ADMIN_EMAIL',
  'TEST_ADMIN_PASSWORD',
  'TEST_MANAGER_EMAIL',
  'TEST_MANAGER_PASSWORD',
  'TEST_PHOTO',
]
for (const key of required)
  if (!env[key]) throw new Error('Missing ' + key + ' for the isolated approval test')
const base = env.TEST_API_BASE_URL.replace(/\/$/, '')
async function call(method, path, body, token, expected) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = 'Bearer ' + token
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'
  const response = await fetch(base + path, {
    method,
    headers,
    body: body instanceof FormData ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  })
  if (expected) {
    assert.ok(expected.includes(response.status), method + ' ' + path + ' returned ' + response.status)
    return
  }
  assert.ok(response.ok, method + ' ' + path + ' returned ' + response.status)
  return (await response.json()).data
}
async function login(role) {
  const auth = await call('POST', '/auth/login', {
    email: env['TEST_' + role + '_EMAIL'],
    password: env['TEST_' + role + '_PASSWORD'],
  })
  const me = await call('GET', '/auth/me', undefined, auth.accessToken)
  assert.equal(me.role, role)
  return auth.accessToken
}
const user = await login('USER'),
  admin = await login('ADMIN'),
  manager = await login('MANAGER')
const file = await readFile(env.TEST_PHOTO),
  filename = basename(env.TEST_PHOTO),
  mime = /\.png$/i.test(filename) ? 'image/png' : /\.webp$/i.test(filename) ? 'image/webp' : 'image/jpeg'
for (const decision of ['APPROVED', 'REJECTED']) {
  const form = new FormData()
  form.append('files', new Blob([file], { type: mime }), filename)
  const images = await call('POST', '/uploads/suggestions', form, user)
  assert.ok(images[0]?.id)
  const name = 'Acceptance ' + randomUUID()
  const s = await call(
    'POST',
    '/toilet-suggestions',
    {
      name,
      address: 'Isolated acceptance fixture',
      latitude: 11.5564,
      longitude: 104.9282,
      imageIds: [images[0].id],
      coverImageId: images[0].id,
    },
    user,
  )
  assert.equal(s.status, 'PENDING')
  const mine = await call('GET', '/me/toilet-suggestions/' + s.id, undefined, user)
  assert.equal(mine.status, 'PENDING')
  const find = () => call('GET', '/toilets?q=' + encodeURIComponent(name))
  assert.equal((await find()).length, 0)
  await call('GET', '/me/toilet-suggestions/' + s.id, undefined, undefined, [401])
  const review = await call('GET', '/admin/suggestions/' + s.id, undefined, admin)
  assert.ok(review.images[0]?.url)
  const payload =
    decision === 'APPROVED'
      ? { status: decision }
      : { status: decision, rejectionReason: 'Acceptance test rejection' }
  await call('PATCH', '/admin/suggestions/' + s.id + '/status', payload, user, [403])
  await call('PATCH', '/admin/suggestions/' + s.id + '/status', payload, manager, [403])
  await call('PATCH', '/admin/suggestions/' + s.id + '/status', payload, admin)
  const result = await call('GET', '/me/toilet-suggestions/' + s.id, undefined, user)
  assert.equal(result.status, decision)
  const visible = await find()
  if (decision === 'APPROVED') {
    assert.ok(result.publishedToiletId)
    assert.ok(visible.some((w) => w.id === result.publishedToiletId && w.isVerified))
    await call('GET', '/manager/toilets/' + result.publishedToiletId, undefined, manager, [403, 404])
    const wc = await call('GET', '/toilets/' + result.publishedToiletId)
    assert.ok(wc.images.length)
    await call('DELETE', '/admin/toilets/' + result.publishedToiletId, undefined, admin)
  } else {
    assert.equal(result.feedback.rejectionReason, payload.rejectionReason)
    assert.equal(visible.length, 0)
  }
  console.log(decision + ' workflow passed.')
}
