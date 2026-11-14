import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

import {
  DEFAULT_CLEANUP_MS,
  DEFAULT_GRACE_MS,
  MAX_CLEANUP_MS,
  MAX_COMMAND,
  MAX_CWD,
  MAX_GRACE_MS,
  MAX_INTERPRETER,
  MAX_NAME,
  MAX_OUTPUT_BYTES,
  MAX_PRESETS,
  SCOPE,
  START_INTERVAL_MS,
  STORE_FILE,
  STORE_VERSION,
} from './constants.js'
import { httpError } from './http.js'
import { OutputBuffer } from './output.js'
import { SHELL_KINDS, buildArgv, resolveShell } from './shell.js'
import { backupStore, emptyStore, readStore, seedStore, writeStore } from './store.js'

/** @returns trimmed text for strings, otherwise an empty string. */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** @returns the message of a thrown value. */
function reason(error) {
  return error instanceof Error ? error.message : String(error)
}

/** @returns a promise resolved after the delay. */
function wait(ms) {
  return new Promise((done) => setTimeout(done, ms))
}

/**
 * Read a duration from configuration and clamp it to the accepted range.
 * @param value - candidate value.
 * @param fallback - value used when invalid.
 * @param minimum - smallest accepted value.
 * @param maximum - largest accepted value.
 * @returns the accepted duration.
 */
function duration(value, fallback, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)))
}

/** @returns whether the path is an existing directory. */
async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** @returns a fresh run summary. */
function blankRun() {
  return { status: 'idle', startedAt: null, endedAt: null, exitCode: null, signal: null, error: null }
}

/** @returns the profile directory of the Host that launched this plugin. */
function profileDirectory(ctx) {
  try {
    const dir = text(ctx.get?.('profileContext')?.dir)
    if (dir !== '') return dir
  } catch {
    // A host without the launch context keeps the environment fallbacks.
  }
  return text(process.env.DSH_PROFILE_DIR) || process.cwd()
}

/**
 * Read a bounded text field.
 * @param value - client value.
 * @param label - field name used in the error.
 * @param limit - maximum length.
 * @param trim - whether surrounding whitespace is removed.
 * @returns the accepted value.
 */
function boundedText(value, label, limit, trim = true) {
  if (typeof value !== 'string') throw httpError(400, `${label} must be a string`)
  if (value.includes('\0')) throw httpError(400, `${label} must not contain NUL characters`)
  const result = trim ? value.trim() : value
  if (result.length > limit) throw httpError(400, `${label} is longer than ${limit} characters`)
  return result
}

/** @returns the run error for one exit outcome. */
function exitError(exitCode, signal) {
  if (exitCode === 0) return null
  if (exitCode !== null) return `The process exited with code ${exitCode}`
  if (signal !== null) return `The process ended with signal ${signal}`
  return 'The process ended without an exit status'
}

/**
 * Preset store plus the process and output state surfaced to the browser.
 *
 * One preset owns at most one managed process range, represented by its
 * `attempt`: the handle returned by `ctx.subprocess`, which keeps running
 * until the whole range is quiescent. A new attempt is only created after the
 * previous range settled, so a restart can never leak the old process tree.
 */
export class StartupController {
  /**
   * @param ctx - Host plugin context.
   * @param config - bundle row configuration.
   * @param logger - scoped logger.
   */
  constructor(ctx, config, logger) {
    this.ctx = ctx
    this.logger = logger
    this.baseDir = resolve(profileDirectory(ctx))
    this.storePath = join(this.baseDir, STORE_FILE)
    this.graceMs = duration(config?.graceMs, DEFAULT_GRACE_MS, 250, MAX_GRACE_MS)
    this.cleanupMs = Math.max(
      duration(config?.cleanupTimeoutMs, DEFAULT_CLEANUP_MS, 1000, MAX_CLEANUP_MS),
      this.graceMs + 1000,
    )
    this.seedCommand = text(config?.command)

    this.data = emptyStore()
    this.instanceId = randomUUID()
    /** @type {Map<string, { attempt: object | null, run: object, output: OutputBuffer, outputEpoch: number, seq: number }>} */
    this.processes = new Map()
    this.updatedAt = Date.now()
    this.presetsSeq = 0
    this.closing = false
    this.readOnly = false
  }

