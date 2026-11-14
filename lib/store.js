import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import {
  MAX_COMMAND,
  MAX_CWD,
  MAX_ID,
  MAX_INTERPRETER,
  MAX_NAME,
  MAX_PRESETS,
  MAX_STORE_BYTES,
  STORE_VERSION,
} from './constants.js'
import { normalizeShellKind } from './shell.js'

const ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${MAX_ID}}$`, 'u')

/** @returns an empty store document. */
export function emptyStore() {
  return { version: STORE_VERSION, activeId: null, presets: [] }
}

/** @returns trimmed text for strings, otherwise an empty string. */
function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Read one persisted text field.
 * @param value - stored value.
 * @param limit - maximum length.
 * @param trim - whether surrounding whitespace is removed.
 * @returns the cleaned value.
 */
function field(value, limit, trim = true) {
  if (typeof value !== 'string') return ''
  const result = (trim ? value.trim() : value).replace(/\0/gu, '')
  return result.slice(0, limit)
}

/** @returns a valid preset id, or an empty string. */
function presetId(value, seen) {
  const id = text(value)
  return ID_PATTERN.test(id) && !seen.has(id) ? id : ''
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
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const id = presetId(raw.id, seen) || randomUUID()
  seen.add(id)
  const command = field(raw.command, MAX_COMMAND, false)
  return {
    id,
    name: field(raw.name, MAX_NAME) || `Preset ${index + 1}`,
    command,
    cwd: field(raw.cwd, MAX_CWD),
    kind: normalizeShellKind(raw.kind),
    interpreter: field(raw.interpreter, MAX_INTERPRETER),
    enabled: raw.enabled === true && command.trim() !== '',
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
  const rawPresets = Array.isArray(source.presets) ? source.presets.slice(0, MAX_PRESETS) : []
  const seen = new Set()
  const presets = rawPresets
    .map((raw, index) => normalizePreset(raw, index, seen))
    .filter((preset) => preset !== undefined)
  const activeId = presets.some((preset) => preset.id === source.activeId)
    ? source.activeId
    : presets[0]?.id ?? null
  return { version: STORE_VERSION, activeId, presets }
}

/**
 * Read and normalize the store.
 * @param path - store path.
 * @returns the normalized document.
 */
export async function readStore(path) {
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`the preset store is not a regular file: ${path}`)
  if (info.size > MAX_STORE_BYTES) throw new Error(`the preset store is larger than ${MAX_STORE_BYTES} bytes`)
  const parsed = JSON.parse(await readFile(path, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('the preset store must be a JSON object')
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
 * Write the store through a temporary file so a crash cannot leave a partial
 * document, and a concurrent reader never observes one.
 * @param path - store path.
 * @param data - store document.
 */
export async function writeStore(path, data) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  try {
    await rename(temporary, path)
  } catch (error) {
    await unlink(temporary).catch(() => {})
    throw error
  }
}

/**
 * Build the first store from the optional configured command. Without one the
 * store starts empty, so a fresh install shows the empty-preset state instead
 * of a blank placeholder preset.
 * @param command - configured command.
 * @returns a one-preset store document, or an empty one.
 */
export function seedStore(command) {
  const value = text(command)
  if (value === '') return emptyStore()
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
      enabled: true,
      updatedAt: Date.now(),
    }],
  }
}
