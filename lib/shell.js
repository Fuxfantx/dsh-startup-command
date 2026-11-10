import { readdirSync, statSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

/** Supported preset kinds, in UI order. */
export const SHELL_KINDS = ['powershell', 'cmd', 'bash', 'python']
const SHELL_KIND_SET = new Set(SHELL_KINDS)

/** Set the redirected console streams to UTF-8 before the user command runs. */
const UTF8_PREAMBLE = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ' +
  '$OutputEncoding = [Console]::OutputEncoding'

/**
 * @param value - candidate kind.
 * @returns a supported kind, defaulting to PowerShell.
 */
export function normalizeShellKind(value) {
  return SHELL_KIND_SET.has(value) ? value : 'powershell'
}

/** @returns the canonical display name for a shell kind. */
export function shellLabel(kind) {
  return kind === 'cmd' ? 'CMD' : kind === 'bash' ? 'Bash' : kind === 'python' ? 'Python' : 'PowerShell'
}

/** @returns an absolute file path, or an empty string when it is not a file. */
function isFile(path) {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/** @returns a non-empty environment value, or the fallback. */
function environmentValue(name, fallback = '') {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() !== '' ? value : fallback
}

/** @returns the Windows PowerShell install path, or an empty string. */
function fallbackPowerShell() {
  if (process.platform === 'win32') {
    const root = environmentValue('SystemRoot')
    if (root === '') return ''
    const candidate = resolve(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    return isFile(candidate) ? candidate : ''
  }
  for (const candidate of ['/usr/local/bin/pwsh', '/usr/bin/pwsh', '/opt/homebrew/bin/pwsh']) {
    if (isFile(candidate)) return candidate
  }
  return ''
}

/** @returns the Windows command processor, or an empty string. */
function fallbackCmd() {
  if (process.platform !== 'win32') return ''
  const comspec = environmentValue('ComSpec')
  if (comspec !== '' && isFile(comspec)) return comspec
  const root = environmentValue('SystemRoot')
  if (root === '') return ''
  const candidate = resolve(root, 'System32', 'cmd.exe')
  return isFile(candidate) ? candidate : ''
}

/** @returns a Bash install path, or an empty string. */
function fallbackBash() {
  const candidates = process.platform === 'win32'
    ? [
        resolve(environmentValue('ProgramFiles', 'C:\\Program Files'), 'Git', 'bin', 'bash.exe'),
        resolve(environmentValue('LOCALAPPDATA', 'C:\\'), 'Programs', 'Git', 'bin', 'bash.exe'),
        resolve(environmentValue('SystemRoot', 'C:\\Windows'), 'System32', 'bash.exe'),
      ]
    : ['/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash', '/opt/homebrew/bin/bash']
  return candidates.find(isFile) ?? ''
}

/** @returns a Python install path from the Windows user install tree, or an empty string. */
function fallbackPython() {
  if (process.platform === 'win32') {
    const localAppData = environmentValue('LOCALAPPDATA')
    if (localAppData === '') return ''
    const root = join(localAppData, 'Programs', 'Python')
    let entries
    try {
      entries = readdirSync(root, { withFileTypes: true })
    } catch {
      return ''
    }
    entries.sort((left, right) => right.name.localeCompare(left.name))
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      for (const name of ['python.exe', 'python3.exe']) {
        const candidate = join(root, entry.name, name)
        if (isFile(candidate)) return candidate
      }
    }
    return ''
  }
  for (const candidate of ['/usr/bin/python3', '/usr/local/bin/python3', '/usr/bin/python']) {
    if (isFile(candidate)) return candidate
  }
  return ''
}

const FALLBACKS = {
  powershell: fallbackPowerShell,
  cmd: fallbackCmd,
  bash: fallbackBash,
  python: fallbackPython,
}

/** @returns the PATH-lookup names tried for a kind, in order. */
function defaultCandidates(kind) {
  if (kind === 'cmd') return [environmentValue('ComSpec', 'cmd.exe')]
  if (kind === 'powershell') return process.platform === 'win32' ? ['powershell.exe', 'pwsh.exe'] : ['pwsh']
  if (kind === 'bash') return process.platform === 'win32' ? ['bash.exe'] : ['bash']
  return process.platform === 'win32' ? ['python.exe', 'python3.exe', 'py.exe'] : ['python3', 'python']
}

/**
 * Resolve the executable for one preset.
 * @param subprocess - Host subprocess service.
 * @param preset - preset holding `kind` and optional `interpreter`.
 * @returns the normalized kind and absolute executable.
 */
export async function resolveShell(subprocess, preset) {
  const kind = normalizeShellKind(preset.kind)
  const explicit = typeof preset.interpreter === 'string'
    ? preset.interpreter.trim().replace(/^"(.*)"$/u, '$1')
    : ''
  if (kind === 'cmd' && process.platform !== 'win32' && explicit === '') {
    throw new Error('CMD presets require Windows or an explicit interpreter')
  }
  const candidates = explicit === '' ? defaultCandidates(kind) : [explicit]
  let lastError
  for (const candidate of candidates) {
    try {
      return { kind, executable: await subprocess.resolveExecutable(candidate, process.env) }
    } catch (error) {
      lastError = error
    }
  }
  if (explicit === '') {
    const fallback = FALLBACKS[kind]()
    if (fallback !== '') return { kind, executable: fallback }
  }
  throw lastError ?? new Error(`Cannot resolve the ${kind} executable`)
}

/**
 * Build argv for one shell kind.
 * @param kind - normalized kind.
 * @param executable - resolved executable.
 * @param command - user command.
 * @returns the complete argv.
 */
export function buildArgv(kind, executable, command) {
  if (kind === 'cmd') {
    return [executable, '/d', '/s', '/c', `chcp 65001>nul & ${command}`]
  }
  if (kind === 'bash') {
    return [executable, '-lc', command]
  }
  if (kind === 'python') {
    return [executable, '-u', '-c', command]
  }
  const args = [executable, '-NoLogo', '-NoProfile', '-NonInteractive']
  if (process.platform === 'win32') args.push('-ExecutionPolicy', 'Bypass')
  args.push('-Command', `${UTF8_PREAMBLE}\n${command}`)
  return args
}

/**
 * @param path - absolute path.
 * @returns whether the path is an existing directory.
 */
export async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}
