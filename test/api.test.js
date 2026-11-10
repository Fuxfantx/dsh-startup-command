import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const { apply } = await import(pathToFileURL(join(root, 'index.js')).href)

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

/** Minimal Node response recorder. */
function response() {
  return {
    statusCode: 200,
    headers: {},
    writableEnded: false,
    destroyed: false,
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(body) {
      this.body = body
      this.writableEnded = true
    },
  }
}

/** Send one JSON-shaped POST through the registered prefix handler. */
function post(route, path, payload, headers = { 'content-type': 'application/json' }) {
  const req = new PassThrough()
  req.method = 'POST'
  req.url = path
  req.headers = headers
  req.complete = true
  const res = response()
  const operation = route.handler(req, res)
  req.end(JSON.stringify(payload))
  return operation.then(() => ({
    status: res.statusCode,
    headers: res.headers,
    body: res.body === undefined ? undefined : JSON.parse(res.body),
  }))
}

test('Host API validates requests, serializes mutations, and omits unchanged state', async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'dsh-startup-api-'))
  const previousProfile = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = profile
  t.after(async () => {
    if (previousProfile === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previousProfile
    await rm(profile, { recursive: true, force: true })
  })

  const handles = []
  const subprocess = {
    async resolveExecutable(name) {
      return `C:/fake/${name}`
    },
    spawn(spec) {
      const stdout = new PassThrough()
      const stderr = new PassThrough()
      let resolveDone
      const done = new Promise((resolve) => { resolveDone = resolve })
      const handle = {
        stdout,
        stderr,
        done,
        terminate() {
          stdout.end()
          stderr.end()
          resolveDone({ exitCode: 0, signal: null })
        },
        async waitForExit() {
          return true
        },
      }
      handles.push({ spec, handle })
      return handle
    },
  }

  let route
  const cleanups = []
  const logger = { info() {}, warn() {}, error() {} }
  const ctx = {
    subprocess,
    logger: () => logger,
    effect(factory) {
      const dispose = factory()
      if (typeof dispose === 'function') cleanups.push(dispose)
    },
    webServer: {
      register(value) {
        route = value
        return () => {}
      },
    },
    connection: {
      requestRejection() {
        return undefined
      },
    },
  }

  await apply(ctx, {})
  await tick(5)
  t.after(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup()
  })

  assert.equal(route.kind, 'prefix')
  assert.equal(route.path, '/startup-command/api')

  let result = await post(route, '/startup-command/api/state', {})
  assert.equal(result.status, 200)
  assert.equal(result.body.ok, true)
  assert.equal(result.body.value.instanceId.length > 0, true)

  result = await post(route, '/startup-command/api/save', {
    name: 'API preset',
    command: 'echo api',
    enabled: true,
  })
  assert.equal(result.status, 200)
  assert.equal(handles.length, 1)
  const id = result.body.value.activeId

  result = await post(route, '/startup-command/api/toggle', { id, enabled: false })
  assert.equal(result.status, 200)
  assert.equal(result.body.value.run.status, 'stopped')
  const state = result.body.value
  result = await post(route, '/startup-command/api/state', {
    instanceId: state.instanceId,
    outputSeq: state.outputSeq,
    activeId: state.activeId,
    presetsSeq: state.presetsSeq,
  })
  assert.equal(result.body.value.outputOmitted, true)
  assert.equal(result.body.value.presetsOmitted, true)

  result = await post(route, '/startup-command/api/save', { name: 'Bad', command: '', enabled: true })
  assert.equal(result.status, 400)
  result = await post(route, '/startup-command/api/missing', {})
  assert.equal(result.status, 404)
  result = await post(route, '/startup-command/api/state', {}, { 'content-type': 'text/plain' })
  assert.equal(result.status, 415)
  result = await post(route, '/startup-command/api/state', {}, {
    'content-type': 'application/json',
    'content-length': '2000000',
  })
  assert.equal(result.status, 413)

  const get = new PassThrough()
  get.method = 'GET'
  get.url = '/startup-command/api/state'
  get.headers = {}
  const getRes = response()
  await route.handler(get, getRes)
  assert.equal(getRes.statusCode, 405)
  assert.equal(getRes.headers.allow, 'POST')
})
