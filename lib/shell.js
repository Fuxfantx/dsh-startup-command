import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Set the redirected console streams to UTF-8 before the user command runs. */
const UTF8_PREAMBLE = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ' +
  '$OutputEncoding = [Console]::OutputEncoding'

const WINDOWS = process.platform === 'win32'

/** @returns a non-empty environment value, or an empty string. */
function environment(name) {
  return process.env[name] ?? ''
}

/** @returns the joined path, or an empty string when a part is missing. */
function under(root, ...parts) {
  return root === '' ? '' : join(root, ...parts)
}

/** @returns the Python installs below `%LOCALAPPDATA%\Programs\Python`, newest first. */
async function localPythonInstalls() {
  const root = under(environment('LOCALAPPDATA'), 'Programs', 'Python')
  if (root === '') return []
  try {
    const entries = await readdir(root)
    return entries.sort().reverse().map((name) => join(root, name, 'python.exe'))
  } catch {
    return []
  }
}

/** Interpreter table: label, PATH names, absolute fallbacks, and argv. */
const SHELLS = {
  powershell: {
    label: 'PowerShell',
    names: () => (WINDOWS ? ['powershell.exe', 'pwsh.exe'] : ['pwsh']),
    paths: () => (WINDOWS
      ? [under(environment('SystemRoot'), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')]
      : ['/usr/local/bin/pwsh', '/usr/bin/pwsh', '/opt/homebrew/bin/pwsh']),
    argv: (executable, command) => {
      const args = [executable, '-NoLogo', '-NoProfile', '-NonInteractive']
      if (WINDOWS) args.push('-ExecutionPolicy', 'Bypass')
      args.push('-Command', `${UTF8_PREAMBLE}\n${command}`)
      return args
    },
  },
  cmd: {
    label: 'CMD',
    names: () => [environment('ComSpec') || 'cmd.exe'],
    paths: () => (WINDOWS ? [under(environment('SystemRoot'), 'System32', 'cmd.exe')] : []),
    argv: (executable, command) => [executable, '/d', '/s', '/c', `chcp 65001>nul & ${command}`],
  },
  bash: {
    label: 'Bash',
    names: () => (WINDOWS ? ['bash.exe'] : ['bash']),
    paths: () => (WINDOWS
      ? [
          under(environment('ProgramFiles'), 'Git', 'bin', 'bash.exe'),
          under(environment('LOCALAPPDATA'), 'Programs', 'Git', 'bin', 'bash.exe'),
          under(environment('SystemRoot'), 'System32', 'bash.exe'),
        ]
      : ['/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash', '/opt/homebrew/bin/bash']),
    argv: (executable, command) => [executable, '-lc', command],
  },
  python: {
    label: 'Python',
    names: () => (WINDOWS ? ['python.exe', 'python3.exe', 'py.exe'] : ['python3', 'python']),
    paths: () => (WINDOWS
      ? localPythonInstalls()
      : Promise.resolve(['/usr/bin/python3', '/usr/local/bin/python3', '/usr/bin/python'])),
    argv: (executable, command) => [executable, '-u', '-c', command],
  },
}

/** Supported preset kinds, in UI order. */
export const SHELL_KINDS = Object.keys(SHELLS)

/**
 * @param value - candidate kind.
 * @returns a supported kind, defaulting to PowerShell.
 */
export function normalizeShellKind(value) {
  return Object.hasOwn(SHELLS, value) ? value : 'powershell'
}

/** @returns the canonical display name for a shell kind. */
export function shellLabel(kind) {
  return SHELLS[normalizeShellKind(kind)].label
}

/**
 * Resolve the executable for one preset. An explicit interpreter is the only
 * candidate; otherwise the documented names are tried first and the known
 * absolute install locations last, so a preset still runs when the executable
 * is installed outside `PATH`.
 * @param subprocess - Host subprocess service.
 * @param preset - preset holding `kind` and optional `interpreter`.
 * @returns the normalized kind and resolved executable.
 */
export async function resolveShell(subprocess, preset) {
  const kind = normalizeShellKind(preset.kind)
  const spec = SHELLS[kind]
  const explicit = (typeof preset.interpreter === 'string' ? preset.interpreter.trim() : '')
    .replace(/^"(.*)"$/u, '$1')
  if (kind === 'cmd' && !WINDOWS && explicit === '') {
    throw new Error('CMD presets require Windows or an interpreter path')
  }
  const candidates = explicit !== '' ? [explicit] : [...spec.names(), ...(await spec.paths())]
  let failure
  for (const candidate of candidates) {
    if (candidate === '') continue
    try {
      return { kind, executable: await subprocess.resolveExecutable(candidate, process.env) }
    } catch (error) {
      failure = error
    }
  }
  if (failure !== undefined) throw failure
  throw new Error(`Cannot find a ${spec.label} executable`)
}

/**
 * Build argv for one shell kind.
 * @param kind - normalized kind.
 * @param executable - resolved executable.
 * @param command - user command.
 * @returns the complete argv.
 */
export function buildArgv(kind, executable, command) {
  return SHELLS[normalizeShellKind(kind)].argv(executable, command)
}
