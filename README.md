# DSH Startup Command / DSH 启动命令

[中文](#中文) · [English](#english)

---

## 中文

在 DSH 启动时按用户定义的顺序运行 Preset，在左侧边栏查看实时输出，并在停止、重启、停用或退出时结束对应的进程树。

### 功能

- 支持 PowerShell、CMD、Bash、Python 四种解释器。
- 多个 Preset 可独立启用；启用项按列表顺序启动，相邻启动间隔 500 ms。
- 使用 ↑ / ↓ 调整顺序，顺序在下次启动或重启时生效。
- 实时查看选中 Preset 的 ANSI 彩色输出，最多保留 256 KiB。
- 停止、重启、保存有变更的 Preset、停用或退出 DSH 时清理对应进程树；选择已运行的 Preset 不会重启它。
- 页面跟随 DSH 的浅色 / 深色主题。
- 中文 / English 双语界面。

### 安装

- DSH 需支持 Cordis bundle 与 Plugin Manager。
- 从离线 zip 或插件目录安装，刷新 DSH 页面；详见 [INSTALL.md](INSTALL.md)。
- 本包没有 npm 依赖。

### 使用

1. 刷新 DSH 页面，点击左侧边栏的终端图标「启动命令」。
2. 点击「新建 Preset」，选择解释器，填写名称、指令和可选的工作目录。
3. 用每行的开关控制是否在 DSH 启动时运行。
4. 用 ↑ / ↓ 调整启用项的执行顺序。
5. 「重启」停止全部受管进程，再按顺序启动启用项；「停止」停止全部受管进程。

上移 / 下移只修改存储顺序，不会中断正在运行的进程。新顺序在下次启动或重启时生效。

### Preset 数据

Preset 保存在 DSH Profile 目录下的 `startup-command-presets.json`：

| 字段 | 说明 |
| --- | --- |
| `name` | Preset 名称。 |
| `command` | 传给解释器的指令。 |
| `kind` | `powershell`、`cmd`、`bash` 或 `python`。 |
| `cwd` | 可选工作目录；留空使用 DSH Profile 目录。 |
| `interpreter` | 可选解释器可执行文件；留空使用默认程序。 |
| `enabled` | 是否在 DSH 启动时运行。 |

数组顺序即执行顺序。输出保存在 Host 内存中，重启 DSH 后清空。

### 工作方式

- 指令通过 DSH 的 `ctx.subprocess` 启动；Windows 下进入 Job Object，并隐藏控制台窗口。
- 启用项按数组顺序启动；一次启动多个 Preset 时，相邻两次启动间隔 500 ms。
- 停止、重启、保存有变更的 Preset、停用插件或退出 DSH 时，会终止对应托管进程范围并等待退出；超时会重试。选择已运行的 Preset 只切换显示，不会重启进程。
- ANSI SGR 颜色（16 色、256 色、RGB）渲染为彩色文本，非 SGR 控制序列会被移除。
- 浏览器按运行状态自适应读取状态：有进程运行时每 1 秒，空闲时每 5 秒，页面隐藏时暂停即时轮询。

### 限制

- 多个 Preset 可并行运行，但页面一次只显示当前选中 Preset 的输出。
- 显式脱离 Job Object 的子进程无法保证随 DSH 结束。
- 输出按 UTF-8 解码；其它编码可能显示为乱码。

---

## English

Runs presets in a user-defined order when DSH starts, streams their output in the left sidebar, and terminates the managed process trees on stop, restart, disable, or exit.

### Features

- PowerShell, CMD, Bash, and Python presets.
- Multiple presets can be enabled independently; enabled presets start in list order, 500 ms apart.
- Reorder with ↑ / ↓; the new order applies on the next start or restart.
- Live ANSI-colored output for the selected preset, capped at 256 KiB.
- Process-tree cleanup on stop, restart, a changed save, disable, or DSH exit; selecting a running preset no longer restarts it.
- Matches the DSH light/dark theme.
- Bilingual Chinese / English UI.

### Install

- DSH with Cordis bundle and Plugin Manager support.
- Install from the offline zip or the plugin directory, then refresh DSH. See [INSTALL.md](INSTALL.md).
- The package has no npm dependencies.

### Usage

1. Refresh DSH and click the terminal icon named **Startup Command** in the left sidebar.
2. Click **New Preset**, choose an interpreter, and enter a name, command, and optional working directory.
3. Use each row's switch to control whether it runs at DSH startup.
4. Use ↑ / ↓ to set the execution order.
5. **Restart** stops every managed process and starts enabled presets in order; **Stop** stops every managed process.

Moving a preset only changes the stored order; it does not interrupt running processes. The new order applies on the next start or restart.

### Preset Data

Presets are stored in `startup-command-presets.json` inside the DSH profile directory:

| Field | Meaning |
| --- | --- |
| `name` | Preset name. |
| `command` | Command passed to the interpreter. |
| `kind` | `powershell`, `cmd`, `bash`, or `python`. |
| `cwd` | Optional working directory; empty uses the DSH profile directory. |
| `interpreter` | Optional interpreter executable; empty uses the default program. |
| `enabled` | Whether this preset runs at DSH startup. |

Array order is execution order. Output is held in Host memory and cleared when DSH restarts.

### How It Works

- Commands launch through DSH's `ctx.subprocess`; on Windows they join a Job object and use hidden-window flags.
- Enabled presets start in array order; when several start together, launches are 500 ms apart.
- Stop, restart, a changed save, plugin disable, and DSH exit terminate the managed process ranges and wait for them; timeouts retry termination. Selecting a running preset only switches the view.
- ANSI SGR colors (16-color, 256-color, RGB) render as styled text; other control sequences are removed.
- The browser polls state adaptively: once per second while running, every 5 seconds while idle, and pauses immediate polling while the page is hidden.

### Limitations

- Several presets may run together, but the page shows only the selected preset's output.
- A child that breaks away from the Job object cannot be guaranteed to terminate with DSH.
- Output is decoded as UTF-8; other encodings may appear garbled.

---

## Files / 文件

- `index.js` — Host: preset store, ordered process lifecycle, output buffer, HTTP API.
- `client.js` — sidebar entry, preset list/editor, output viewer.
- `cordis.patch.yml` — installs the `startup-command` loader row.
- `locale/` — plugin inventory copy (`zh`, `en`).
- `icon.svg` — plugin icon.

## License / 许可证

MIT-0. See [LICENSE](LICENSE).
