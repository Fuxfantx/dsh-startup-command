import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  MAX_COMMAND,
  MAX_CWD,
  MAX_ID,
  MAX_INTERPRETER,
  MAX_NAME,
  MAX_PRESETS,
  MAX_STORE_BYTES,
  STORE_FILE,
  STORE_VERSION,
} from './constants.js'
import { normalizeShellKind } from './shell.js'

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u

/** @returns an empty store document. */
export function emptyStore() {
  return { version: STORE_VERSION, activeId: null, presets: [] }
}

/** @returns trimmed text for strings, otherwise an empty string. */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** @returns a valid preset id, or an empty string. */
function normalizeId(value) {
  const id = text(value)
  return id.length <= MAX_ID && ID_PATTERN.test(id) ? id : ''
}

/** @returns a finite timestamp, or the current time. */
function timestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Date.now()
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
  let id = normalizeId(raw.id)
  while (id === '' || seen.has(id)) id = randomUUID()
  seen.add(id)
  return {
    id,
    name: text(raw.name).slice(0, MAX_NAME) || `Preset ${index + 1}`,
    command: typeof raw.command === 'string' ? raw.command.slice(0, MAX_COMMAND) : '',
    cwd: text(raw.cwd).slice(0, MAX_CWD),
    kind: normalizeShellKind(raw.kind),
    interpreter: (text(raw.interpreter) || text(raw.powershell)).slice(0, MAX_INTERPRETER),
    enabled: raw.enabled === true,
    updatedAt: timestamp(raw.updatedAt),
  }
}

/**
 * Normalize a complete persisted document.
 * @param parsed - parsed JSON value.
 * @returns a valid store document.
 */
export function normalizeStore(parsed) {
  const source = parsed !== null && typeof parsed === 'object' ? parsed : {}
  const allPresets = Array.isArray(source.presets) ? source.presets : []
  const rawPresets = allPresets.slice(0, MAX_PRESETS)
  const seen = new Set()
  const presets = []
  for (let index = 0; index < rawPresets.length; index += 1) {
    const preset = normalizePreset(rawPresets[index], index, seen)
    if (preset !== undefined) presets.push(preset)
  }
  const activeId = typeof source.activeId === 'string' && presets.some((preset) => preset.id === source.activeId)
    ? source.activeId
    : presets[0]?.id ?? null
  const legacy = !allPresets.some((preset) => {
    return preset !== null && typeof preset === 'object' && Object.hasOwn(preset, 'enabled')
  })
  if (legacy) for (const preset of presets) preset.enabled = preset.id === activeId
  for (const preset of presets) {
    if (preset.enabled && text(preset.command) === '') preset.enabled = false
  }
  return { version: STORE_VERSION, activeId, presets }
}

/**
 * Read and normalize the store.
 * @param path - store path.
 * @returns the normalized document.
 */
export async function readStore(path) {
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`preset store is not a regular file: ${path}`)
  if (info.size > MAX_STORE_BYTES) throw new Error(`preset store is larger than ${MAX_STORE_BYTES} bytes`)
  const raw = await readFile(path, 'utf8')
  if (Buffer.byteLength(raw, 'utf8') > MAX_STORE_BYTES) {
    throw new Error(`preset store is larger than ${MAX_STORE_BYTES} bytes`)
  }
  const parsed = JSON.parse(raw)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('preset store must be a JSON object')
  }
  return normalizeStore(parsed)
}

/**
 * Move a damaged store aside so it is never overwritten silently.
 * @param path - store path.
 * @returns the backup path.
 */
export async function backupStore(path) {
  const backup = `${path}.broken-${Date.now()}-${randomUUID()}`
  await rename(path, backup)
  return backup
}

/**
 * Write the store atomically, falling back to a direct write when rename is
 * unavailable (for example on a locked Windows destination).
 * @param path - store path.
 * @param data - store document.
 */
export async function writeStore(path, data) {
  await mkdir(dirname(path), { recursive: true })
  const body = `${JSON.stringify(data, null, 2)}\n`
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
  try {
    await rename(temporary, path)
  } catch {
    try {
      await writeFile(path, body, { encoding: 'utf8', mode: 0o600 })
    } finally {
      await unlink(temporary).catch(() => {})
    }
  }
}

/**
 * Build the first store from the optional configured command.
 * @param command - configured command.
 * @returns a one-preset store document.
 */
export function seedStore(command) {
  const value = text(command)
  const id = randomUUID()
  return {
    version: STORE_VERSION,
    activeId: id,
    presets: [{
      id,
      name: 'Default',
      command: value,
      cwd: '',
      kind: 'powershell',
      interpreter: '',
      enabled: value !== '',
      updatedAt: Date.now(),
    }],
  }
}

/**
 * Remove stale files created by older plugin versions.
 * @param directory - profile directory.
 */
export async function removeStaleFiles(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }
  const stale = entries.filter((entry) => {
    if (!entry.isFile()) return false
    return (entry.name.startsWith('.startup-') && entry.name.endsWith('.pid')) ||
      (entry.name.startsWith(`${STORE_FILE}.`) && entry.name.endsWith('.tmp'))
  })
  await Promise.all(stale.map((entry) => unlink(join(directory, entry.name)).catch(() => {})))
}
