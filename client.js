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

    /** Locale namespace and the panel id shared by the sidebar row and main page. */
    const NS = 'startupCommand'
    const PANEL_ID = 'startup-command'

    /** Same-origin API path. */
    const API = '/startup-command/api'

    const zh = {
      'panel.title': '启动命令',
      'panel.subtitle': '查看启动输出并管理 Preset',
      'output.title': '启动输出',
      'output.empty': '暂无输出。选择或创建一个 Preset，然后点击重启。',
      'output.truncated': '输出过长，仅显示最近部分。',
      'presets.title': 'Preset',
      'presets.empty': '还没有 Preset。新建一个来开始。',
      'presets.new': '新建 Preset',
      'presets.edit': '编辑',
      'presets.delete': '删除',
      'presets.confirmDelete': '确认删除',
      'presets.moveUp': '上移',
      'presets.moveDown': '下移',
      'presets.orderHint': '启用项按列表顺序启动，相邻启动间隔 500 ms；上移/下移在下次启动或重启时生效。',
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
      'form.interpreter': '解释器路径（可选）',
      'form.interpreterPlaceholder': '留空则使用对应默认程序',
      'form.nameRequired': '请填写名称',
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
      'hint': '逐项开关决定 Preset 是否在 DSH 启动时运行；启用项按列表从上到下启动，间隔 500 ms。上移/下移只调整顺序，下次启动或重启生效。',
      'preview.empty': '（未配置指令）',
    }

    const en = {
      'panel.title': 'Startup command',
      'panel.subtitle': 'View startup output and manage presets',
      'output.title': 'Startup output',
      'output.empty': 'No output yet. Select or create a preset, then restart.',
      'output.truncated': 'Output is long; only the most recent part is shown.',
      'presets.title': 'Presets',
      'presets.empty': 'No presets yet. Create one to get started.',
      'presets.new': 'New preset',
      'presets.edit': 'Edit',
      'presets.delete': 'Delete',
      'presets.confirmDelete': 'Confirm delete',
      'presets.moveUp': 'Move up',
      'presets.moveDown': 'Move down',
      'presets.orderHint': 'Enabled presets start in list order, 500 ms apart; reordering applies on the next start or restart.',
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
      'form.interpreter': 'Interpreter path (optional)',
      'form.interpreterPlaceholder': 'Leave empty for the default program',
      'form.nameRequired': 'Name is required',
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
      'hint': 'Per-preset switches decide what runs at DSH startup; enabled presets start top to bottom, 500 ms apart. Reordering applies on the next start or restart.',
      'preview.empty': '(no command configured)',
    }

    /**
     * Interpolate a dictionary string.
     * @param template - text with `{key}` placeholders.
     * @param params - replacement values.
     * @returns the resolved text.
     */
    function format(template, params) {
      return String(template).replace(/\{(\w+)\}/g, (match, key) => {
        return params !== undefined && Object.prototype.hasOwnProperty.call(params, key)
          ? String(params[key])
          : match
      })
    }

    /**
     * Build the absolute API base.
     * @returns origin for HTTP pages, otherwise an empty prefix.
     */
    function apiBase() {
      const location = globalThis.location
      if (location !== undefined && /^https?:$/.test(location.protocol)) return location.origin
      return ''
    }

    /**
     * Call one Host API method.
     * @param method - route tail.
     * @param payload - JSON body.
     * @returns the `value` field of a successful response.
     */
    async function call(method, payload) {
      const response = await fetch(`${apiBase()}${API}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      const body = await response.json().catch(() => undefined)
      if (!response.ok || body?.ok !== true) {
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
      }
      return body.value
    }

    /**
     * Format a timestamp for the run metadata.
     * @param value - epoch milliseconds.
     * @returns a local time string, or an empty string.
     */
    function formatTime(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      try {
        return new Date(value).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      } catch {
        return ''
      }
    }

    /**
     * First non-empty command line for a compact preset row.
     * @param command - full command text.
     * @returns a clipped preview.
     */
    function preview(command) {
      const line = String(command ?? '')
        .split(/\r?\n/u)
        .map((candidate) => candidate.trim())
        .find((candidate) => candidate !== '') ?? ''
      return line.length > 130 ? `${line.slice(0, 130)}…` : line
    }

    // #region startup-command-ansi
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

    /**
     * Build a fresh SGR state.
     * @returns the default style state.
     */
    function ansiState() {
      return { fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, inverse: false }
    }

    /**
     * Map an xterm 256-color index to a CSS color.
     * @param index - palette index.
     * @param palette - active scheme palette.
     * @returns a CSS color.
     */
    function ansi256(index, palette) {
      if (index < 8) return palette.fg[index]
      if (index < 16) return palette.bright[index - 8]
      if (index >= 232) {
        const value = 8 + ((index - 232) * 10)
        return `rgb(${value}, ${value}, ${value})`
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
            current[target] = `rgb(${codes[index + 2]}, ${codes[index + 3]}, ${codes[index + 4]})`
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
        .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/gu, '')
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, '')
        .replace(/\x1b[@-_]/gu, '')
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
    // #endregion startup-command-ansi

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
      dangerButton: {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-state-error-primary)',
        background: 'transparent',
        color: 'var(--dsw-alias-state-error-primary)',
        borderRadius: '7px',
        padding: '5px 10px',
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
      presetOrderHint: {
        color: 'var(--dsw-alias-label-secondary)',
        fontSize: '11px',
        lineHeight: 1.5,
        marginTop: '-2px',
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
      const [scheme, setScheme] = React.useState(() => {
        try {
          return props.getTheme?.()?.active?.colorScheme === 'light' ? 'light' : 'dark'
        } catch {
          return 'dark'
        }
      })
      const outputRef = React.useRef(null)

      React.useEffect(() => {
        if (typeof props.subscribeLocale !== 'function') return undefined
        return props.subscribeLocale(() => setLocaleTick((value) => value + 1))
      }, [props.subscribeLocale])

      React.useEffect(() => {
        if (typeof props.getTheme !== 'function' || typeof props.subscribeTheme !== 'function') return undefined
        const read = () => {
          try {
            setScheme(props.getTheme().active.colorScheme === 'light' ? 'light' : 'dark')
          } catch {
            // Keep the last known scheme if the theme service is momentarily unavailable.
          }
        }
        read()
        return props.subscribeTheme(read)
      }, [props.getTheme, props.subscribeTheme])

      React.useEffect(() => {
        let alive = true
        let loading = false
        let timer = null
        const schedule = (delay) => {
          if (!alive) return
          if (timer !== null) window.clearTimeout(timer)
          timer = window.setTimeout(() => {
            timer = null
            void load()
          }, delay)
        }
        const load = async () => {
          if (!alive || loading) return
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
            schedule(10000)
            return
          }
          loading = true
          let next
          try {
            next = await call('state')
            if (!alive) return
            setSnapshot((current) => (
              current?.updatedAt === next?.updatedAt && current?.outputSeq === next?.outputSeq
                ? current
                : next
            ))
            setPollError('')
          } catch (error) {
            if (alive) {
              setPollError(format(t('error.load'), {
                message: error instanceof Error ? error.message : String(error),
              }))
            }
          } finally {
            loading = false
            if (alive) {
              const running = next?.presets?.some((preset) => preset.running === true) === true
              schedule(running ? 1000 : 5000)
            }
          }
        }
        const onVisibility = () => {
          if (document.visibilityState !== 'visible') return
          if (timer !== null) {
            window.clearTimeout(timer)
            timer = null
          }
          void load()
        }
        document.addEventListener('visibilitychange', onVisibility)
        void load()
        return () => {
          alive = false
          if (timer !== null) window.clearTimeout(timer)
          document.removeEventListener('visibilitychange', onVisibility)
        }
      }, [t])

      React.useEffect(() => {
        const node = outputRef.current
        if (node !== null) node.scrollTop = node.scrollHeight
      }, [snapshot?.outputSeq])

      const runAction = async (name, operation) => {
        if (busy !== '') return
        setBusy(name)
        setActionError('')
        try {
          const next = await operation()
          if (next !== undefined) setSnapshot(next)
        } catch (error) {
          setActionError(format(t('error.action'), {
            message: error instanceof Error ? error.message : String(error),
          }))
        } finally {
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
          name: preset.name,
          command: preset.command,
          cwd: preset.cwd,
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
      const statusColor = status === 'running'
        ? 'var(--dsw-alias-state-success-primary)'
        : status === 'failed'
          ? 'var(--dsw-alias-state-error-primary)'
          : status === 'stopped'
            ? 'var(--dsw-alias-state-warn-primary)'
            : 'var(--dsw-alias-state-idle-primary)'
      const errorText = actionError || pollError
      const activeId = snapshot?.activeId ?? null
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
            h('div', { key: 'order-hint', style: S.presetOrderHint }, t('presets.orderHint')),
            h('div', { key: 'list', style: S.list }, snapshot === null
              ? null
              : snapshot.presets.length === 0
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
                : snapshot.presets.map((preset, index) => {
                  const active = preset.id === activeId
                  const enabled = preset.enabled === true
                  const running = preset.running === true
                  return h('div', { key: preset.id, style: active ? S.presetActive : S.preset }, [
                    h('button', {
                      key: 'toggle',
                      type: 'button',
                      role: 'switch',
                      'aria-checked': enabled,
                      title: enabled ? t('presets.toggleOff') : t('presets.toggleOn'),
                      style: enabled ? S.presetSwitchOn : S.presetSwitch,
                      disabled: busy !== '',
                      onClick: (event) => {
                        event.stopPropagation()
                        togglePreset(preset)
                      },
                    }, enabled ? t('presets.enabled') : t('presets.disabled')),
                    h('div', {
                      key: 'main',
                      style: S.presetMain,
                      role: 'button',
                      tabIndex: 0,
                      onClick: () => selectPreset(preset.id),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectPreset(preset.id)
                        }
                      },
                    }, [
                      h('div', { key: 'text', style: S.presetText }, [
                        h('div', { key: 'name', style: S.presetName }, preset.name),
                        h('div', { key: 'command', style: S.presetCommand },
                          preview(preset.command) || t('preview.empty')),
                        h('div', { key: 'state', style: running ? S.presetStateOn : S.presetState },
                          `${t(`form.kind.${preset.kind ?? 'powershell'}`)} · ${t(`status.${preset.run?.status ?? 'idle'}`)}`),
                      ]),
                    ]),
                    h('div', { key: 'actions', style: S.presetActions }, [
                      h('button', {
                        key: 'up',
                        type: 'button',
                        style: S.orderButton,
                        title: t('presets.moveUp'),
                        'aria-label': t('presets.moveUp'),
                        disabled: busy !== '' || index === 0,
                        onClick: () => movePreset(preset, 'up'),
                      }, '↑'),
                      h('button', {
                        key: 'down',
                        type: 'button',
                        style: S.orderButton,
                        title: t('presets.moveDown'),
                        'aria-label': t('presets.moveDown'),
                        disabled: busy !== '' || index === snapshot.presets.length - 1,
                        onClick: () => movePreset(preset, 'down'),
                      }, '↓'),
                      h('button', {
                        key: 'edit',
                        type: 'button',
                        style: S.smallButton,
                        disabled: busy !== '',
                        onClick: () => startEdit(preset),
                      }, t('presets.edit')),
                      h('button', {
                        key: 'delete',
                        type: 'button',
                        style: confirmId === preset.id ? S.smallDanger : S.smallButton,
                        disabled: busy !== '',
                        onClick: () => removePreset(preset.id),
                      }, confirmId === preset.id ? t('presets.confirmDelete') : t('presets.delete')),
                    ]),
                  ])
                })),
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
                snapshot?.run?.startedAt
                  ? h('span', { key: 'started' }, format(t('run.started'), { time: formatTime(snapshot.run.startedAt) }))
                  : null,
                snapshot?.run?.endedAt
                  ? h('span', { key: 'ended' }, format(t('run.ended'), { time: formatTime(snapshot.run.endedAt) }))
                  : null,
                snapshot?.run?.exitCode !== null && snapshot?.run?.exitCode !== undefined
                  ? h('span', { key: 'exit' }, format(t('run.exit'), { code: snapshot.run.exitCode }))
                  : null,
              ]),
            ]),
            snapshot?.run?.error
              ? h('div', { key: 'run-error', style: S.errorLine }, snapshot.run.error)
              : null,
            h('pre', { key: 'pre', ref: outputRef, style: S.output },
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
        draft === null ? null : h('div', { key: 'editor-backdrop', style: S.editorBackdrop }, [
          h('div', { key: 'editor', style: S.editor }, [
            h('div', { key: 'title', style: S.editorTitle },
              draft.id === '' ? t('form.newTitle') : t('form.editTitle')),
            h('div', { key: 'name-field', style: S.field }, [
              h('label', { key: 'label', style: S.label }, t('form.name')),
              h('input', {
                key: 'input',
                style: S.input,
                value: draft.name,
                placeholder: t('form.namePlaceholder'),
                onChange: (event) => setDraft({ ...draft, name: event.target.value }),
              }),
            ]),
            h('div', { key: 'kind-field', style: S.field }, [
              h('label', { key: 'label', style: S.label }, t('form.kind')),
              h('select', {
                key: 'select',
                style: S.input,
                value: draft.kind ?? 'powershell',
                onChange: (event) => setDraft({ ...draft, kind: event.target.value }),
              }, ['powershell', 'cmd', 'bash', 'python'].map((kind) => h('option', {
                key: kind,
                value: kind,
              }, t(`form.kind.${kind}`)))),
            ]),
            h('div', { key: 'command-field', style: S.field }, [
              h('label', { key: 'label', style: S.label }, t('form.command')),
              h('textarea', {
                key: 'textarea',
                style: S.textarea,
                value: draft.command,
                placeholder: t('form.commandPlaceholder'),
                spellCheck: false,
                onChange: (event) => setDraft({ ...draft, command: event.target.value }),
              }),
            ]),
            h('div', { key: 'cwd-field', style: S.field }, [
              h('label', { key: 'label', style: S.label }, t('form.cwd')),
              h('input', {
                key: 'input',
                style: S.input,
                value: draft.cwd,
                placeholder: t('form.cwdPlaceholder'),
                onChange: (event) => setDraft({ ...draft, cwd: event.target.value }),
              }),
            ]),
            h('div', { key: 'interpreter-field', style: S.field }, [
              h('label', { key: 'label', style: S.label }, t('form.interpreter')),
              h('input', {
                key: 'input',
                style: S.input,
                value: draft.interpreter ?? '',
                placeholder: t('form.interpreterPlaceholder'),
                onChange: (event) => setDraft({ ...draft, interpreter: event.target.value }),
              }),
            ]),
            h('div', { key: 'actions', style: S.editorActions }, [
              h('button', {
                key: 'cancel',
                type: 'button',
                style: S.button,
                disabled: busy !== '',
                onClick: () => setDraft(null),
              }, t('action.cancel')),
              h('button', {
                key: 'save',
                type: 'button',
                style: S.primaryButton,
                disabled: busy !== '',
                onClick: saveDraft,
              }, busy === 'save' ? t('busy.save') : t('action.save')),
            ]),
          ]),
        ]),
      ])
    }

    return {
      inject: ['slots', 'locale', 'theme'],
      apply(ctx) {
        let localeBound
        try {
          ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'startup-command: locale')
          localeBound = ctx.locale.bind(NS)
        } catch {
          // Fall back to the built-in dictionary when the locale service is unavailable.
        }

        const t = (key, params) => {
          if (typeof localeBound === 'function') {
            const translated = localeBound(key, params)
            if (translated !== undefined && translated !== key) return translated
          }
          return format(zh[key] ?? en[key] ?? key, params)
        }

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          label: () => t('panel.title'),
          order: 20,
          inject: () => ({
            t,
            subscribeLocale: (listener) => ctx.locale.subscribe(listener),
            getTheme: () => ctx.theme.getTheme(),
            subscribeTheme: (listener) => ctx.on('theme/change', listener),
          }),
        }, StartupPanel))

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          label: () => t('panel.title'),
          order: 20,
        }, StartupSidebarIcon))
      },
    }
  },
})

