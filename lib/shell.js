import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/** Set the redirected console streams to UTF-8 before the user command runs. */
const UTF8_PREAMBLE = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); ' +
  '$OutputEncoding = [Console]::OutputEncoding'

const WINDOWS = process.platform === 'win32'

/** @returns an environment value, or an empty string. */
function environment(name) {
  return process.env[name] ?? ''
}

/** @returns the joined path, or an empty string when the root is missing. */
function under(root, ...parts) {
  return root === '' ? '' : join(root, ...parts)
}

/** @returns the harness home: `$DSH_HOME` when set, otherwise `~/.dsh`. */
function dshHome() {
  const configured = environment('DSH_HOME').trim()
  return configured === '' ? join(homedir(), '.dsh') : configured
}

/**
 * Python executables inside a primary-runtime payload (`runtime.json` +
 * `dependencies/`), which Desktop provisions for its tooling.
 * @param root - payload directory, or an empty string.
 * @returns absolute interpreter candidates.
 */
function primaryRuntimePythons(root) {
  if (root === '') return []
  return WINDOWS
    ? [join(root, 'dependencies', 'python', 'python.exe')]
    : [join(root, 'dependencies', 'python', 'bin', 'python3'), join(root, 'dependencies', 'python', 'bin', 'python')]
}

/** @returns bundled Python candidates, best first. */
function bundledPythons() {
  const source = environment('DSH_PRIMARY_RUNTIME').trim()
  const installed = join(dshHome(), 'dsh-runtimes', 'dsh-primary-runtime')
  return [...new Set([...primaryRuntimePythons(source), ...primaryRuntimePythons(installed)])]
}

/** @returns a comparable number for a `Python312`-style directory, or undefined. */
function pythonVersion(name) {
  const match = /^Python\s*([\d.]+)$/iu.exec(name)
  if (match === null) return undefined
  const value = Number(match[1].replace(/\./gu, ''))
  return Number.isFinite(value) ? value : undefined
}

/** @returns the Python installs below `%LOCALAPPDATA%\Programs\Python`, newest first. */
async function localPythonInstalls() {
  if (!WINDOWS) return []
  const root = under(environment('LOCALAPPDATA'), 'Programs', 'Python')
  if (root === '') return []
  try {
    return (await readdir(root))
      .map((name) => ({ name, version: pythonVersion(name) }))
      .filter((entry) => entry.version !== undefined)
      .sort((left, right) => right.version - left.version)
      .map((entry) => join(root, entry.name, 'python.exe'))
  } catch {
    return []
  }
}

