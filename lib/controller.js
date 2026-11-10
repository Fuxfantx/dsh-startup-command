import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
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
import { SHELL_KINDS, buildArgv, isDirectory, normalizeShellKind, resolveShell, shellLabel } from './shell.js'
import { backupStore, emptyStore, readStore, removeStaleFiles, seedStore, writeStore } from './store.js'

/** @returns trimmed text for strings, otherwise an empty string. */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** @returns a human-readable error message. */
function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}

/** @returns a promise resolved after the delay. */
function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

/**
 * Read a duration from configuration.
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

/**
 * Preset store plus the process and output state surfaced to the browser.
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
    this.profileDir = text(process.env.DSH_PROFILE_DIR)
    if (this.profileDir !== '') this.profileDir = resolve(this.profileDir)
    this.storeDir = this.profileDir === '' ? process.cwd() : this.profileDir
    this.storePath = join(this.storeDir, STORE_FILE)
    this.graceMs = duration(config?.graceMs, DEFAULT_GRACE_MS, 250, MAX_GRACE_MS)
    this.cleanupTimeoutMs = Math.max(
      duration(config?.cleanupTimeoutMs, DEFAULT_CLEANUP_MS, 1000, MAX_CLEANUP_MS),
      this.graceMs + 1000,
    )
    this.seedCommand = text(config?.command)

    this.data = emptyStore()
    this.instanceId = randomUUID()
    /** @type {Map<string, { handle: object | null, terminating: object | null, directExited: boolean, generation: number, run: object, output: OutputBuffer, seq: number }>} */
    this.processes = new Map()
    this.updatedAt = Date.now()
    this.presetsSeq = 0
    this.closing = false
    this.storeReadOnly = false
  }

  /** Load the store, creating or backing up it as needed. */
  async load() {
    await removeStaleFiles(this.storeDir)
    try {
      this.data = await readStore(this.storePath)
      return
    } catch (error) {
      const missing = error?.code === 'ENOENT'
      if (!missing) {
        this.logger.warn(`[${SCOPE}] cannot read presets: ${errorText(error)}`)
        try {
          const backup = await backupStore(this.storePath)
          this.logger.warn(`[${SCOPE}] moved the damaged preset store to ${backup}`)
        } catch (backupError) {
          if (backupError?.code !== 'ENOENT') {
            this.storeReadOnly = true
            this.logger.warn(`[${SCOPE}] cannot back up the damaged preset store; changes will not be saved: ${errorText(backupError)}`)
          }
        }
      }
      this.data = seedStore(this.seedCommand)
      if (this.storeReadOnly) return
      try {
        await writeStore(this.storePath, this.data)
      } catch (writeError) {
        this.logger.warn(`[${SCOPE}] cannot create the preset store: ${errorText(writeError)}`)
      }
    }
  }

  /** Persist and publish a new document. */
  async commit(next) {
    if (this.storeReadOnly) {
      throw httpError(500, 'Preset storage is read-only because the damaged store could not be backed up')
    }
    await writeStore(this.storePath, next)
    this.data = next
    this.touchPresets()
  }

  /** Stop admitting new starts while the plugin unloads. */
  beginClose() {
    this.closing = true
  }

  /** Record a state change for pollers. */
  touch() {
    const now = Date.now()
    this.updatedAt = now > this.updatedAt ? now : this.updatedAt + 1
  }

  /** Record a change to preset metadata or per-preset run state. */
  touchPresets() {
    this.presetsSeq += 1
    this.touch()
  }

  /** @returns a fresh run record. */
  blankRun() {
    return {
      status: 'idle',
      startedAt: null,
      endedAt: null,
      exitCode: null,
      signal: null,
      error: null,
    }
  }

  /** @returns whether the record has a live managed handle. */
  isRunning(record) {
    return record?.handle !== null && record?.handle !== undefined && record.directExited !== true
  }

  /** @returns whether any managed range handle is retained. */
  hasHandle(record) {
    return record?.handle !== null && record?.handle !== undefined
  }

  /** @returns whether a previous range is still being terminated. */
  hasTerminating(record) {
    return record?.terminating !== null && record?.terminating !== undefined
  }

  /** @returns whether a new process may be launched for the record. */
  canStart(record) {
    return !this.hasHandle(record) && !this.hasTerminating(record)
  }

  /** @returns the process record for one preset, creating it when absent. */
  recordFor(id) {
    let record = this.processes.get(id)
    if (record === undefined) {
      record = {
        handle: null,
        terminating: null,
        directExited: false,
        generation: 0,
        run: this.blankRun(),
        output: new OutputBuffer(MAX_OUTPUT_BYTES),
        seq: 0,
      }
      this.processes.set(id, record)
    }
    return record
  }

  /** Snapshot the active output and all per-preset run states. */
  snapshot() {
    const activeId = this.data.activeId
    const activeRecord = activeId === null ? undefined : this.processes.get(activeId)
    return {
      instanceId: this.instanceId,
      activeId,
      presets: this.data.presets.map((preset) => {
        const record = this.processes.get(preset.id)
        return {
          ...preset,
          running: this.isRunning(record),
          run: { ...(record?.run ?? this.blankRun()) },
        }
      }),
      presetsSeq: this.presetsSeq,
      run: { ...(activeRecord?.run ?? this.blankRun()) },
      output: activeRecord?.output.toString() ?? '',
      outputSeq: activeRecord?.seq ?? 0,
      outputTruncated: activeRecord?.output.truncated ?? false,
      updatedAt: this.updatedAt,
    }
  }

  /** Snapshot without resending unchanged active output or preset metadata. */
  state(payload) {
    const view = this.snapshot()
    const sameInstance = payload?.instanceId === view.instanceId
    const sameOutput = sameInstance &&
      Number.isSafeInteger(payload?.outputSeq) &&
      payload.outputSeq === view.outputSeq &&
      payload?.activeId === view.activeId
    const samePresets = sameInstance &&
      Number.isSafeInteger(payload?.presetsSeq) &&
      payload.presetsSeq === view.presetsSeq
    if (!sameOutput && !samePresets) return view
    const result = { ...view }
    if (sameOutput) {
      result.output = null
      result.outputOmitted = true
    }
    if (samePresets) {
      result.presets = null
      result.presetsOmitted = true
    }
    return result
  }

  /** Append process output to one preset's bounded buffer. */
  append(value, id, generation) {
    if (typeof value !== 'string' || value === '') return
    const record = this.processes.get(id)
    if (record === undefined || record.generation !== generation) return
    if (!record.output.append(value)) return
    record.seq += 1
    if (this.data.activeId === id) this.touch()
  }

  /** Clear the selected preset's live output. */
  clearOutput() {
    const id = this.data.activeId
    const record = id === null ? undefined : this.processes.get(id)
    if (record === undefined || record.output.bytes === 0) return
    record.output.clear()
    record.seq += 1
    this.touch()
  }

  /** Mark a start failure for one preset. */
  failStart(record, id, message, generation) {
    if (record.generation !== generation) return
    record.run.status = 'failed'
    record.run.startedAt = null
    record.run.endedAt = Date.now()
    record.run.exitCode = null
    record.run.signal = null
    record.run.error = message
    this.append(`${message}\n`, id, generation)
    this.touchPresets()
  }

  /** Wait for one handle's managed range to become quiescent. */
  async waitForStop(handle) {
    try {
      const result = await handle.waitForExit(AbortSignal.timeout(this.cleanupTimeoutMs))
      return result !== false
    } catch (error) {
      this.logger.warn(`[${SCOPE}] waiting for a process to stop failed: ${errorText(error)}`)
      return false
    }
  }

  /** Terminate one managed range with one retry. */
  async terminateHandle(id, handle) {
    const request = () => {
      try {
        handle.terminate()
      } catch (error) {
        this.logger.warn(`[${SCOPE}] terminate request failed for ${id}: ${errorText(error)}`)
      }
    }
    request()
    if (await this.waitForStop(handle)) return true
    this.logger.warn(`[${SCOPE}] process ${id} did not stop in time; retrying`)
    request()
    return this.waitForStop(handle)
  }

  /** Release a handle once its whole managed range is empty. */
  observeRangeExit(record, handle) {
    const settled = () => {
      const terminating = record.terminating === handle
      if (terminating) record.terminating = null
      if (record.handle === handle) {
        record.handle = null
        record.directExited = false
      }
      if (terminating && record.run.status === 'failed') {
        record.run.status = 'stopped'
        record.run.endedAt = Date.now()
        record.run.error = null
        this.touchPresets()
      }
    }
    try {
      handle.waitForExit().then((result) => {
        if (result !== false) settled()
      }, () => {})
    } catch {
      // A provider that cannot observe the range keeps the handle for stop().
    }
  }

  /** Terminate one preset's managed range and wait for quiescence. */
  async stopPreset(id) {
    const record = this.processes.get(id)
    if (record === undefined) return true
    const handle = record.handle ?? record.terminating
    record.generation += 1
    if (handle === null) {
      record.directExited = false
      if (record.run.status === 'running') {
        record.run.status = 'stopped'
        record.run.endedAt = Date.now()
        record.run.error = null
        this.touchPresets()
      }
      return true
    }
    record.handle = null
    record.terminating = handle
    if (record.run.status !== 'stopped') {
      record.run.status = 'stopped'
      record.run.endedAt = Date.now()
      record.run.error = null
      this.touchPresets()
    }
    const stopped = await this.terminateHandle(id, handle)
    if (stopped) {
      if (record.terminating === handle) record.terminating = null
      record.directExited = false
      return true
    }
    record.run.status = 'failed'
    record.run.endedAt = Date.now()
    record.run.error = 'The process did not stop in time'
    this.touchPresets()
    this.observeRangeExit(record, handle)
    return false
  }

  /** Stop every managed process range. */
  async stopAll() {
    const results = await Promise.all([...this.processes.keys()].map((id) => this.stopPreset(id)))
    return results.every(Boolean)
  }

  /** Attach one decoded pipe to a preset record. */
  pipeStream(stream, id, generation) {
    if (stream === undefined || stream === null || stream.readableEnded || stream.destroyed) {
      return { close: () => {} }
    }
    const decoder = new StringDecoder('utf8')
    let finished = false
    const close = () => {
      if (finished) return
      finished = true
      stream.off('data', onData)
      stream.off('end', close)
      stream.off('close', close)
      this.append(decoder.end(), id, generation)
    }
    const onData = (chunk) => {
      if (finished) return
      this.append(decoder.write(chunk), id, generation)
    }
    stream.on('data', onData)
    stream.once('end', close)
    stream.once('close', close)
    stream.on('error', (error) => {
      if (finished) return
      this.append(`\n[stream error] ${errorText(error)}\n`, id, generation)
      close()
    })
    return { close }
  }

  /** Start one preset, replacing its own previous process only. */
  async startPreset(id) {
    if (this.closing) return false
    const preset = this.data.presets.find((candidate) => candidate.id === id)
    if (preset === undefined) return false
    const stopped = await this.stopPreset(id)
    if (this.closing) return false
    const record = this.recordFor(id)
    if (!stopped) {
      this.failStart(record, id, 'Cannot start: the previous process did not stop', record.generation)
      return false
    }
    record.run = this.blankRun()
    record.output.clear()
    record.seq += 1
    const generation = ++record.generation
    this.touchPresets()

    const command = text(preset.command)
    if (command === '') {
      this.failStart(record, id, 'The selected preset has no command', generation)
      return false
    }
    const configuredCwd = text(preset.cwd)
    if (configuredCwd !== '' && !isAbsolute(configuredCwd)) {
      this.failStart(record, id, 'Working directory must be an absolute path', generation)
      return false
    }
    const cwd = configuredCwd || this.profileDir || process.cwd()
    if (!(await isDirectory(cwd))) {
      if (this.closing) return false
      if (record.generation !== generation) return false
      this.failStart(record, id, `Working directory does not exist: ${cwd}`, generation)
      return false
    }
    let shell
    try {
      shell = await resolveShell(this.ctx.subprocess, preset)
    } catch (error) {
      if (this.closing) return false
      if (record.generation !== generation) return false
      this.failStart(record, id, `Cannot resolve shell: ${errorText(error)}`, generation)
      return false
    }
    if (this.closing || record.generation !== generation) return false
    let handle
    try {
      handle = this.ctx.subprocess.spawn({
        argv: buildArgv(shell.kind, shell.executable, command),
        cwd,
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        graceMs: this.graceMs,
        env: process.env,
      })
      if (handle === undefined || handle === null || typeof handle.done?.then !== 'function') {
        throw new Error('the subprocess provider returned an invalid handle')
      }
    } catch (error) {
      if (this.closing) return false
      this.failStart(record, id, `Cannot start ${shell.kind}: ${errorText(error)}`, generation)
      return false
    }

    record.handle = handle
    record.terminating = null
    record.directExited = false
    record.run.status = 'running'
    record.run.startedAt = Date.now()
    record.run.endedAt = null
    record.run.exitCode = null
    record.run.signal = null
    record.run.error = null
    this.append(`=== ${preset.name} (${shellLabel(shell.kind)}) ===\n\n`, id, generation)
    this.touchPresets()

    let pipes = []
    try {
      pipes = [
        this.pipeStream(handle.stdout, id, generation),
        this.pipeStream(handle.stderr, id, generation),
      ]
    } catch (error) {
      this.logger.warn(`[${SCOPE}] cannot attach output for ${id}: ${errorText(error)}`)
    }
    const finish = (outcome) => {
      const stopping = record.terminating === handle
      if (record.generation !== generation) {
        if (stopping) {
          record.run.status = 'stopped'
          record.run.endedAt = Date.now()
          record.run.error = null
          this.touchPresets()
        }
        this.observeRangeExit(record, handle)
        return
      }
      if (record.handle === handle) record.directExited = true
      record.run.endedAt = Date.now()
      const exitCode = outcome !== null && typeof outcome === 'object' && Number.isInteger(outcome.exitCode)
        ? outcome.exitCode
        : null
      const signal = outcome !== null && typeof outcome === 'object' && typeof outcome.signal === 'string'
        ? outcome.signal
        : null
      record.run.exitCode = exitCode
      record.run.signal = signal
      if (exitCode === 0) {
        record.run.status = 'exited'
        record.run.error = null
      } else {
        record.run.status = 'failed'
        record.run.error = exitCode === null
          ? signal === null
            ? 'Process ended without an exit status'
            : `Process ended with signal ${signal}`
          : `Process exited with code ${exitCode}`
      }
      this.touchPresets()
      this.observeRangeExit(record, handle)
    }
    const failed = (error) => {
      if (record.generation !== generation) {
        this.observeRangeExit(record, handle)
        return
      }
      if (record.handle === handle) record.directExited = true
      for (const pipe of pipes) pipe.close()
      record.run.status = 'failed'
      record.run.endedAt = Date.now()
      record.run.exitCode = null
      record.run.signal = null
      record.run.error = `Process failed: ${errorText(error)}`
      this.touchPresets()
      this.observeRangeExit(record, handle)
    }
    try {
      handle.done.then(finish, failed).catch((error) => {
        this.logger.warn(`[${SCOPE}] cannot record the end of ${id}: ${errorText(error)}`)
      })
    } catch (error) {
      this.logger.warn(`[${SCOPE}] cannot observe the end of ${id}: ${errorText(error)}`)
    }
    return true
  }

  /** Start enabled presets in list order, 500 ms apart. */
  async startEnabled() {
    const presets = this.data.presets.filter((preset) => {
      return preset.enabled === true && text(preset.command) !== ''
    })
    for (let index = 0; index < presets.length; index += 1) {
      if (this.closing) return
      const preset = presets[index]
      const record = this.processes.get(preset.id)
      if (!this.canStart(record)) continue
      await this.startPreset(preset.id)
      if (this.closing) return
      if (index < presets.length - 1) await delay(START_INTERVAL_MS)
    }
  }

  /** Create or update a preset and restart that preset when needed. */
  async save(payload) {
    const body = payload ?? {}
    const id = text(body.id)
    const existing = id === '' ? undefined : this.data.presets.find((preset) => preset.id === id)
    if (id !== '' && existing === undefined) throw httpError(404, 'Preset not found')
    if (existing === undefined && this.data.presets.length >= MAX_PRESETS) {
      throw httpError(400, `Cannot create more than ${MAX_PRESETS} presets`)
    }
    const name = body.name === undefined
      ? existing?.name ?? 'Untitled'
      : boundedText(body.name, 'Name', MAX_NAME)
    if (name === '') throw httpError(400, 'Name is required')
    const command = body.command === undefined
      ? existing?.command ?? ''
      : boundedString(body.command, 'Command', MAX_COMMAND)
    const cwd = body.cwd === undefined
      ? existing?.cwd ?? ''
      : boundedText(body.cwd, 'Working directory', MAX_CWD)
    if (cwd !== '' && !isAbsolute(cwd)) throw httpError(400, 'Working directory must be an absolute path')
    const kind = body.kind === undefined
      ? existing?.kind ?? 'powershell'
      : normalizeShellKind(body.kind)
    if (body.kind !== undefined && !SHELL_KINDS.includes(body.kind)) {
      throw httpError(400, 'Invalid interpreter kind')
    }
    const interpreter = body.interpreter === undefined
      ? existing?.interpreter ?? ''
      : boundedText(body.interpreter, 'Interpreter', MAX_INTERPRETER)
    let enabled
    if (body.enabled === undefined) enabled = existing?.enabled ?? true
    else if (typeof body.enabled === 'boolean') enabled = body.enabled
    else throw httpError(400, 'Enabled must be a boolean')
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
      : this.data.presets.map((candidate) => candidate.id === preset.id ? preset : candidate)
    const activeId = existing === undefined ? preset.id : this.data.activeId ?? preset.id
    const changed = existing === undefined ||
      existing.command !== preset.command ||
      existing.cwd !== preset.cwd ||
      existing.kind !== preset.kind ||
      existing.interpreter !== preset.interpreter ||
      existing.enabled !== preset.enabled
    await this.commit({ version: STORE_VERSION, activeId, presets })
    if (!changed) return this.snapshot()
    if (preset.enabled) {
      await this.startPreset(preset.id)
    } else if (!(await this.stopPreset(preset.id))) {
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
    this.processes.delete(id)
    const presets = this.data.presets.filter((preset) => preset.id !== id)
    const activeId = this.data.activeId === id ? presets[0]?.id ?? null : this.data.activeId
    await this.commit({ version: STORE_VERSION, activeId, presets })
    return this.snapshot()
  }

  /** Select a preset for display and start it when it is enabled and stopped. */
  async select(payload) {
    const id = text(payload?.id)
    if (id === '') throw httpError(400, 'Preset id is required')
    const preset = this.data.presets.find((candidate) => candidate.id === id)
    if (preset === undefined) throw httpError(404, 'Preset not found')
    if (this.data.activeId !== id) {
      await this.commit({ version: STORE_VERSION, activeId: id, presets: this.data.presets })
    }
    if (preset.enabled === true && text(preset.command) !== '') {
      const record = this.processes.get(id)
      if (this.canStart(record)) await this.startPreset(id)
    }
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
      await this.commit({ version: STORE_VERSION, activeId: this.data.activeId, presets })
    }
    if (enabled) {
      const record = this.processes.get(id)
      if (this.canStart(record)) await this.startPreset(id)
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
    await this.commit({ version: STORE_VERSION, activeId: this.data.activeId, presets })
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

  /** Stop every managed range when the plugin is unloaded. */
  async dispose() {
    this.closing = true
    try {
      if (!(await this.stopAll())) {
        this.logger.warn(`[${SCOPE}] some process ranges did not settle during plugin teardown`)
      }
    } catch (error) {
      this.logger.warn(`[${SCOPE}] process teardown failed: ${errorText(error)}`)
    }
  }
}

/** @returns a trimmed, bounded text field. */
function boundedText(value, label, limit) {
  if (typeof value !== 'string') throw httpError(400, `${label} must be a string`)
  if (value.includes('\0')) throw httpError(400, `${label} must not contain NUL characters`)
  const result = value.trim()
  if (result.length > limit) throw httpError(400, `${label} is longer than ${limit} characters`)
  return result
}

/** @returns a bounded string field without trimming. */
function boundedString(value, label, limit) {
  if (typeof value !== 'string') throw httpError(400, `${label} must be a string`)
  if (value.includes('\0')) throw httpError(400, `${label} must not contain NUL characters`)
  if (value.length > limit) throw httpError(400, `${label} is longer than ${limit} characters`)
  return value
}