  /** Load the store, creating or moving aside what cannot be read. */
  async load() {
    try {
      this.data = await readStore(this.storePath)
      return
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.logger.warn(`[${SCOPE}] cannot read the preset store: ${reason(error)}`)
        try {
          const backup = await backupStore(this.storePath)
          this.logger.warn(`[${SCOPE}] moved the damaged preset store to ${backup}`)
        } catch (backupError) {
          if (backupError?.code !== 'ENOENT') {
            this.readOnly = true
            this.logger.warn(`[${SCOPE}] cannot move the damaged preset store aside; changes will not be saved: ${reason(backupError)}`)
          }
        }
      }
      this.data = seedStore(this.seedCommand)
      if (this.readOnly) return
      try {
        await writeStore(this.storePath, this.data)
      } catch (writeError) {
        this.logger.warn(`[${SCOPE}] cannot create the preset store: ${reason(writeError)}`)
      }
    }
  }

  /** Persist and publish a new preset list. */
  async commit(presets, activeId = this.data.activeId) {
    if (this.readOnly) {
      throw httpError(500, 'Preset storage is read-only because the damaged store could not be moved aside')
    }
    const next = { version: STORE_VERSION, activeId, presets }
    await writeStore(this.storePath, next)
    this.data = next
    this.touchPresets()
  }

  /** Stop admitting new starts while the plugin unloads. */
  beginClose() {
    this.closing = true
  }

  /** Record a change for pollers. */
  touch() {
    const now = Date.now()
    this.updatedAt = now > this.updatedAt ? now : this.updatedAt + 1
  }

  /** Record a change to preset metadata or per-preset run state. */
  touchPresets() {
    this.presetsSeq += 1
    this.touch()
  }

  /** @returns the process record for one preset, creating it when absent. */
  recordFor(id) {
    let record = this.processes.get(id)
    if (record === undefined) {
      record = {
        attempt: null,
        run: blankRun(),
        output: new OutputBuffer(MAX_OUTPUT_BYTES),
        outputEpoch: 0,
        seq: 0,
      }
      this.processes.set(id, record)
    }
    return record
  }

  /** @returns whether a managed process is alive for the record. */
  isRunning(record) {
    return record !== undefined && record.attempt !== null && !record.attempt.exited && !record.attempt.released
  }

  /** @returns whether a new process may be launched for the record. */
  canStart(record) {
    return record === undefined || record.attempt === null || record.attempt.released
  }

  /** Replace the run summary and publish it. */
  setRun(record, patch) {
    record.run = { ...record.run, ...patch }
    this.touchPresets()
  }

  /** @returns the active process record, when one exists. */
  activeRecord() {
    return this.data.activeId === null ? undefined : this.processes.get(this.data.activeId)
  }

  /** @returns the active preset's retained output. */
  activeOutput() {
    return this.activeRecord()?.output.toString() ?? ''
  }

  /**
   * Build one view of the controller.
   * @param withOutput - whether to include the full active output.
   * @returns the view.
   */
  view(withOutput) {
    const active = this.activeRecord()
    return {
      instanceId: this.instanceId,
      activeId: this.data.activeId,
      presets: this.data.presets.map((preset) => {
        const record = this.processes.get(preset.id)
        return {
          ...preset,
          running: this.isRunning(record),
          run: { ...(record?.run ?? blankRun()) },
        }
      }),
      presetsSeq: this.presetsSeq,
      run: { ...(active?.run ?? blankRun()) },
      output: withOutput ? (active?.output.toString() ?? '') : '',
      outputOffset: active?.output.total ?? 0,
      outputEpoch: active?.outputEpoch ?? 0,
      outputReset: withOutput,
      outputSeq: active?.seq ?? 0,
      outputTruncated: active?.output.truncated ?? false,
      updatedAt: this.updatedAt,
    }
  }

  /** Snapshot the selected output and every per-preset run state. */
  snapshot() {
    return this.view(true)
  }

  /** Snapshot with only the output appended since the client's last offset. */
  state(payload) {
    const view = this.view(false)
    if (payload?.instanceId !== view.instanceId) {
      view.output = this.activeOutput()
      view.outputReset = true
      return view
    }
    if (payload.activeId === view.activeId
      && Number.isInteger(payload.outputOffset)
      && payload.outputEpoch === view.outputEpoch) {
      if (payload.outputSeq === view.outputSeq) {
        view.output = null
        view.outputOmitted = true
        view.outputReset = false
      } else {
        const delta = this.activeRecord()?.output.read(payload.outputOffset) ?? { text: '', next: 0, reset: true }
        view.output = delta.text
        view.outputOffset = delta.next
        view.outputReset = delta.reset
      }
    } else {
      view.output = this.activeOutput()
      view.outputReset = true
    }
    if (payload.presetsSeq === view.presetsSeq) {
      view.presets = null
      view.presetsOmitted = true
    }
    return view
  }

  /** Append process output to the preset's buffer for this attempt only. */
  append(value, id, attempt) {
    if (typeof value !== 'string' || value === '') return
    const record = this.processes.get(id)
    if (record === undefined || record.attempt !== attempt) return
    record.output.append(value)
    record.seq += 1
    if (this.data.activeId === id) this.touch()
  }

  /** Clear the selected preset's live output. */
  clearOutput() {
    const record = this.data.activeId === null ? undefined : this.processes.get(this.data.activeId)
    if (record === undefined || record.output.bytes === 0) return
    record.output.clear()
    record.outputEpoch += 1
    record.seq += 1
    this.touch()
  }

  /** Mark a run that ended by itself; an explicit stop must not rewrite it. */
  markStopped(record) {
    if (record.attempt === null || record.run.status === 'stopped') return
    this.setRun(record, { status: 'stopped', endedAt: Date.now(), error: null })
  }

  /** Wait for one managed range to become quiescent. */
  async waitForExit(handle) {
    try {
      return (await handle.waitForExit(AbortSignal.timeout(this.cleanupMs))) !== false
    } catch (error) {
      this.logger.warn(`[${SCOPE}] cannot wait for a process to stop: ${reason(error)}`)
      return false
    }
  }

  /** Terminate one managed range with one retry. */
  async terminate(id, handle) {
    const request = () => {
      try {
        handle.terminate()
      } catch (error) {
        this.logger.warn(`[${SCOPE}] cannot request termination for ${id}: ${reason(error)}`)
      }
    }
    request()
    if (await this.waitForExit(handle)) return true
    this.logger.warn(`[${SCOPE}] process ${id} did not stop in time; retrying`)
    request()
    return this.waitForExit(handle)
  }

  /** Release an attempt once its whole managed range became quiescent. */
  observeRangeExit(attempt) {
    attempt.handle.waitForExit().then(
      (quiescent) => {
        if (quiescent !== false) attempt.released = true
      },
      (error) => {
        // The provider can no longer observe the range. Blocking every future
        // start would be worse than treating the range as gone.
        attempt.released = true
        this.logger.warn(`[${SCOPE}] cannot observe a managed process range: ${reason(error)}`)
      },
    )
  }

  /** Terminate one preset's managed range and wait for quiescence. */
  async stopPreset(id) {
    const record = this.processes.get(id)
    if (record === undefined) return true
    const attempt = record.attempt
    if (attempt === null || attempt.released) {
      this.markStopped(record)
      return true
    }
    // The stop owns the run state from here on: an exit that races it must not
    // overwrite "stopped" with the exit status.
    attempt.stopping = true
    this.markStopped(record)
    if (await this.terminate(id, attempt.handle)) {
      attempt.released = true
      return true
    }
    if (!attempt.exited) {
      this.setRun(record, {
        status: 'failed',
        endedAt: Date.now(),
        error: 'The process did not stop in time',
      })
    }
    this.observeRangeExit(attempt)
    return false
  }

  /** Stop every managed process range. */
  async stopAll() {
    const results = await Promise.all([...this.processes.keys()].map((id) => this.stopPreset(id)))
    return results.every(Boolean)
  }

  /** Attach one decoded pipe to one attempt. */
  captureStream(id, attempt, stream) {
    if (stream === undefined || stream === null) return { close() {} }
    stream.setEncoding('utf8')
    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      stream.off('data', onData)
      stream.off('end', close)
      stream.off('close', close)
    }
    const onData = (chunk) => {
      if (!closed) this.append(chunk, id, attempt)
    }
    const onError = (error) => {
      if (closed) return
      this.append(`\n[stream error] ${reason(error)}\n`, id, attempt)
      close()
    }
    stream.on('data', onData)
    stream.once('end', close)
    stream.once('close', close)
    stream.on('error', onError)
    return { close }
  }

  /** Start one preset, replacing its own previous process only. */
  async startPreset(id) {
    if (this.closing) return false
    const preset = this.data.presets.find((candidate) => candidate.id === id)
    if (preset === undefined) return false
    const record = this.recordFor(id)
    const stopped = await this.stopPreset(id)
    if (this.closing) return false

    record.run = blankRun()
    record.output.clear()
    record.outputEpoch += 1
    record.seq += 1
    const fail = (message) => {
      this.setRun(record, { status: 'failed', endedAt: Date.now(), error: message })
      record.output.append(`${message}\n`)
      record.seq += 1
      this.touchPresets()
      return false
    }
    if (!stopped) return fail('Cannot start: the previous process did not stop')

    const command = text(preset.command)
    if (command === '') return fail('The preset has no command')
    const configured = text(preset.cwd)
    if (configured !== '' && !isAbsolute(configured)) return fail('The working directory must be an absolute path')
    const cwd = configured === '' ? this.baseDir : configured
    if (!(await isDirectory(cwd))) {
      if (this.closing) return false
      return fail(`The working directory does not exist: ${cwd}`)
    }
    let shell
    try {
      shell = await resolveShell(this.ctx.subprocess, preset, cwd)
    } catch (error) {
      if (this.closing) return false
      return fail(`Cannot resolve the interpreter: ${reason(error)}`)
    }
    if (this.closing) return false
    let handle
    try {
      handle = this.ctx.subprocess.spawn({
        argv: buildArgv(shell.kind, shell.executable, command),
        cwd,
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        graceMs: this.graceMs,
        env: shell.env,
      })
    } catch (error) {
      if (this.closing) return false
      return fail(`Cannot start ${shell.label}: ${reason(error)}`)
    }

    const attempt = { handle, exited: false, released: false, stopping: false }
    record.attempt = attempt
    this.setRun(record, {
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
      exitCode: null,
      signal: null,
      error: null,
    })
    this.append(`=== ${preset.name} (${shell.label}) ===\n\n`, id, attempt)

    const pipes = [
      this.captureStream(id, attempt, handle.stdout),
      this.captureStream(id, attempt, handle.stderr),
    ]
    handle.done.then(
      (outcome) => {
        attempt.exited = true
        this.observeRangeExit(attempt)
        if (attempt.stopping || record.attempt !== attempt) return
        const exitCode = Number.isInteger(outcome?.exitCode) ? outcome.exitCode : null
        const signal = typeof outcome?.signal === 'string' ? outcome.signal : null
        this.setRun(record, {
          status: exitCode === 0 ? 'exited' : 'failed',
          endedAt: Date.now(),
          exitCode,
          signal,
          error: exitError(exitCode, signal),
        })
      },
      (error) => {
        attempt.exited = true
        for (const pipe of pipes) pipe.close()
        this.observeRangeExit(attempt)
        if (attempt.stopping || record.attempt !== attempt) return
        this.setRun(record, {
          status: 'failed',
          endedAt: Date.now(),
          exitCode: null,
          signal: null,
          error: `The process failed: ${reason(error)}`,
        })
      },
    )
    return true
  }

  /** Start enabled presets in list order, one interval apart. */
  async startEnabled() {
    const presets = this.data.presets.filter((preset) => preset.enabled === true && text(preset.command) !== '')
    for (const [index, preset] of presets.entries()) {
      if (this.closing) return
      if (this.canStart(this.processes.get(preset.id))) await this.startPreset(preset.id)
      if (index < presets.length - 1) await wait(START_INTERVAL_MS)
    }
  }

  /** Create or update a preset, then start or stop it when that changed. */
  async save(payload) {
    const body = payload ?? {}
    const id = text(body.id)
    const existing = id === '' ? undefined : this.data.presets.find((preset) => preset.id === id)
    if (id !== '' && existing === undefined) throw httpError(404, 'Preset not found')
    if (existing === undefined && this.data.presets.length >= MAX_PRESETS) {
      throw httpError(400, `Cannot create more than ${MAX_PRESETS} presets`)
    }

    const name = body.name === undefined
      ? existing?.name ?? ''
      : boundedText(body.name, 'Name', MAX_NAME)
    if (name === '') throw httpError(400, 'Name is required')

    const command = body.command === undefined
      ? existing?.command ?? ''
      : boundedText(body.command, 'Command', MAX_COMMAND, false)

    const cwd = body.cwd === undefined
      ? existing?.cwd ?? ''
      : boundedText(body.cwd, 'Working directory', MAX_CWD)
    if (cwd !== '' && !isAbsolute(cwd)) throw httpError(400, 'Working directory must be an absolute path')

    const kind = body.kind === undefined ? existing?.kind ?? 'powershell' : body.kind
    if (!SHELL_KINDS.includes(kind)) throw httpError(400, `Interpreter must be one of ${SHELL_KINDS.join(', ')}`)

    const interpreter = body.interpreter === undefined
      ? existing?.interpreter ?? ''
      : boundedText(body.interpreter, 'Interpreter', MAX_INTERPRETER)

    const enabled = body.enabled === undefined ? existing?.enabled ?? true : body.enabled
    if (typeof enabled !== 'boolean') throw httpError(400, 'Enabled must be a boolean')
    if (enabled && text(command) === '') throw httpError(400, 'An enabled preset requires a command')

    const preset = {
      id: existing?.id ?? randomUUID(),
      name,
      command,
      cwd,
      kind,
      interpreter,
      enabled,
      updatedAt: Date.now(),
    }
    const presets = existing === undefined
      ? [...this.data.presets, preset]
      : this.data.presets.map((candidate) => (candidate.id === preset.id ? preset : candidate))
    const activeId = existing === undefined ? preset.id : this.data.activeId ?? preset.id
    const replaced = existing === undefined ||
      existing.command !== preset.command ||
      existing.cwd !== preset.cwd ||
      existing.kind !== preset.kind ||
      existing.interpreter !== preset.interpreter ||
      existing.enabled !== preset.enabled

    await this.commit(presets, activeId)
    if (!replaced) return this.snapshot()
    if (preset.enabled) await this.startPreset(preset.id)
    else if (!(await this.stopPreset(preset.id))) {
      throw httpError(500, 'Preset saved, but its process did not stop')
    }
    return this.snapshot()
  }

  /** Delete one preset and stop its process. */
  async remove(payload) {
    const id = text(payload?.id)
    if (id === '') throw httpError(400, 'Preset id is required')
    if (!this.data.presets.some((preset) => preset.id === id)) throw httpError(404, 'Preset not found')
    if (!(await this.stopPreset(id))) {
      throw httpError(500, 'Preset was not deleted because its process did not stop')
    }
    const presets = this.data.presets.filter((preset) => preset.id !== id)
    const activeId = this.data.activeId === id ? presets[0]?.id ?? null : this.data.activeId
    await this.commit(presets, activeId)
    this.processes.delete(id)
    return this.snapshot()
  }

  /** Select a preset for display and start it when it is enabled and stopped. */
  async select(payload) {
    const id = text(payload?.id)
    if (id === '') throw httpError(400, 'Preset id is required')
    const preset = this.data.presets.find((candidate) => candidate.id === id)
    if (preset === undefined) throw httpError(404, 'Preset not found')
    if (this.data.activeId !== id) await this.commit(this.data.presets, id)
    const runnable = preset.enabled === true && text(preset.command) !== ''
    if (runnable && this.canStart(this.processes.get(id))) await this.startPreset(id)
    return this.snapshot()
  }

  /** Enable or disable one preset without changing the selected view. */
  async toggle(payload) {
    const id = text(payload?.id)
    if (id === '') throw httpError(400, 'Preset id is required')
    if (typeof payload?.enabled !== 'boolean') throw httpError(400, 'Enabled must be a boolean')
    const enabled = payload.enabled
    const preset = this.data.presets.find((candidate) => candidate.id === id)
    if (preset === undefined) throw httpError(404, 'Preset not found')
    if (enabled && text(preset.command) === '') {
      throw httpError(400, 'An enabled preset requires a command')
    }
    if (preset.enabled !== enabled) {
      const presets = this.data.presets.map((candidate) => {
        return candidate.id === id ? { ...candidate, enabled, updatedAt: Date.now() } : candidate
      })
      await this.commit(presets)
    }
    if (enabled) {
      if (this.canStart(this.processes.get(id))) await this.startPreset(id)
    } else if (!(await this.stopPreset(id))) {
      throw httpError(500, 'The preset was disabled, but its process did not stop')
    }
    return this.snapshot()
  }

  /** Move one preset up or down in execution order. */
  async move(payload) {
    const id = text(payload?.id)
    const direction = payload?.direction
    if (id === '') throw httpError(400, 'Preset id is required')
    if (direction !== 'up' && direction !== 'down') throw httpError(400, 'Invalid direction')
    const index = this.data.presets.findIndex((preset) => preset.id === id)
    if (index === -1) throw httpError(404, 'Preset not found')
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= this.data.presets.length) return this.snapshot()
    const presets = [...this.data.presets]
    const [moved] = presets.splice(index, 1)
    presets.splice(target, 0, moved)
    await this.commit(presets)
    return this.snapshot()
  }

  /** Restart every enabled preset after stopping all managed ranges. */
  async restart() {
    if (!(await this.stopAll())) {
      throw httpError(500, 'Restart aborted: at least one process did not stop')
    }
    await this.startEnabled()
    return this.snapshot()
  }

  /** Stop every managed preset, preserving the enabled switches. */
  async stop() {
    if (!(await this.stopAll())) throw httpError(500, 'At least one process did not stop')
    return this.snapshot()
  }

  /** Clear the selected preset's live output. */
  async clear() {
    this.clearOutput()
    return this.snapshot()
  }

  /** Stop every managed range when the plugin is unloaded or reinstalled. */
  async dispose() {
    this.closing = true
    if (await this.stopAll()) return
    this.logger.warn(`[${SCOPE}] some managed processes did not stop during plugin teardown`)
  }
}
