import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const { OutputBuffer } = await import(pathToFileURL(join(root, 'lib/output.js')).href)
const { normalizeStore } = await import(pathToFileURL(join(root, 'lib/store.js')).href)
const { StartupController } = await import(pathToFileURL(join(root, 'lib/controller.js')).href)

const logger = { info() {}, warn() {}, error() {} }
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

/** A fake provider whose handles exit or terminate on demand. */
function fakeSubprocess() {
  const handles = []
  return {
    handles,
    async resolveExecutable(name) {
      return `C:/fake/${name}`
    },
    spawn(spec) {
      const stdout = new PassThrough()
      const stderr = new PassThrough()
      let resolveDone
      const done = new Promise((resolve) => { resolveDone = resolve })
      const settle = (outcome) => {
        stdout.end()
        stderr.end()
        resolveDone(outcome)
      }
      const handle = {
        stdout,
        stderr,
        done,
        terminate() {
          settle({ exitCode: 0, signal: null })
        },
        async waitForExit() {
          await done.catch(() => {})
          return true
        },
      }
      handles.push({ spec, handle, settle })
      return handle
    },
  }
}

test('bounded output buffer keeps the UTF-8 tail', () => {
  const buffer = new OutputBuffer(10)
  buffer.append('hello')
  buffer.append(' world')
  assert.equal(buffer.toString(), 'ello world')
  assert.equal(buffer.bytes, 10)
  assert.equal(buffer.truncated, true)

  const emoji = new OutputBuffer(5)
  emoji.append('😀😀')
  assert.equal(emoji.toString(), '😀')

  buffer.clear()
  assert.equal(buffer.toString(), '')
  assert.equal(buffer.bytes, 0)
  assert.equal(buffer.truncated, false)
})

test('store normalization repairs legacy and invalid data', () => {
  const store = normalizeStore({
    activeId: 'missing',
    presets: [
      { id: 'same', name: 'One', command: 'echo 1' },
      { id: 'same', name: 'Two', command: 'echo 2', enabled: true },
      { id: 'bad id', name: '', command: '', enabled: true },
      null,
    ],
  })
  assert.equal(store.presets.length, 3)
  assert.notEqual(store.presets[0].id, store.presets[1].id)
  assert.equal(store.presets[0].enabled, false)
  assert.equal(store.presets[2].enabled, false)
  assert.equal(store.activeId, store.presets[0].id)

  const legacy = normalizeStore({
    activeId: 'legacy-active',
    presets: [
      { id: 'legacy-other', name: 'Other', command: 'echo other' },
      { id: 'legacy-active', name: 'Active', command: 'echo active' },
    ],
  })
  assert.equal(legacy.presets[0].enabled, false)
  assert.equal(legacy.presets[1].enabled, true)
})

test('controller manages presets, output, and process lifecycle', async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'dsh-startup-test-'))
  const previousProfile = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = profile
  t.after(async () => {
    if (previousProfile === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previousProfile
    await rm(profile, { recursive: true, force: true })
  })

  const subprocess = fakeSubprocess()
  const controller = new StartupController({ subprocess, logger: () => undefined }, {}, logger)
  await controller.load()
  assert.equal(controller.snapshot().presets.length, 1)
  assert.equal(controller.snapshot().presets[0].enabled, false)

  await assert.rejects(controller.save({ name: 'Empty', command: '', enabled: true }), (error) => error.status === 400)
  let snapshot = await controller.save({ name: 'Server', command: 'serve', enabled: true })
  assert.equal(snapshot.run.status, 'running')
  assert.equal(subprocess.handles.length, 1)
  const id = snapshot.activeId

  subprocess.handles[0].handle.stdout.write('hello\n')
  await tick(10)
  snapshot = controller.snapshot()
  assert.match(snapshot.output, /hello/u)
  assert.equal(controller.state({
    instanceId: snapshot.instanceId,
    outputSeq: snapshot.outputSeq,
    activeId: snapshot.activeId,
    presetsSeq: snapshot.presetsSeq,
  }).outputOmitted, true)

  // Partial updates preserve unspecified fields and do not restart on rename.
  await controller.save({ id, name: 'Renamed' })
  assert.equal(subprocess.handles.length, 1)
  const renamed = controller.snapshot().presets.find((preset) => preset.id === id)
  assert.equal(renamed.name, 'Renamed')
  assert.equal(renamed.command, 'serve')

  await controller.toggle({ id, enabled: false })
  assert.equal(controller.snapshot().run.status, 'stopped')
  await controller.toggle({ id, enabled: true })
  assert.equal(controller.snapshot().run.status, 'running')
  assert.equal(subprocess.handles.length, 2)

  subprocess.handles[1].settle({ exitCode: 2, signal: null })
  await tick(10)
  snapshot = controller.snapshot()
  assert.equal(snapshot.run.status, 'failed')
  assert.match(snapshot.run.error, /code 2/u)

  await controller.restart()
  assert.equal(controller.snapshot().run.status, 'running')
  await controller.dispose()
  assert.equal(controller.snapshot().presets.every((preset) => preset.running === false), true)

  const stored = JSON.parse(await readFile(join(profile, 'startup-command-presets.json'), 'utf8'))
  assert.equal(stored.version, 1)
  assert.equal(stored.presets.find((preset) => preset.id === id).name, 'Renamed')
})

test('a direct exit keeps the managed range available for stop', async (t) => {
  const profile = await mkdtemp(join(tmpdir(), 'dsh-startup-range-'))
  const previousProfile = process.env.DSH_PROFILE_DIR
  process.env.DSH_PROFILE_DIR = profile
  t.after(async () => {
    if (previousProfile === undefined) delete process.env.DSH_PROFILE_DIR
    else process.env.DSH_PROFILE_DIR = previousProfile
    await rm(profile, { recursive: true, force: true })
  })

  let finishDirect
  let releaseRange
  let terminated = false
  const subprocess = {
    async resolveExecutable(name) {
      return `C:/fake/${name}`
    },
    spawn() {
      const stdout = new PassThrough()
      const stderr = new PassThrough()
      const done = new Promise((resolve) => {
        finishDirect = () => {
          stdout.end()
          stderr.end()
          resolve({ exitCode: 0, signal: null })
        }
      })
      const range = new Promise((resolve) => { releaseRange = resolve })
      return {
        stdout,
        stderr,
        done,
        terminate() {
          terminated = true
          releaseRange()
        },
        waitForExit() {
          return range.then(() => true)
        },
      }
    },
  }

  const controller = new StartupController({ subprocess, logger: () => undefined }, {}, logger)
  await controller.load()
  await controller.save({ name: 'Background', command: 'spawn daemon', enabled: true })
  const id = controller.snapshot().activeId
  finishDirect()
  await tick(10)
  let snapshot = controller.snapshot()
  assert.equal(snapshot.run.status, 'exited')
  assert.equal(snapshot.presets[0].running, false)
  assert.notEqual(controller.processes.get(id).handle, null)

  await controller.toggle({ id, enabled: false })
  assert.equal(terminated, true)
  snapshot = controller.snapshot()
  assert.equal(snapshot.run.status, 'stopped')
  assert.equal(controller.processes.get(id).handle, null)
  await controller.dispose()
})
