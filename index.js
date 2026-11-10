/**
 * Host half of the startup-command bundle.
 *
 * Owns the preset store, managed preset processes, and their bounded output
 * buffers. The browser half talks to this file through the same-origin
 * `/startup-command/api` prefix.
 *
 * The command is launched through `ctx.subprocess`, whose local provider owns a
 * Windows Job object (and the platform equivalent elsewhere): the provider
 * kills the whole managed range when the plugin is disposed or when the Host
 * process exits, so child processes created by the script do not survive DSH.
 *
 * @module dsh-startup-command
 */

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { StringDecoder } from 'node:string_decoder'

/** Loader row id, log scope, and the browser route prefix. */
const SCOPE = 'startup-command'
const API_PREFIX = '/startup-command/api'

/** Presets live beside the profile so they survive DSH restarts. */
const STORE_FILE = 'startup-command-presets.json'

/** Bounds for persisted text and the live output ring. */
const MAX_COMMAND = 20000
const MAX_NAME = 80
const MAX_CWD = 500
const MAX_INTERPRETER = 200
const MAX_OUTPUT = 262144
const MAX_BODY = 1_000_000

/** Delay between launching two enabled presets. */
const START_INTERVAL_MS = 500

/** Default lifecycle timings. */
const DEFAULT_GRACE_MS = 3000
const DEFAULT_CLEANUP_MS = 10000

/** Set the redirected console streams to UTF-8 before the user command runs. */
const UTF8_PREAMBLE =
  '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ' +
  '$OutputEncoding = [Console]::OutputEncoding'

/** Services that must exist before the command can be launched and served. */
export const inject = ['subprocess', 'webServer', 'connection']

/**
 * Trim a configuration string without turning non-strings into text.
 * @param value - candidate configuration value.
 * @returns the trimmed string, or an empty string.
 */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Read a finite number from configuration.
 * @param value - candidate numeric value.
 * @param fallback - value used when `value` is absent or invalid.
 * @param minimum - smallest accepted value.
 * @returns the accepted number.
 */
function number(value, fallback, minimum) {
  const parsed = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback
}

/**
 * Obtain a logger without making the plugin depend on a specific Cordis
 * logger shape.
 * @param ctx - plugin context.
 * @returns an object with best-effort info, warn, and error methods.
 */
function loggerFor(ctx) {
  try {
    const scoped = ctx.logger(SCOPE)
    if (scoped !== undefined && scoped !== null && typeof scoped.info === 'function') return scoped
  } catch {
    // Fall through to the context logger.
  }
  const base = ctx.logger ?? {}
  return {
    info: (message) => base.info?.(message),
    warn: (message) => base.warn?.(message),
    error: (message) => base.error?.(message),
  }
}

/**
 * Create one HTTP-shaped error.
 * @param status - response status.
 * @param message - user-facing reason.
 * @returns the error.
 */
function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

/**
 * Whether a path is an existing directory.
 * @param path - absolute path.
 * @returns true when the path is a directory.
 */
function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * Locate the Windows PowerShell binary when PATH lookup fails.
 * @returns an absolute executable path, or an empty string.
 */