/** @returns PowerShell candidates: pwsh 7 first, then inbox Windows PowerShell 5.1. */
function powershellCandidates() {
  if (!WINDOWS) return ['pwsh', '/usr/local/bin/pwsh', '/usr/bin/pwsh', '/opt/homebrew/bin/pwsh']
  return [
    under(environment('ProgramFiles'), 'PowerShell', '7', 'pwsh.exe'),
    'pwsh.exe',
    under(environment('SystemRoot'), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ].filter((value) => value !== '')
}

/** @returns Python candidates: bundled runtime, PATH names, then known local installs. */
async function pythonCandidates() {
  const bundled = bundledPythons()
  if (WINDOWS) {
    return [...bundled, 'python.exe', 'python3.exe', 'py.exe', ...await localPythonInstalls()]
  }
  return [...bundled, 'python3', 'python', '/usr/bin/python3', '/usr/local/bin/python3', '/usr/bin/python']
}

/**
 * Interpreter table. `candidates` runs only when the preset names no
 * interpreter; an explicit interpreter is the only candidate.
 */
const SHELLS = {
  powershell: {
    label: 'PowerShell',
    candidates: powershellCandidates,
    argv: (executable, command) => {
      const args = [executable, '-NoLogo', '-NoProfile', '-NonInteractive']
      if (WINDOWS) args.push('-ExecutionPolicy', 'Bypass')
      args.push('-Command', `${UTF8_PREAMBLE}; ${command}`)
      return args
    },
  },
  cmd: {
    label: 'CMD',
    candidates: () => WINDOWS
      ? [environment('ComSpec') || 'cmd.exe', under(environment('SystemRoot'), 'System32', 'cmd.exe')]
        .filter((value) => value !== '')
      : [],
    argv: (executable, command) => [executable, '/d', '/s', '/c', `chcp 65001>nul & ${command}`],
  },
  bash: {
    label: 'Bash',
    candidates: () => WINDOWS
      ? ['bash.exe', under(environment('ProgramFiles'), 'Git', 'bin', 'bash.exe'),
        under(environment('LOCALAPPDATA'), 'Programs', 'Git', 'bin', 'bash.exe'),
        under(environment('SystemRoot'), 'System32', 'bash.exe')].filter((value) => value !== '')
      : ['bash', '/bin/bash', '/usr/bin/bash', '/usr/local/bin/bash', '/opt/homebrew/bin/bash'],
    argv: (executable, command) => [executable, '-lc', command],
  },
  python: {
    label: 'Python',
    candidates: pythonCandidates,
    env: { PYTHONIOENCODING: 'utf-8' },
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

/** Conventional executable names inside an interpreter directory, per kind. */
const DIRECTORY_BINARIES = {
  powershell: WINDOWS ? ['pwsh.exe', 'powershell.exe'] : ['pwsh'],
  cmd: WINDOWS ? ['cmd.exe'] : [],
  bash: WINDOWS ? ['bash.exe', 'bash'] : ['bash'],
  python: WINDOWS ? ['python.exe', 'python3.exe'] : ['python3', 'python'],
}

/**
 * Expand an explicitly configured interpreter. A file is used as-is; a
 * directory maps to the conventional executable inside it, so both
 * `...\PowerShell\7\pwsh.exe` and `...\PowerShell\7` work.
 * @param value - configured interpreter path.
 * @param kind - normalized shell kind.
 * @returns interpreter candidates for the explicit value.
 */
async function expandExplicit(value, kind) {
  try {
    if (!(await stat(value)).isDirectory()) return [value]
  } catch {
    return [value]
  }
  return DIRECTORY_BINARIES[kind].map((name) => join(value, name))
}

/**
 * Resolve a relative explicit path against the preset's working directory,
 * while leaving bare PATH names such as `pwsh` alone.
 * @param value - configured interpreter value.
 * @param cwd - preset working directory.
 * @returns an absolute path or a PATH name.
 */
function explicitPath(value, cwd) {
  const unquoted = value.replace(/^"(.*)"$/u, '$1')
  return isAbsolute(unquoted) || !/[\\/]/u.test(unquoted) ? unquoted : resolve(cwd, unquoted)
}

/**
 * Resolve the executable for one preset. An explicit interpreter is the only
 * candidate; otherwise the kind's documented order applies (pwsh 7 before
 * Windows PowerShell 5.1, the bundled Python runtime before system Python).
 * @param subprocess - Host subprocess service.
 * @param preset - preset holding `kind` and optional `interpreter`.
 * @param cwd - preset working directory, used for a relative interpreter path.
 * @returns the normalized kind, resolved executable, label, and environment additions.
 */
export async function resolveShell(subprocess, preset, cwd = process.cwd()) {
  const kind = normalizeShellKind(preset.kind)
  const spec = SHELLS[kind]
  const explicit = explicitPath(
    typeof preset.interpreter === 'string' ? preset.interpreter.trim() : '',
    cwd,
  )
  if (kind === 'cmd' && !WINDOWS && explicit === '') {
    throw new Error('CMD presets require Windows or an interpreter path')
  }
  const candidates = explicit !== '' ? await expandExplicit(explicit, kind) : await spec.candidates()
  let failure
  for (const value of candidates) {
    if (value === '') continue
    try {
      const executable = await subprocess.resolveExecutable(value, process.env)
      return { kind, executable, label: spec.label, env: spec.env }
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
