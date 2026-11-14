/**
 * Browser half of the startup-command bundle.
 *
 * Adds a left-sidebar panel entry and its main-column page. The page streams
 * the selected preset's output and manages the persisted presets through the
 * Host's same-origin API.
 *
 * @module dsh-startup-command/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-startup-command',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace prefix and the panel id shared by the sidebar row and main page. */
    const NS = 'startupCommand'
    const PANEL_ID = 'startup-command'

    /** Same-origin API path. */
    const API = '/startup-command/api'

    /** Keep in sync with the Host-side limits in lib/constants.js. */
    const LIMITS = Object.freeze({
      name: 80,
      command: 20000,
      cwd: 500,
      interpreter: 200,
    })

    /** Request budgets: a state poll must not stall the page, a mutation may wait. */
    const POLL_TIMEOUT_MS = 15000
    const ACTION_TIMEOUT_MS = 120000

    const zh = {
      'panel.title': '启动命令',
      'panel.subtitle': '查看启动输出并管理 Preset',
      'output.title': '启动输出',
      'output.empty': '当前 Preset 暂无输出。',
      'output.truncated': '输出过长，仅显示最近部分。',
      'presets.title': 'Preset',
      'presets.empty': '还没有 Preset。新建一个来开始。',
      'presets.new': '新建 Preset',
      'presets.edit': '编辑',
      'presets.delete': '删除',
      'presets.confirmDelete': '确认删除',
      'presets.moveUp': '上移',
      'presets.moveDown': '下移',
      'presets.enabled': '启用',
      'presets.disabled': '停用',
      'presets.toggleOn': '启用并启动',
      'presets.toggleOff': '停用并停止',
      'status.idle': '空闲',
      'status.running': '运行中',
      'status.exited': '已结束',
      'status.failed': '失败',
      'status.stopped': '已停止',
      'run.started': '开始于 {time}',
      'run.ended': '结束于 {time}',
      'run.exit': '退出码 {code}',
      'run.signal': '信号 {signal}',
      'action.restart': '重启',
      'action.stop': '停止',
      'action.clear': '清空输出',
      'action.save': '保存',
      'action.cancel': '取消',
      'action.new': '新建',
      'form.newTitle': '新建 Preset',
      'form.editTitle': '编辑 Preset',
      'form.name': '名称',
      'form.namePlaceholder': '例如：开发服务',
      'form.command': '启动指令',
      'form.commandPlaceholder': 'Write-Output "hello"',
      'form.kind': '解释器',
      'form.kind.powershell': 'PowerShell',
      'form.kind.cmd': 'CMD',
      'form.kind.bash': 'Bash',
      'form.kind.python': 'Python',
      'form.cwd': '工作目录（可选）',
      'form.cwdPlaceholder': '留空则使用 DSH Profile 目录；必须是绝对路径',
      'form.interpreter': '解释器路径或目录（可选）',
      'form.interpreterPlaceholder': '留空则自动选择：PowerShell 优先 7，Python 优先 DSH 内置',
      'form.nameRequired': '请填写名称',
      'form.commandRequired': '启用的 Preset 必须填写启动指令',
      'busy.save': '保存中…',
      'busy.select': '切换中…',
      'busy.toggle': '更新中…',
      'busy.remove': '删除中…',
      'busy.restart': '重启中…',
      'busy.move': '调整顺序…',
      'busy.stop': '停止中…',
      'busy.clear': '清空中…',
      'error.load': '读取状态失败：{message}',
      'error.action': '操作失败：{message}',
      'hint': '逐项开关会立即启动或停止对应 Preset，并决定 DSH 下次启动时是否运行；启用项按列表从上到下启动。上移/下移只调整顺序，下次启动或重启生效。',
      'preview.empty': '（未配置指令）',
    }

    const en = {
      'panel.title': 'Startup command',
      'panel.subtitle': 'View startup output and manage presets',
      'output.title': 'Startup output',
      'output.empty': 'The selected preset has no output yet.',
      'output.truncated': 'Output is long; only the most recent part is shown.',
      'presets.title': 'Presets',
      'presets.empty': 'No presets yet. Create one to get started.',
      'presets.new': 'New preset',
      'presets.edit': 'Edit',
      'presets.delete': 'Delete',
      'presets.confirmDelete': 'Confirm delete',
      'presets.moveUp': 'Move up',
      'presets.moveDown': 'Move down',
      'presets.enabled': 'On',
      'presets.disabled': 'Off',
      'presets.toggleOn': 'Enable and start',
      'presets.toggleOff': 'Disable and stop',
      'status.idle': 'Idle',
      'status.running': 'Running',
      'status.exited': 'Exited',
      'status.failed': 'Failed',
      'status.stopped': 'Stopped',
      'run.started': 'Started at {time}',
      'run.ended': 'Ended at {time}',
      'run.exit': 'Exit code {code}',
      'run.signal': 'Signal {signal}',
      'action.restart': 'Restart',
      'action.stop': 'Stop',
      'action.clear': 'Clear output',
      'action.save': 'Save',
      'action.cancel': 'Cancel',
      'action.new': 'New',
      'form.newTitle': 'New preset',
      'form.editTitle': 'Edit preset',
      'form.name': 'Name',
      'form.namePlaceholder': 'e.g. Dev server',
      'form.command': 'Startup command',
      'form.commandPlaceholder': 'Write-Output "hello"',
      'form.kind': 'Interpreter',
      'form.kind.powershell': 'PowerShell',
      'form.kind.cmd': 'CMD',
      'form.kind.bash': 'Bash',
      'form.kind.python': 'Python',
      'form.cwd': 'Working directory (optional)',
      'form.cwdPlaceholder': 'Leave empty for the DSH profile directory; must be absolute',
      'form.interpreter': 'Interpreter path or directory (optional)',
      'form.interpreterPlaceholder': 'Leave empty to auto-pick: pwsh 7 first, DSH Python first',
      'form.nameRequired': 'Name is required',
      'form.commandRequired': 'An enabled preset requires a start command',
      'busy.save': 'Saving…',
      'busy.select': 'Switching…',
      'busy.toggle': 'Updating…',
      'busy.remove': 'Deleting…',
      'busy.restart': 'Restarting…',
      'busy.move': 'Reordering…',
      'busy.stop': 'Stopping…',
      'busy.clear': 'Clearing…',
      'error.load': 'Cannot read state: {message}',
      'error.action': 'Action failed: {message}',
      'hint': 'Per-preset switches start or stop a preset immediately and decide what runs at DSH startup; enabled presets start top to bottom. Reordering applies on the next start or restart.',
      'preview.empty': '(no command configured)',
    }

    /**
     * Dictionary used before the Host locale service answers, chosen from the
     * language the shell already applied to the document.
     */
    const fallbackDictionary = (() => {
      const language = String(globalThis.document?.documentElement?.lang || globalThis.navigator?.language || 'en')
      return language.toLowerCase().startsWith('zh') ? zh : en
    })()

    /**
     * Interpolate a dictionary string.
     * @param template - text with `{key}` placeholders.
     * @param params - replacement values.
     * @returns the resolved text.
     */
    function format(template, params) {
      return String(template).replace(/\{(\w+)\}/gu, (match, key) => {
        return params !== undefined && Object.hasOwn(params, key) ? String(params[key]) : match
      })
    }

    /** @returns the message of a thrown value. */
    function describe(error) {
      return error instanceof Error ? error.message : String(error)
    }

    /**
     * Read the active color scheme from the theme service.
     * @param getTheme - injected theme reader.
     * @returns `light` or `dark`.
     */
    function readScheme(getTheme) {
      try {
        return getTheme?.()?.active?.colorScheme === 'light' ? 'light' : 'dark'
      } catch {
        return 'dark'
      }
    }

    /**
     * Build the absolute API base.
     * @returns origin for HTTP pages, otherwise an empty prefix.
     */
    function apiBase() {
      const location = globalThis.location
      return location !== undefined && /^https?:$/u.test(location.protocol) ? location.origin : ''
    }

    /**
     * Call one Host API method.
     * @param method - route tail.
     * @param payload - JSON body.
     * @param timeoutMs - request budget.
     * @param signal - optional caller cancellation.
     * @returns the `value` field of a successful response.
     */
    async function call(method, payload, timeoutMs = ACTION_TIMEOUT_MS, signal) {
      const controller = new AbortController()
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
      const abort = () => controller.abort()
      if (signal !== undefined) {
        if (signal.aborted) controller.abort()
        else signal.addEventListener('abort', abort, { once: true })
      }
      try {
        const response = await fetch(`${apiBase()}${API}/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload ?? {}),
          credentials: 'same-origin',
          signal: controller.signal,
        })
        const body = await response.json().catch(() => undefined)
        if (body?.ok === true) return body.value
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
      } catch (error) {
        if (timedOut) throw new Error('request timed out')
        throw error
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
    }

    /**
     * Format a timestamp for the run metadata.
     * @param value - epoch milliseconds.
     * @returns a local time string, or an empty string.
     */
    function formatTime(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      return new Date(value).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    }

    /**
     * First non-empty command line for a compact preset row.
     * @param command - full command text.
     * @returns a clipped preview.
     */
    function preview(command) {
      const line = String(command ?? '')
        .split(/\r?\n/u)
        .map((value) => value.trim())
        .find((value) => value !== '') ?? ''
      return line.length > 130 ? `${line.slice(0, 130)}…` : line
    }

    /** ANSI SGR palettes tuned for the two DSH color schemes. */
    const ANSI_PALETTES = {
      dark: {
        fg: ['#8b949e', '#ff7b72', '#7ee787', '#d29922', '#79c0ff', '#d2a8ff', '#56d4dd', '#e6edf3'],
        bright: ['#b1bac4', '#ffa198', '#aff5b4', '#e3b341', '#a5d6ff', '#e2c5ff', '#76e3ea', '#ffffff'],
      },
      light: {
        fg: ['#24292f', '#cf222e', '#116329', '#7d4e00', '#0550ae', '#6639ba', '#0f6b73', '#57606a'],
        bright: ['#57606a', '#a40e26', '#1a7f37', '#9a6700', '#0969da', '#8250df', '#1b7c83', '#24292f'],
      },
    }

    /** @returns a fresh SGR state. */
    function ansiState() {
      return { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, inverse: false }
    }

    /**
     * Map an xterm 256-color index to a CSS color.
     * @param value - palette index.
     * @param palette - active scheme palette.
     * @returns a CSS color.
     */
    function ansi256(value, palette) {
      const index = Math.max(0, Math.min(255, Math.trunc(value)))
      if (index < 8) return palette.fg[index]
      if (index < 16) return palette.bright[index - 8]
      if (index >= 232) {
        const level = 8 + ((index - 232) * 10)
        return `rgb(${level}, ${level}, ${level})`
      }
      const cube = index - 16
      const levels = [0, 95, 135, 175, 215, 255]
      const red = levels[Math.floor(cube / 36) % 6]
      const green = levels[Math.floor(cube / 6) % 6]
      const blue = levels[cube % 6]
      return `rgb(${red}, ${green}, ${blue})`
    }

    /**
     * Apply one SGR sequence to a copied state.
     * @param codes - numeric SGR codes.
     * @param previous - state before the sequence.
     * @param palette - active scheme palette.
     * @returns the next state.
     */
    function applyAnsiCodes(codes, previous, palette) {
      let current = { ...previous }
      for (let index = 0; index < codes.length; index += 1) {
        const code = codes[index]
        if (!Number.isFinite(code)) continue
        if (code === 0) {
          current = ansiState()
        } else if (code === 1) {
          current.bold = true
        } else if (code === 2) {
          current.dim = true
        } else if (code === 3) {
          current.italic = true
        } else if (code === 4) {
          current.underline = true
        } else if (code === 7) {
          current.inverse = true
        } else if (code === 22) {
          current.bold = false
          current.dim = false
        } else if (code === 23) {
          current.italic = false
        } else if (code === 24) {
          current.underline = false
        } else if (code === 27) {
          current.inverse = false
        } else if (code >= 30 && code <= 37) {
          current.fg = palette.fg[code - 30]
        } else if (code >= 90 && code <= 97) {
          current.fg = palette.bright[code - 90]
        } else if (code === 39) {
          current.fg = null
        } else if (code >= 40 && code <= 47) {
          current.bg = palette.fg[code - 40]
        } else if (code >= 100 && code <= 107) {
          current.bg = palette.bright[code - 100]
        } else if (code === 49) {
          current.bg = null
        } else if (code === 38 || code === 48) {
          const target = code === 38 ? 'fg' : 'bg'
          const mode = codes[index + 1]
          if (mode === 5 && Number.isFinite(codes[index + 2])) {
            current[target] = ansi256(codes[index + 2], palette)
            index += 2
          } else if (mode === 2 && [2, 3, 4].every((offset) => Number.isFinite(codes[index + offset]))) {
            const channel = (offset) => Math.max(0, Math.min(255, Math.trunc(codes[index + offset])))
            current[target] = `rgb(${channel(2)}, ${channel(3)}, ${channel(4)})`
            index += 4
          } else {
            index += 1
          }
        }
      }
      return current
    }

    /**
     * Convert a style state to a React style object.
     * @param state - current SGR state.
     * @returns a style object, or undefined for default text.
     */
    function ansiStyle(state) {
      const style = {}
      if (state.inverse) {
        style.color = state.bg ?? 'var(--dsw-alias-bg-base)'
        style.backgroundColor = state.fg ?? 'var(--dsw-alias-label-primary)'
      } else {
        if (state.fg !== null) style.color = state.fg
        if (state.bg !== null) style.backgroundColor = state.bg
      }
      if (state.bold) style.fontWeight = 600
      if (state.dim) style.opacity = 0.62
      if (state.italic) style.fontStyle = 'italic'
      if (state.underline) style.textDecoration = 'underline'
      return Object.keys(style).length === 0 ? undefined : style
    }

    /**
     * Remove non-SGR terminal control sequences from a text segment.
     * @param text - raw segment.
     * @returns plain text.
     */
    function stripAnsiControls(text) {
      return text
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/gu, '')
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, '')
        .replace(/\x1b[@-_]/gu, '')
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/gu, '')
    }

    /**
     * Split text into styled segments. SGR colors use a light/dark palette so
     * standard terminal colors stay readable in both DSH schemes.
     * @param text - raw output.
     * @param scheme - active color scheme (`light` or `dark`).
     * @returns `{ text, style }` segments.
     */
    function parseAnsi(text, scheme) {
      const palette = ANSI_PALETTES[scheme] ?? ANSI_PALETTES.dark
      const normalized = String(text ?? '').replace(/\r\n?/gu, '\n')
      if (!normalized.includes('\x1b')) {
        const clean = stripAnsiControls(normalized)
        return clean === '' ? [] : [{ text: clean, style: undefined }]
      }
      const parts = normalized.split(/(\x1b\[[0-9;]*m)/gu)
      let state = ansiState()
      const segments = []
      for (const part of parts) {
        if (part === '') continue
        const sgr = /^\x1b\[([0-9;]*)m$/u.exec(part)
        if (sgr !== null) {
          const body = sgr[1]
          const codes = body === '' ? [0] : body.split(';').map((value) => Number(value))
          state = applyAnsiCodes(codes, state, palette)
          continue
        }
        const clean = stripAnsiControls(part)
        if (clean === '') continue
        segments.push({ text: clean, style: ansiStyle(state) })
      }
      return segments
    }

    /** Run-state colors; anything else renders as idle. */
    const STATUS_COLORS = {
      running: 'var(--dsw-alias-state-success-primary)',
      failed: 'var(--dsw-alias-state-error-primary)',
      stopped: 'var(--dsw-alias-state-warn-primary)',
    }

    /** Terminal-prompt glyph used by the sidebar entry and page header. */
    function StartupGlyph({ size = 18 }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        'aria-hidden': true,
        style: { display: 'block', flex: '0 0 auto' },
      }, [
        h('path', {
          key: 'prompt',
          d: 'M4 6l5 5-5 5',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
        h('path', {
          key: 'line',
          d: 'M12 17h8',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
        }),
      ])
    }

    /** Left-sidebar icon; the owner supplies the active state and size. */
    function StartupSidebarIcon({ size = 18, active = false }) {
      return h('span', {
        style: {
          display: 'inline-flex',
          color: active ? 'var(--dsw-alias-brand-primary)' : 'inherit',
        },
      }, h(StartupGlyph, { size }))
    }

    const S = {
      root: {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        minHeight: 0,
        padding: '24px 32px 32px',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '13px',
        overflow: 'auto',
        boxSizing: 'border-box',
      },
      header: {
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
        width: '100%',
        maxWidth: '1080px',
        padding: '0 0 16px',
      },
      headerText: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        minWidth: 0,
      },
      titleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minWidth: 0,
      },
      title: {
        margin: 0,
        fontSize: '20px',
        lineHeight: 1.25,
        fontWeight: 600,
      },
      subtitle: {
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '12px',
      },
      headerActions: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
      },
      button: {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: '7px',
        padding: '5px 10px',
        fontSize: '12px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      primaryButton: {
        appearance: 'none',
        border: 'none',
        background: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-label-primary-inverted)',
        borderRadius: '7px',
        padding: '6px 12px',
        fontSize: '12px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      banner: {
        flex: '0 0 auto',
        width: '100%',
        maxWidth: '1080px',
        margin: '12px 0 0',
        padding: '8px 10px',
        borderRadius: '7px',
        border: '1px solid var(--dsw-alias-state-error-primary)',
        color: 'var(--dsw-alias-state-error-primary)',
        background: 'var(--dsw-alias-bg-layer-2)',
        overflowWrap: 'anywhere',
        boxSizing: 'border-box',
      },
      content: {
        flex: '1 1 auto',
        display: 'grid',
        gridTemplateColumns: 'minmax(250px, 330px) minmax(0, 1fr)',
        gap: '24px',
        width: '100%',
        maxWidth: '1080px',
        minHeight: 0,
        paddingTop: '16px',
        boxSizing: 'border-box',
      },
      presetsPane: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        minHeight: 0,
        padding: '0',
      },
      presetsHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
      },
      sectionTitle: {
        fontSize: '13px',
        fontWeight: 600,
      },
      list: {
        flex: '1 1 auto',
        minHeight: 0,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        paddingRight: '2px',
      },
      empty: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '8px',
        color: 'var(--dsw-alias-label-secondary)',
        padding: '12px 4px',
        lineHeight: 1.5,
      },
      preset: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '6px',
        padding: '8px 9px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
      },
      presetActive: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '6px',
        padding: '8px 9px',
        borderRadius: '8px',
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      presetMain: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        minWidth: 0,
        flex: '1 1 auto',
        cursor: 'pointer',
      },
      presetText: {
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      },
      presetName: {
        fontWeight: 500,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      presetCommand: {
        color: 'var(--dsw-alias-label-secondary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
        fontSize: '11px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      presetActions: {
        display: 'flex',
        gap: '3px',
        flex: '0 0 auto',
      },
      presetSwitch: {
        appearance: 'none',
        flex: '0 0 auto',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: '999px',
        padding: '2px 7px',
        fontSize: '10px',
        lineHeight: 1.5,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      presetSwitchOn: {
        appearance: 'none',
        flex: '0 0 auto',
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-brand-primary)',
        color: 'var(--dsw-alias-label-primary-inverted)',
        borderRadius: '999px',
        padding: '2px 7px',
        fontSize: '10px',
        lineHeight: 1.5,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      presetState: {
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '10px',
        lineHeight: 1.4,
      },
      presetStateOn: {
        color: 'var(--dsw-alias-state-success-primary)',
        fontSize: '10px',
        lineHeight: 1.4,
      },
      smallButton: {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: '5px',
        padding: '2px 6px',
        fontSize: '11px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      smallDanger: {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-state-error-primary)',
        background: 'transparent',
        color: 'var(--dsw-alias-state-error-primary)',
        borderRadius: '5px',
        padding: '2px 6px',
        fontSize: '11px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      orderButton: {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: '5px',
        padding: '2px 0',
        width: '22px',
        fontSize: '11px',
        lineHeight: 1.2,
        cursor: 'pointer',
      },
      outputPane: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        minWidth: 0,
        minHeight: 0,
        padding: '0',
      },
      outputHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        flexWrap: 'wrap',
      },
      outputTitleRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        minWidth: 0,
      },
      statusPill: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 8px',
        borderRadius: '999px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '11px',
        whiteSpace: 'nowrap',
      },
      dot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        flex: '0 0 auto',
        background: 'var(--dsw-alias-state-idle-primary)',
      },
      runMeta: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px 12px',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '11px',
        minHeight: '15px',
      },
      errorLine: {
        color: 'var(--dsw-alias-state-error-primary)',
        fontSize: '12px',
        overflowWrap: 'anywhere',
      },
      output: {
        flex: '1 1 auto',
        minHeight: '180px',
        margin: 0,
        padding: '12px',
        overflow: 'auto',
        borderRadius: '12px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
        fontSize: '12px',
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        tabSize: 2,
      },
      note: {
        color: 'var(--dsw-alias-state-warn-primary)',
        fontSize: '11px',
      },
      hint: {
        flex: '0 0 auto',
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '11px',
        lineHeight: 1.45,
      },
      editorBackdrop: {
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'rgba(0, 0, 0, 0.42)',
      },
      editor: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        maxWidth: '720px',
        maxHeight: '90%',
        overflow: 'auto',
        padding: '20px',
        boxSizing: 'border-box',
        borderRadius: '12px',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.28)',
      },
      editorTitle: {
        fontSize: '15px',
        fontWeight: 600,
      },
      field: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      },
      label: {
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '11px',
      },
      input: {
        width: '100%',
        boxSizing: 'border-box',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        padding: '7px 9px',
        fontFamily: 'inherit',
        fontSize: '12px',
        outline: 'none',
      },
      textarea: {
        width: '100%',
        minHeight: '170px',
        boxSizing: 'border-box',
        borderRadius: '6px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        padding: '9px',
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
        fontSize: '12px',
        lineHeight: 1.45,
        resize: 'vertical',
        outline: 'none',
      },
      editorActions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '6px',
        paddingTop: '4px',
      },
    }

    /**
     * One preset row in the left list.
     * @param props - preset, position, and callbacks.
     * @returns the row.
     */
    function PresetRow(props) {
      const { preset, last, active, busy, confirming, t } = props
      const enabled = preset.enabled === true
      const running = preset.running === true
      const locked = busy !== ''
      return h('div', { style: active ? S.presetActive : S.preset }, [
        h('button', {
          key: 'toggle',
          type: 'button',
          role: 'switch',
          'aria-checked': enabled,
          title: enabled ? t('presets.toggleOff') : t('presets.toggleOn'),
          style: enabled ? S.presetSwitchOn : S.presetSwitch,
          disabled: locked,
          onClick: props.onToggle,
        }, enabled ? t('presets.enabled') : t('presets.disabled')),
        h('div', {
          key: 'main',
          style: S.presetMain,
          role: 'button',
          tabIndex: 0,
          onClick: props.onSelect,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              props.onSelect()
            }
          },
        }, [
          h('div', { key: 'text', style: S.presetText }, [
            h('div', { key: 'name', style: S.presetName }, preset.name),
            h('div', { key: 'command', style: S.presetCommand },
              preview(preset.command) || t('preview.empty')),
            h('div', {
              key: 'state',
              style: running ? S.presetStateOn : S.presetState,
              title: preset.run?.error ?? undefined,
            }, `${t(`form.kind.${preset.kind ?? 'powershell'}`)} · ${t(`status.${preset.run?.status ?? 'idle'}`)}`),
          ]),
        ]),
        h('div', { key: 'actions', style: S.presetActions }, [
          h('button', {
            key: 'up',
            type: 'button',
            style: S.orderButton,
            title: t('presets.moveUp'),
            'aria-label': t('presets.moveUp'),
            disabled: locked || props.index === 0,
            onClick: () => props.onMove('up'),
          }, '↑'),
          h('button', {
            key: 'down',
            type: 'button',
            style: S.orderButton,
            title: t('presets.moveDown'),
            'aria-label': t('presets.moveDown'),
            disabled: locked || last,
            onClick: () => props.onMove('down'),
          }, '↓'),
          h('button', {
            key: 'edit',
            type: 'button',
            style: S.smallButton,
            disabled: locked,
            onClick: props.onEdit,
          }, t('presets.edit')),
          h('button', {
            key: 'delete',
            type: 'button',
            style: confirming ? S.smallDanger : S.smallButton,
            disabled: locked,
            onClick: props.onRemove,
          }, confirming ? t('presets.confirmDelete') : t('presets.delete')),
        ]),
      ])
    }

    /**
     * Preset editor dialog.
     * @param props - draft, busy label, and callbacks.
     * @returns the dialog.
     */
    function PresetEditor(props) {
      const { draft, busy, error, t, setDraft } = props
      const locked = busy !== ''
      const close = () => {
        if (!locked) setDraft(null)
      }
      const field = (key, label, input) => h('div', { key, style: S.field }, [
        h('label', { key: 'label', style: S.label }, label),
        input,
      ])
      return h('div', {
        style: S.editorBackdrop,
        onMouseDown: (event) => {
          if (event.target === event.currentTarget) close()
        },
      }, [
        h('div', {
          key: 'editor',
          style: S.editor,
          role: 'dialog',
          'aria-modal': true,
          'aria-label': draft.id === '' ? t('form.newTitle') : t('form.editTitle'),
        }, [
          h('div', { key: 'title', style: S.editorTitle },
            draft.id === '' ? t('form.newTitle') : t('form.editTitle')),
          field('name-field', t('form.name'), h('input', {
            key: 'input',
            style: S.input,
            value: draft.name,
            placeholder: t('form.namePlaceholder'),
            maxLength: LIMITS.name,
            autoFocus: true,
            autoComplete: 'off',
            onChange: (event) => setDraft({ ...draft, name: event.target.value }),
          })),
          field('kind-field', t('form.kind'), h('select', {
            key: 'select',
            style: S.input,
            value: draft.kind ?? 'powershell',
            onChange: (event) => setDraft({ ...draft, kind: event.target.value }),
          }, ['powershell', 'cmd', 'bash', 'python'].map((kind) => h('option', {
            key: kind,
            value: kind,
          }, t(`form.kind.${kind}`))))),
          field('command-field', t('form.command'), h('textarea', {
            key: 'textarea',
            style: S.textarea,
            value: draft.command,
            placeholder: t('form.commandPlaceholder'),
            spellCheck: false,
            maxLength: LIMITS.command,
            onChange: (event) => setDraft({ ...draft, command: event.target.value }),
          })),
          field('cwd-field', t('form.cwd'), h('input', {
            key: 'input',
            style: S.input,
            value: draft.cwd,
            placeholder: t('form.cwdPlaceholder'),
            maxLength: LIMITS.cwd,
            autoComplete: 'off',
            spellCheck: false,
            onChange: (event) => setDraft({ ...draft, cwd: event.target.value }),
          })),
          field('interpreter-field', t('form.interpreter'), h('input', {
            key: 'input',
            style: S.input,
            value: draft.interpreter ?? '',
            placeholder: t('form.interpreterPlaceholder'),
            maxLength: LIMITS.interpreter,
            autoComplete: 'off',
            spellCheck: false,
            onChange: (event) => setDraft({ ...draft, interpreter: event.target.value }),
          })),
          error === '' ? null : h('div', { key: 'error', style: S.errorLine }, error),
          h('div', { key: 'actions', style: S.editorActions }, [
            h('button', {
              key: 'cancel',
              type: 'button',
              style: S.button,
              disabled: locked,
              onClick: close,
            }, t('action.cancel')),
            h('button', {
              key: 'save',
              type: 'button',
              style: S.primaryButton,
              disabled: locked,
              onClick: props.onSave,
            }, busy === 'save' ? t('busy.save') : t('action.save')),
          ]),
        ]),
      ])
    }

    /**
     * The main-column panel.
     * @param props - slot props plus the injected translate function.
     * @returns the page.
     */
    function StartupPanel(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const [snapshot, setSnapshot] = React.useState(null)
      const [pollError, setPollError] = React.useState('')
      const [actionError, setActionError] = React.useState('')
      const [busy, setBusy] = React.useState('')
      const [draft, setDraft] = React.useState(null)
      const [confirmId, setConfirmId] = React.useState(null)
      const [, setLocaleTick] = React.useState(0)
      const [scheme, setScheme] = React.useState(() => readScheme(props.getTheme))
      const outputRef = React.useRef(null)
      const snapshotRef = React.useRef(null)
      const busyRef = React.useRef(false)
      const followOutputRef = React.useRef(true)
      const previousOutputRef = React.useRef({ seq: 0, active: null })

      const updateSnapshot = (next) => {
        if (next === undefined || next === null) return
        const current = snapshotRef.current
        const sameInstance = current !== null && current.instanceId === next.instanceId
        // A poll that left the Host before a mutation can arrive after it; the
        // revision it carries is older than what the mutation already applied.
        if (sameInstance && next.updatedAt < current.updatedAt) return
        const merged = { ...next }
        const epochChanged = current !== null
          && next.outputEpoch !== undefined
          && next.outputEpoch !== current.outputEpoch
        if (next.outputOmitted === true && !epochChanged) {
          merged.output = current?.output ?? ''
        } else if (next.outputReset === true || next.outputOffset === undefined || epochChanged) {
          // A full snapshot, or a Host built before offset-based output.
          merged.output = typeof next.output === 'string' ? next.output : ''
        } else if (typeof next.output === 'string') {
          merged.output = (current?.output ?? '') + next.output
        } else {
          merged.output = current?.output ?? ''
        }
        if (next.presetsOmitted === true) merged.presets = current?.presets
        snapshotRef.current = merged
        setSnapshot((previous) => {
          return previous?.instanceId === merged.instanceId &&
            previous?.updatedAt === merged.updatedAt &&
            previous?.outputSeq === merged.outputSeq &&
            previous?.presetsSeq === merged.presetsSeq
            ? previous
            : merged
        })
      }

      React.useEffect(() => {
        if (typeof props.subscribeLocale !== 'function') return undefined
        return props.subscribeLocale(() => setLocaleTick((value) => value + 1))
      }, [props.subscribeLocale])

      React.useEffect(() => {
        if (typeof props.getTheme !== 'function' || typeof props.subscribeTheme !== 'function') return undefined
        const read = () => setScheme(readScheme(props.getTheme))
        read()
        return props.subscribeTheme(read)
      }, [props.getTheme, props.subscribeTheme])

      React.useEffect(() => {
        let alive = true
        let loading = false
        let timer = null
        let failures = 0
        const abort = new AbortController()
        const stop = () => {
          if (timer === null) return
          window.clearTimeout(timer)
          timer = null
        }
        const schedule = (delay) => {
          if (!alive) return
          stop()
          // A little jitter keeps multiple tabs from polling in lockstep.
          timer = window.setTimeout(() => {
            timer = null
            void load()
          }, delay + Math.random() * 250)
        }
        const load = async () => {
          if (!alive) return
          if (loading || document.visibilityState === 'hidden') return
          if (busyRef.current) {
            schedule(1000)
            return
          }
          loading = true
          try {
            const current = snapshotRef.current
            const next = await call('state', current === null
              ? {}
              : {
                  instanceId: current.instanceId,
                  outputSeq: current.outputSeq,
                  outputOffset: current.outputOffset,
                  outputEpoch: current.outputEpoch,
                  activeId: current.activeId,
                  presetsSeq: current.presetsSeq,
                }, POLL_TIMEOUT_MS, abort.signal)
            if (!alive) return
            failures = 0
            updateSnapshot(next)
            setPollError('')
          } catch (error) {
            if (!alive) return
            failures += 1
            setPollError(format(t('error.load'), { message: describe(error) }))
          } finally {
            loading = false
            if (alive) {
              const running = snapshotRef.current?.presets?.some((preset) => preset.running === true) === true
              // A congested link is retried with a growing delay instead of a
              // steady stream of requests that would each time out too.
              schedule(failures === 0 ? (running ? 1000 : 5000) : Math.min(30000, 2000 * 2 ** (failures - 1)))
            }
          }
        }
        const onVisibility = () => {
          if (document.visibilityState !== 'visible') return
          stop()
          void load()
        }
        document.addEventListener('visibilitychange', onVisibility)
        void load()
        return () => {
          alive = false
          abort.abort()
          stop()
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [t])

      const editorOpen = draft !== null
      React.useEffect(() => {
        if (!editorOpen) return undefined
        const onKeyDown = (event) => {
          if (event.key === 'Escape' && !busyRef.current) setDraft(null)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
      }, [editorOpen])

      React.useEffect(() => {
        const node = outputRef.current
        if (node === null) return
        const seq = snapshot?.outputSeq ?? 0
        const active = snapshot?.activeId ?? null
        const previous = previousOutputRef.current
        if (active !== previous.active || seq < previous.seq || (snapshot?.output ?? '') === '') {
          followOutputRef.current = true
        }
        previousOutputRef.current = { seq, active }
        if (followOutputRef.current) node.scrollTop = node.scrollHeight
      }, [snapshot?.outputSeq, snapshot?.activeId])

      const runAction = async (name, operation) => {
        if (busyRef.current) return
        busyRef.current = true
        setBusy(name)
        setActionError('')
        try {
          const next = await operation()
          if (next !== undefined) updateSnapshot(next)
        } catch (error) {
          setActionError(format(t('error.action'), { message: describe(error) }))
        } finally {
          busyRef.current = false
          setBusy('')
        }
      }

      const startNew = () => {
        setConfirmId(null)
        setActionError('')
        setDraft({ id: '', name: '', command: '', cwd: '', kind: 'powershell', interpreter: '', enabled: true })
      }

      const startEdit = (preset) => {
        setConfirmId(null)
        setActionError('')
        setDraft({
          id: preset.id,
          name: preset.name ?? '',
          command: preset.command ?? '',
          cwd: preset.cwd ?? '',
          kind: preset.kind ?? 'powershell',
          interpreter: preset.interpreter ?? '',
          enabled: preset.enabled === true,
        })
      }

      const saveDraft = () => {
        if (draft === null) return
        if (draft.name.trim() === '') {
          setActionError(t('form.nameRequired'))
          return
        }
        if (draft.enabled === true && draft.command.trim() === '') {
          setActionError(t('form.commandRequired'))
          return
        }
        const payload = {
          name: draft.name,
          command: draft.command,
          cwd: draft.cwd,
          kind: draft.kind,
          interpreter: draft.interpreter,
          enabled: draft.enabled === true,
        }
        if (draft.id !== '') payload.id = draft.id
        runAction('save', async () => {
          const next = await call('save', payload)
          setDraft(null)
          return next
        })
      }

      const selectPreset = (id) => {
        setDraft(null)
        setConfirmId(null)
        runAction('select', () => call('select', { id }))
      }

      const togglePreset = (preset) => {
        setDraft(null)
        setConfirmId(null)
        runAction('toggle', () => call('toggle', { id: preset.id, enabled: preset.enabled !== true }))
      }

      const movePreset = (preset, direction) => {
        setDraft(null)
        setConfirmId(null)
        runAction('move', () => call('move', { id: preset.id, direction }))
      }

      const removePreset = (id) => {
        if (confirmId !== id) {
          setConfirmId(id)
          return
        }
        runAction('remove', async () => {
          const next = await call('remove', { id })
          setConfirmId(null)
          return next
        })
      }

      const status = snapshot?.run?.status ?? 'idle'
      const busyLabel = busy === '' ? '' : t(`busy.${busy}`)
      const statusLabel = busyLabel || t(`status.${status}`)
      const statusColor = STATUS_COLORS[status] ?? 'var(--dsw-alias-state-idle-primary)'
      const errorText = actionError || pollError
      const activeId = snapshot?.activeId ?? null
      const presets = snapshot?.presets ?? []
      const startedAt = formatTime(snapshot?.run?.startedAt)
      const endedAt = formatTime(snapshot?.run?.endedAt)
      const outputText = snapshot === null ? '…' : (snapshot.output || t('output.empty'))
      const outputSegments = React.useMemo(
        () => parseAnsi(outputText, scheme),
        [outputText, scheme],
      )

      return h('div', { style: { ...S.root, colorScheme: scheme } }, [
        h('header', { key: 'header', style: S.header }, [
          h('div', { key: 'text', style: S.headerText }, [
            h('div', { key: 'title-row', style: S.titleRow }, [
              h(StartupGlyph, { key: 'icon', size: 20 }),
              h('h1', { key: 'title', style: S.title }, t('panel.title')),
            ]),
            h('div', { key: 'subtitle', style: S.subtitle }, t('panel.subtitle')),
          ]),
          h('div', { key: 'actions', style: S.headerActions }, [
            h('button', {
              key: 'restart',
              type: 'button',
              style: S.primaryButton,
              disabled: busy !== '',
              onClick: () => runAction('restart', () => call('restart')),
            }, t('action.restart')),
            h('button', {
              key: 'stop',
              type: 'button',
              style: S.button,
              disabled: busy !== '',
              onClick: () => runAction('stop', () => call('stop')),
            }, t('action.stop')),
            h('button', {
              key: 'clear',
              type: 'button',
              style: S.button,
              disabled: busy !== '',
              onClick: () => runAction('clear', () => call('clear')),
            }, t('action.clear')),
          ]),
        ]),
        errorText === '' ? null : h('div', { key: 'banner', style: S.banner }, errorText),
        h('div', { key: 'content', style: S.content }, [
          h('section', { key: 'presets', style: S.presetsPane }, [
            h('div', { key: 'header', style: S.presetsHeader }, [
              h('span', { key: 'title', style: S.sectionTitle }, t('presets.title')),
              h('button', {
                key: 'new',
                type: 'button',
                style: S.button,
                disabled: busy !== '',
                onClick: startNew,
              }, `+ ${t('action.new')}`),
            ]),
            h('div', { key: 'list', style: S.list }, snapshot === null
              ? null
              : presets.length === 0
                ? h('div', { key: 'empty', style: S.empty }, [
                  h('span', { key: 'text' }, t('presets.empty')),
                  h('button', {
                    key: 'create',
                    type: 'button',
                    style: S.primaryButton,
                    disabled: busy !== '',
                    onClick: startNew,
                  }, t('presets.new')),
                ])
                : presets.map((preset, index) => h(PresetRow, {
                  key: preset.id,
                  preset,
                  index,
                  last: index === presets.length - 1,
                  active: preset.id === activeId,
                  busy,
                  confirming: confirmId === preset.id,
                  t,
                  onSelect: () => selectPreset(preset.id),
                  onToggle: () => togglePreset(preset),
                  onMove: (direction) => movePreset(preset, direction),
                  onEdit: () => startEdit(preset),
                  onRemove: () => removePreset(preset.id),
                }))),
          ]),
          h('section', { key: 'output', style: S.outputPane }, [
            h('div', { key: 'header', style: S.outputHeader }, [
              h('div', { key: 'title', style: S.outputTitleRow }, [
                h('span', { key: 'label', style: S.sectionTitle }, t('output.title')),
                h('span', { key: 'status', style: S.statusPill }, [
                  h('span', { key: 'dot', style: { ...S.dot, background: statusColor } }),
                  h('span', { key: 'text' }, statusLabel),
                ]),
              ]),
              h('div', { key: 'meta', style: S.runMeta }, [
                snapshot?.run?.startedAt && startedAt
                  ? h('span', { key: 'started' }, format(t('run.started'), { time: startedAt }))
                  : null,
                snapshot?.run?.endedAt && endedAt
                  ? h('span', { key: 'ended' }, format(t('run.ended'), { time: endedAt }))
                  : null,
                snapshot?.run?.exitCode !== null && snapshot?.run?.exitCode !== undefined
                  ? h('span', { key: 'exit' }, format(t('run.exit'), { code: snapshot.run.exitCode }))
                  : null,
                snapshot?.run?.signal
                  ? h('span', { key: 'signal' }, format(t('run.signal'), { signal: snapshot.run.signal }))
                  : null,
              ]),
            ]),
            snapshot?.run?.error
              ? h('div', { key: 'run-error', style: S.errorLine }, snapshot.run.error)
              : null,
            h('pre', {
              key: 'pre',
              ref: outputRef,
              style: S.output,
              onScroll: (event) => {
                const node = event.currentTarget
                followOutputRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 24
              },
            },
            outputSegments.map((segment, index) => h('span', {
              key: index,
              style: segment.style,
            }, segment.text))),
            snapshot?.outputTruncated === true
              ? h('div', { key: 'truncated', style: S.note }, t('output.truncated'))
              : null,
            h('div', { key: 'hint', style: S.hint }, t('hint')),
          ]),
        ]),
        draft === null ? null : h(PresetEditor, {
          key: 'editor',
          draft,
          busy,
          error: actionError,
          t,
          setDraft,
          onSave: saveDraft,
        }),
      ])
    }

    return {
      inject: ['slots', 'locale', 'theme'],
      apply(ctx) {
        // A reload can briefly run beside the previous client instance. A
        // fresh namespace per apply lets both keep their dictionaries until
        // the old instance is disposed, instead of failing the second
        // registration.
        const namespace = `${NS}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
        let bound
        try {
          ctx.effect(() => ctx.locale.register(namespace, { zh, en }), 'startup-command: locale')
        } catch {
          // Fall back to the bundled dictionary below.
        }
        try {
          bound = ctx.locale.bind(namespace)
        } catch {
          // Fall back to the bundled dictionary below.
        }

        const t = (key, params) => {
          if (typeof bound === 'function') {
            try {
              const translated = bound(key, params)
              if (translated !== key) return translated
            } catch {
              // Fall back to the bundled dictionary below.
            }
          }
          return format(fallbackDictionary[key] ?? key, params)
        }
        const subscribeLocale = (listener) => ctx.locale.subscribe(listener)
        const getTheme = () => ctx.theme.getTheme()
        const subscribeTheme = (listener) => ctx.on('theme/change', listener)

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: namespace,
          label: () => t('panel.title'),
          order: 20,
          inject: () => ({ t, subscribeLocale, getTheme, subscribeTheme }),
        }, StartupPanel))

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          locale: namespace,
          label: () => t('panel.title'),
          order: 20,
        }, StartupSidebarIcon))
      },
    }
  },
})