function fallbackPowerShell() {
  const root = text(process.env.SystemRoot)
  if (root === '') return ''
  const candidate = resolve(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  return existsSync(candidate) ? candidate : ''
}

/** Canonical display name for one shell kind. */
function shellLabel(kind) {
  return kind === 'cmd' ? 'CMD' : kind === 'bash' ? 'Bash' : kind === 'python' ? 'Python' : 'PowerShell'
}

/** Fallback executable for a shell kind when PATH lookup fails. */
function fallbackShell(kind) {
  if (kind === 'powershell') return fallbackPowerShell()
  if (kind === 'cmd') {
    const comspec = text(process.env.ComSpec)
    if (comspec !== '' && existsSync(comspec)) return comspec
    const root = text(process.env.SystemRoot)
    const candidate = root === '' ? '' : resolve(root, 'System32', 'cmd.exe')
    return existsSync(candidate) ? candidate : ''
  }
  if (kind === 'bash') {
    for (const candidate of [
      resolve(text(process.env.ProgramFiles) || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
      resolve(text(process.env.SystemRoot) || 'C:\\Windows', 'System32', 'bash.exe'),
    ]) {
      if (existsSync(candidate)) return candidate
    }
    return ''
  }
  for (const name of ['python.exe', 'python3.exe']) {
    const candidate = resolve(text(process.env.LOCALAPPDATA) || 'C:\\', 'Programs', 'Python', name)
    if (existsSync(candidate)) return candidate
  }
  return ''
}

/** Kill one Windows process tree, including Job/breakaway descendants. */
function killWindowsTree(pid) {
  const root = text(process.env.SystemRoot)
  const absolute = root === '' ? '' : resolve(root, 'System32', 'taskkill.exe')
  const executable = absolute !== '' && existsSync(absolute) ? absolute : 'taskkill.exe'
  return new Promise((resolveKill) => {
    execFile(executable, ['/T', '/F', '/PID', String(pid)], { windowsHide: true, timeout: 10000 }, () => resolveKill())
  })
}

/** Read a numeric PID file, if present. */
async function readPid(path) {
  if (path === '') return 0
  try {
    const raw = (await readFile(path, 'utf8')).trim()
    if (!/^\d+$/u.test(raw)) return 0
    const value = Number.parseInt(raw, 10)
    return Number.isSafeInteger(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

/**
 * Normalize one persisted preset.
 * @param raw - stored value.
 * @param index - position, used for a fallback name.
 * @param seen - ids already accepted.
 * @returns a valid preset, or undefined for a non-object.
 */
function normalizePreset(raw, index, seen) {
  if (raw === null || typeof raw !== 'object') return undefined
  let id = typeof raw.id === 'string' ? raw.id.trim() : ''
  if (id === '' || id.length > MAX_NAME || seen.has(id)) id = randomUUID()
  seen.add(id)
  const name = text(raw.name).slice(0, MAX_NAME) || `Preset ${index + 1}`
  const command = typeof raw.command === 'string' ? raw.command.slice(0, MAX_COMMAND) : ''
  const cwd = text(raw.cwd).slice(0, MAX_CWD)
  const kind = ['powershell', 'cmd', 'bash', 'python'].includes(raw.kind) ? raw.kind : 'powershell'
  const interpreter = (text(raw.interpreter) || text(raw.powershell)).slice(0, MAX_INTERPRETER)
  const enabled = raw.enabled === true
  const updatedAt = typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
    ? raw.updatedAt
    : Date.now()
  return { id, name, command, cwd, kind, interpreter, enabled, updatedAt }
}

/**
 * Normalize a complete persisted document.
 * @param parsed - parsed JSON value.
 * @returns a valid store document.
 */
function normalizeStore(parsed) {
  const source = parsed !== null && typeof parsed === 'object' ? parsed : {}
  const seen = new Set()
  const presets = []
  const rawPresets = Array.isArray(source.presets) ? source.presets : []
  for (let index = 0; index < rawPresets.length; index += 1) {
    const preset = normalizePreset(rawPresets[index], index, seen)
    if (preset !== undefined) presets.push(preset)
  }
  const activeId = typeof source.activeId === 'string' && presets.some((preset) => preset.id === source.activeId)
    ? source.activeId
    : presets[0]?.id ?? null
  const legacy = !rawPresets.some((preset) => preset !== null && typeof preset === 'object' && Object.hasOwn(preset, 'enabled'))
  if (legacy) for (const preset of presets) preset.enabled = preset.id === activeId
  if (!presets.some((preset) => preset.enabled === true) && activeId !== null) {
    const active = presets.find((preset) => preset.id === activeId)
    if (active !== undefined) active.enabled = true
  }
  return { version: 1, activeId, presets }
}

/**
 * Read a bounded JSON request body.
 * @param req - Node request.
 * @returns the parsed object, or an empty object for an empty body.
 */
function readJson(req) {
  return new Promise((resolveBody, rejectBody) => {
    let size = 0
    let failed = false
    const chunks = []
    const fail = (error) => {
      if (failed) return
      failed = true
      rejectBody(error)
    }
    req.on('data', (chunk) => {
      if (failed) return
      size += chunk.length
      if (size > MAX_BODY) {
        chunks.length = 0
        fail(httpError(413, 'request body is too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (failed) return
      if (chunks.length === 0) {
        resolveBody({})
        return
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        resolveBody(parsed !== null && typeof parsed === 'object' ? parsed : {})
      } catch {
        fail(httpError(400, 'request body is not valid JSON'))
      }
    })
    req.on('error', (error) => fail(error))
    req.on('aborted', () => fail(httpError(400, 'request aborted')))
  })
}

/**
 * Write one JSON response.
 * @param res - Node response.
 * @param status - HTTP status.
 * @param body - JSON-serializable payload.
 */
function sendJson(res, status, body) {
  const textBody = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(textBody)
}

/**
 * Preset store plus the process and output state surfaced to the browser.
 */
class StartupController {
  /**
   * @param ctx - Host plugin context.
   * @param config - bundle row configuration.
   * @param logger - scoped logger.
   */
  constructor(ctx, config, logger) {
    this.ctx = ctx
    this.config = config ?? {}
    this.logger = logger
    this.profileDir = text(process.env.DSH_PROFILE_DIR)
    this.storeDir = this.profileDir === '' ? process.cwd() : this.profileDir
    this.storePath = join(this.storeDir, STORE_FILE)
    this.graceMs = number(this.config.graceMs, DEFAULT_GRACE_MS, 250)
    this.cleanupTimeoutMs = number(this.config.cleanupTimeoutMs, DEFAULT_CLEANUP_MS, 1000)

    /** @type {{ version: number, activeId: string | null, presets: Array<object> }} */
    this.data = { version: 1, activeId: null, presets: [] }
    /** id -> { handle, generation, run, output, outputBytes, seq, truncated } */
    this.processes = new Map()
    this.updatedAt = Date.now()
  }

  /** Load the store, or seed it from the legacy script on first use. */
  async load() {
    try {
      const raw = await readFile(this.storePath, 'utf8')
      this.data = normalizeStore(JSON.parse(raw))
      return
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.logger.warn(`[${SCOPE}] cannot read presets: ${String(error)}`)
        try {
          await rename(this.storePath, `${this.storePath}.broken-${Date.now()}`)
        } catch {
          // Keep the original file if the backup itself fails.
        }
      }
      this.data = this.seed()
      try {
        await this.persist(this.data)
      } catch (writeError) {
        this.logger.warn(`[${SCOPE}] cannot create the preset store: ${String(writeError)}`)
      }
    }
  }

  /** Build the first store from the optional configured command. */
  seed() {
    const command = text(this.config.command)
    const id = randomUUID()
    return {
      version: 1,
      activeId: id,
      presets: [{
        id,
        name: 'Default',
        command,
        cwd: '',
        kind: 'powershell',
        interpreter: '',
        enabled: command !== '',
        updatedAt: Date.now(),
      }],
    }
  }

  /** Write a store document atomically. */
  async persist(next) {
    await mkdir(this.storeDir, { recursive: true })
    const body = `${JSON.stringify(next, null, 2)}\n`
    const temporary = `${this.storePath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(temporary, body, 'utf8')
    try {
      await rename(temporary, this.storePath)
    } catch {
      await writeFile(this.storePath, body, 'utf8')
      try {
        await unlink(temporary)
      } catch {
        // A leftover temp file is harmless.
      }
    }
  }

  /** Persist and then publish a new document. */
  async commit(next) {
    await this.persist(next)
    this.data = next
    this.touch()
  }

  /** Record a state change for pollers. */
  touch() {
    const now = Date.now()
    this.updatedAt = now > this.updatedAt ? now : this.updatedAt + 1
  }

  /** A fresh run record. */
  blankRun(preset) {
    return {
      status: 'idle',
      presetId: preset?.id ?? null,
      presetName: preset?.name ?? '',
      startedAt: null,
      endedAt: null,
      exitCode: null,
      signal: null,
      error: null,
    }
  }

  /** A process record for one preset. */
  recordFor(id, preset) {
    let record = this.processes.get(id)
    if (record === undefined) {
      record = {
        handle: null,
        generation: 0,
        run: this.blankRun(preset),
        output: '',
        outputBytes: 0,
        seq: 0,
        truncated: false,
        pidPath: '',
      }
      this.processes.set(id, record)
    }
    return record
  }

  /** Snapshot the active output and all per-preset run states. */
  snapshot() {
    const activeId = this.data.activeId
    const active = activeId === null ? undefined : this.data.presets.find((preset) => preset.id === activeId)
    const activeRecord = activeId === null ? undefined : this.processes.get(activeId)
    const views = this.data.presets.map((preset) => {
      const record = this.processes.get(preset.id)
      return {
        preset: {
          ...preset,
          running: record?.handle !== null && record?.handle !== undefined,
          run: { ...(record?.run ?? this.blankRun(preset)) },
        },
        record,
      }
    })
    const running = views.filter((view) => view.preset.running)
    let status = 'idle'
    let error = null
    let startedAt = null
    if (running.length > 0) {
      status = 'running'
      startedAt = Math.min(...running.map((view) => view.record.run.startedAt ?? Date.now()))
    }
    if (activeRecord !== undefined && activeRecord.run.status === 'failed') {
      status = 'failed'
      error = activeRecord.run.error
    }
    for (const view of views) {
      if (view.record?.run.error && error === null) error = view.record.run.error
    }
    return {
      activeId,
      activeName: active?.name ?? '',
      presets: views.map((view) => view.preset),
      run: {
        status,
        presetId: activeId,
        presetName: active?.name ?? '',
        startedAt,
        endedAt: activeRecord?.run.endedAt ?? null,
        exitCode: activeRecord?.run.exitCode ?? null,
        signal: activeRecord?.run.signal ?? null,
        error,
      },
      runningIds: running.map((view) => view.preset.id),
      output: activeRecord?.output ?? '',
      outputSeq: activeRecord?.seq ?? 0,
      outputTruncated: activeRecord?.truncated ?? false,
      updatedAt: this.updatedAt,
    }
  }

  /** Snapshot without resending unchanged active output. */
  state(payload) {
    const view = this.snapshot()
    const sameOutput = Number.isSafeInteger(payload?.outputSeq)
      && payload.outputSeq === view.outputSeq
      && payload?.activeId === view.activeId
    return sameOutput ? { ...view, output: null, outputOmitted: true } : view
  }

  /** Append process output to one preset's ring buffer. */
  append(value, id, generation) {
    if (typeof value !== 'string' || value === '') return
    const record = this.processes.get(id)
    if (record === undefined || record.generation !== generation) return
    record.output += value
    record.outputBytes += Buffer.byteLength(value, 'utf8')
    if (record.outputBytes > MAX_OUTPUT) {
      const buffer = Buffer.from(record.output, 'utf8')
      let start = Math.max(0, buffer.length - MAX_OUTPUT)
      while (start < buffer.length && (buffer[start] & 0xc0) === 0x80) start += 1
      record.output = buffer.subarray(start).toString('utf8')
      record.outputBytes = Buffer.byteLength(record.output, 'utf8')
      record.truncated = true
    }
    record.seq += 1
    this.touch()
  }

  /** Clear the selected preset's live output. */
  clearOutput() {
    const id = this.data.activeId
    const record = id === null ? undefined : this.processes.get(id)
    if (record !== undefined) {
      record.output = ''
      record.outputBytes = 0
      record.seq += 1
      record.truncated = false
    }
    this.touch()
  }

  /** Mark a start failure for one preset. */
  failStart(id, preset, message, generation) {
    const record = this.recordFor(id, preset)
    if (record.generation !== generation) return
    record.run.status = 'failed'
    record.run.endedAt = Date.now()
    record.run.error = message
    this.append(`${message}\n`, id, generation)
    this.touch()
  }

  /** Remove a PID file without waiting for the filesystem. */
  clearPidFile(record) {
    const path = record.pidPath
    record.pidPath = ''
    if (path !== '') void unlink(path).catch(() => {})
  }

  /** Terminate one preset's managed range and wait for quiescence. */
  async stopPreset(id) {
    const record = this.processes.get(id)
    if (record === undefined) return
    if (record.handle === null) {
      record.generation += 1
      this.clearPidFile(record)
      return
    }
    record.generation += 1
    const handle = record.handle
    record.handle = null
    if (record.run.status === 'running') {
      record.run.status = 'stopped'
      record.run.endedAt = Date.now()
      record.run.error = null
      this.touch()
    }
    const pid = await readPid(record.pidPath)
    if (process.platform === 'win32' && pid > 0) await killWindowsTree(pid)
    try {
      handle.terminate()
    } catch (error) {
      this.logger.warn(`[${SCOPE}] terminate request failed for ${id}: ${String(error)}`)
    }
    try {
      await handle.waitForExit(AbortSignal.timeout(this.cleanupTimeoutMs))
    } catch (error) {
      this.logger.warn(`[${SCOPE}] timed out waiting for ${id}; retrying terminate: ${String(error)}`)
      try {
        handle.terminate()
        await handle.waitForExit(AbortSignal.timeout(this.cleanupTimeoutMs))
      } catch (retryError) {
        this.logger.warn(`[${SCOPE}] process range ${id} did not settle: ${String(retryError)}`)
      }
    }
    this.clearPidFile(record)
  }

  /** Stop every managed process range. */
  async stopAll() {
    await Promise.all([...this.processes.keys()].map((id) => this.stopPreset(id)))
  }

  /** Resolve one executable for a shell kind. */
  async resolveShell(preset) {
    const kind = preset.kind === 'cmd' || preset.kind === 'bash' || preset.kind === 'python'
      ? preset.kind
      : 'powershell'
    const explicit = text(preset.interpreter)
    const requested = explicit || (kind === 'powershell' ? 'powershell.exe' : kind === 'cmd' ? (process.env.ComSpec || 'cmd.exe') : kind === 'bash' ? 'bash.exe' : 'python.exe')
    try {
      return { kind, executable: await this.ctx.subprocess.resolveExecutable(requested, process.env) }
    } catch (error) {
      if (explicit !== '') throw error
      const executable = fallbackShell(kind)
      if (executable === '') throw error
      return { kind, executable }
    }
  }

  /** Build argv for one shell kind. */
  argvFor(kind, executable, command) {
    if (kind === 'cmd') {
      return [executable, '/d', '/s', '/c', `chcp 65001>nul & ${command}`]
    }
    if (kind === 'bash') {
      return [executable, '-lc', command]
    }
    if (kind === 'python') {
      return [executable, '-u', '-c', command]
    }
    return [executable, '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `${UTF8_PREAMBLE}\n${command}`]
  }

  /** Start one preset, replacing its own previous process only. */
  async startPreset(id) {
    const preset = this.data.presets.find((candidate) => candidate.id === id)
    if (preset === undefined) return
    await this.stopPreset(id)
    const record = this.recordFor(id, preset)
    record.run = this.blankRun(preset)
    record.output = ''
    record.outputBytes = 0
    record.seq += 1
    record.truncated = false
    const generation = ++record.generation
    this.touch()
    const command = text(preset.command)
    if (command === '') {
      this.failStart(id, preset, 'The selected preset has no command', generation)
      return
    }
    const cwd = text(preset.cwd) || this.profileDir || process.cwd()
    if (!isDirectory(cwd)) {
      this.failStart(id, preset, `Working directory does not exist: ${cwd}`, generation)
      return
    }
    let shell
    try {
      shell = await this.resolveShell(preset)
    } catch (error) {
      this.failStart(id, preset, `Cannot resolve shell: ${String(error)}`, generation)
      return
    }
    if (record.generation !== generation) return
    const pidPath = join(this.storeDir, `.startup-${id}-${Date.now()}.pid`)
    const quotedPidPath = pidPath.replaceAll("'", "''")
    const wrapped = shell.kind === 'powershell'
      ? `$__dshPidFile='${quotedPidPath}'; Set-Content -LiteralPath $__dshPidFile -Value $PID; ${command}`
      : shell.kind === 'bash'
        ? `echo $$ > '${pidPath.replaceAll("'", "'\\''")}'; ${command}`
        : shell.kind === 'python'
          ? `import os as __dsh_os; open(r'${pidPath.replaceAll("'", "\\'")}', 'w').write(str(__dsh_os.getpid())); ${command}`
          : command
    let handle
    try {
      handle = this.ctx.subprocess.spawn({
        argv: this.argvFor(shell.kind, shell.executable, wrapped),
        cwd,
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        graceMs: this.graceMs,
        env: process.env,
      })
    } catch (error) {
      this.failStart(id, preset, `Cannot start ${shell.kind}: ${String(error)}`, generation)
      return
    }
    record.pidPath = pidPath
    record.handle = handle
    record.run.status = 'running'
    record.run.startedAt = Date.now()
    this.append(`=== ${preset.name} (${shellLabel(shell.kind)}) ===\n\n`, id, generation)
    this.touch()
    const outDecoder = new StringDecoder('utf8')
    const errDecoder = new StringDecoder('utf8')
    const pipe = (stream, decoder) => {
      if (stream === undefined || stream === null) return
      stream.on('data', (chunk) => this.append(decoder.write(chunk), id, generation))
      stream.on('error', (error) => this.append(`\n[stream error] ${String(error)}\n`, id, generation))
    }
    pipe(handle.stdout, outDecoder)
    pipe(handle.stderr, errDecoder)
    handle.done.then((outcome) => {
      if (record.generation !== generation) return
      this.append(outDecoder.end(), id, generation)
      this.append(errDecoder.end(), id, generation)
      if (record.handle === handle) record.handle = null
      this.clearPidFile(record)
      record.run.endedAt = Date.now()
      record.run.exitCode = outcome.exitCode
      record.run.signal = outcome.signal
      record.run.status = outcome.exitCode === 0 ? 'exited' : 'failed'
      record.run.error = outcome.exitCode === 0
        ? null
        : outcome.exitCode === null
          ? `Process ended with signal ${String(outcome.signal)}`
          : `Process exited with code ${outcome.exitCode}`
      this.touch()
    }, (error) => {
      if (record.generation !== generation) return
      this.append(outDecoder.end(), id, generation)
      this.append(errDecoder.end(), id, generation)
      if (record.handle === handle) record.handle = null
      this.clearPidFile(record)
      record.run.status = 'failed'
      record.run.endedAt = Date.now()
      record.run.error = `Process failed: ${String(error)}`
      this.touch()
    })
  }

  /** Start enabled presets in list order, 500 ms apart. */
  async startEnabled() {
    const enabled = this.data.presets.filter((preset) => preset.enabled === true)
    for (let index = 0; index < enabled.length; index += 1) {
      const preset = enabled[index]
      if (this.processes.get(preset.id)?.handle == null) await this.startPreset(preset.id)
      if (index < enabled.length - 1) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, START_INTERVAL_MS))
      }
    }
  }

  /** Create or update a preset and restart that preset when enabled. */
  async save(payload) {
    const id = text(payload?.id)
    const name = text(payload?.name).slice(0, MAX_NAME) || 'Untitled'
    if (typeof payload?.command === 'string' && payload.command.length > MAX_COMMAND) {
      throw httpError(400, `Command is longer than ${MAX_COMMAND} characters`)
    }
    const command = typeof payload?.command === 'string' ? payload.command : ''
    const cwd = text(payload?.cwd).slice(0, MAX_CWD)
    if (cwd !== '' && !isAbsolute(cwd)) throw httpError(400, 'Working directory must be an absolute path')
    const kind = ['powershell', 'cmd', 'bash', 'python'].includes(payload?.kind) ? payload.kind : 'powershell'
    const interpreter = text(payload?.interpreter).slice(0, MAX_INTERPRETER)
    const existing = id === '' ? undefined : this.data.presets.find((preset) => preset.id === id)
    if (id !== '' && existing === undefined) throw httpError(404, 'Preset not found')
    const preset = {
      id: existing?.id ?? randomUUID(),
      name,
      command,
      cwd,
      kind,
      interpreter,
      enabled: typeof payload?.enabled === 'boolean' ? payload.enabled : existing?.enabled ?? true,
      updatedAt: Date.now(),
    }
    const changed = existing === undefined
      || existing.command !== preset.command
      || existing.cwd !== preset.cwd
      || existing.kind !== preset.kind
      || existing.interpreter !== preset.interpreter
      || existing.enabled !== preset.enabled
    const presets = existing === undefined
      ? [...this.data.presets, preset]
      : this.data.presets.map((candidate) => candidate.id === preset.id ? preset : candidate)
    const activeId = existing === undefined
      ? preset.id
      : this.data.activeId === null || this.data.activeId === preset.id
        ? preset.id
        : this.data.activeId
    await this.commit({ version: 1, activeId, presets })
    if (!changed) {
      const record = this.processes.get(preset.id)
      if (record !== undefined) record.run.presetName = preset.name
      this.touch()
      return this.snapshot()
    }
    if (preset.enabled) await this.startPreset(preset.id)
    else await this.stopPreset(preset.id)
    return this.snapshot()
  }

  /** Delete one preset and stop its process. */
  async remove(payload) {
    const id = text(payload?.id)
    if (id === '') throw httpError(400, 'Preset id is required')
    if (!this.data.presets.some((preset) => preset.id === id)) throw httpError(404, 'Preset not found')
    await this.stopPreset(id)
    this.processes.delete(id)
    const presets = this.data.presets.filter((preset) => preset.id !== id)
    const activeId = this.data.activeId === id ? presets[0]?.id ?? null : this.data.activeId
    await this.commit({ version: 1, activeId, presets })
    const next = presets.find((preset) => preset.id === activeId)
    if (next?.enabled === true && this.processes.get(next.id)?.handle == null) await this.startPreset(next.id)
    return this.snapshot()
  }

  /** Select a preset for display and start it only when it is enabled. */
  async select(payload) {
    const id = text(payload?.id)
    if (id === '') throw httpError(400, 'Preset id is required')
    const preset = this.data.presets.find((candidate) => candidate.id === id)
    if (preset === undefined) throw httpError(404, 'Preset not found')
    if (this.data.activeId !== id) {
      await this.commit({ version: 1, activeId: id, presets: this.data.presets })
    }
    if (preset.enabled === true && this.processes.get(id)?.handle == null) await this.startPreset(id)
    return this.snapshot()
  }

  /** Enable or disable one preset without changing the selected view. */
  async toggle(payload) {
    const id = text(payload?.id)
    const enabled = payload?.enabled === true
    const preset = this.data.presets.find((candidate) => candidate.id === id)
    if (preset === undefined) throw httpError(404, 'Preset not found')
    const presets = this.data.presets.map((candidate) => {
      return candidate.id === id ? { ...candidate, enabled } : candidate
    })
    await this.commit({ version: 1, activeId: this.data.activeId, presets })
    if (enabled) await this.startPreset(id)
    else await this.stopPreset(id)
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
    await this.commit({ version: 1, activeId: this.data.activeId, presets })
    return this.snapshot()
  }

  /** Restart every enabled preset after stopping all managed ranges. */
  async restart() {
    await this.stopAll()
    await this.startEnabled()
    return this.snapshot()
  }

  /** Stop every managed preset, preserving the enabled switches. */
  async stop() {
    await this.stopAll()
    return this.snapshot()
  }

  /** Clear the selected preset's live output. */
  async clear() {
    this.clearOutput()
    return this.snapshot()
  }

  /** Stop every managed range when the plugin is unloaded. */
  async dispose() {
    await this.stopAll()
  }
}

export { StartupController }


/**
 * Install the preset controller, the HTTP API, and the startup run.
 *
 * @param ctx - plugin context.
 * @param config - bundle row configuration.
 */
export async function apply(ctx, config = {}) {
  const logger = loggerFor(ctx)
  const controller = new StartupController(ctx, config, logger)

  await controller.load()
  ctx.effect(() => () => controller.dispose(), `${SCOPE}.process`)

  const api = {
    state: (payload) => controller.state(payload),
    save: (payload) => controller.save(payload),
    remove: (payload) => controller.remove(payload),
    select: (payload) => controller.select(payload),
    toggle: (payload) => controller.toggle(payload),
    move: (payload) => controller.move(payload),
    restart: () => controller.restart(),
    stop: () => controller.stop(),
    clear: () => controller.clear(),
  }

  let mutationQueue = Promise.resolve()
  const mutate = (operation) => {
    const result = mutationQueue.then(operation, operation)
    mutationQueue = result.catch(() => {})
    return result
  }
  for (const method of ['save', 'remove', 'select', 'toggle', 'move', 'restart', 'stop', 'clear']) {
    const operation = api[method]
    api[method] = (payload) => mutate(() => operation(payload))
  }

  ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req, res) => {
        if (ctx.connection.requestRejection(req) !== undefined) {
          sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
          return
        }
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: { code: 'method-error', message: 'POST only' } })
          return
        }
        const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
        const method = pathname.startsWith(`${API_PREFIX}/`)
          ? pathname.slice(API_PREFIX.length + 1)
          : ''
        try {
          if (method === '' || method.includes('/') || !Object.hasOwn(api, method)) {
            throw httpError(404, `Unknown method "${method}"`)
          }
          const payload = await readJson(req)
          const value = await api[method](payload)
          sendJson(res, 200, { ok: true, value })
        } catch (error) {
          const status = typeof error?.status === 'number' ? error.status : 500
          sendJson(res, status, {
            ok: false,
            error: {
              code: status === 500 ? 'internal' : 'request-error',
              message: error instanceof Error ? error.message : String(error),
            },
          })
        }
      },
    }), `${SCOPE}: api route`)

  try {
    await mutate(() => controller.startEnabled())
  } catch (error) {
    logger.error(`[${SCOPE}] cannot start the enabled presets: ${String(error)}`)
  }
}


