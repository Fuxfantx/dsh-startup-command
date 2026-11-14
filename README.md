# DSH Startup Command / DSH 启动命令

[中文](#中文) · [English](#english)

---

## 中文

在 DSH 启动时按顺序运行你的 Preset，并在左侧边栏的面板中查看实时输出、管理 Preset。

### 功能

- 支持 PowerShell、CMD、Bash、Python。
- 每个 Preset 可单独启用；启用的 Preset 在 DSH 启动时按列表顺序运行。
- 行内开关会立即启动或停止该 Preset，并决定 DSH 下次启动时是否运行它。
- 可调整执行顺序；调整不会打断正在运行的程序，新顺序在下次启动或重启时生效。
- 实时查看当前选中 Preset 的输出，支持 ANSI 颜色。
- 修改正在运行的 Preset 的指令、解释器或工作目录时，先结束旧进程，再按需启动。
- 停止、重启、停用、删除 Preset 或退出 DSH 时，结束该 Preset 启动的全部进程。
- Preset 保存在 DSH Profile 中：重启 DSH 或重新安装插件都不会丢失。
- 跟随 DSH 的浅色 / 深色主题，提供中文与 English 界面。

### 使用

1. 打开左侧边栏的「启动命令」。
2. 新建 Preset：填写名称、选择解释器、输入要运行的指令；工作目录和解释器路径可选。
3. 用行内开关决定它是否运行。
4. 「重启」停止全部 Preset 后按顺序启动启用项；「停止」停止全部 Preset；「清空输出」只清除当前显示，不影响正在运行的程序。

选择一个 Preset 只会切换显示；如果它已启用但未运行，会启动它。选择不会启用已停用的 Preset。

### 行为说明

- 启用的 Preset 必须填写启动指令；停用的 Preset 可以留空。
- 工作目录留空时使用 DSH Profile 目录；填写时必须是已存在的绝对路径。
- 解释器路径留空时自动选择：PowerShell 优先 PowerShell 7，其次系统自带的 Windows PowerShell；Python 优先使用 DSH 自带运行时，其次系统 Python。手动填写的解释器路径或目录优先。
- 多个 Preset 可以同时运行，但面板一次只显示选中 Preset 的输出。
- 输出在 DSH 退出后清空，Preset 保留。
- 主动脱离进程管理的子进程无法保证随 DSH 结束。

### 系统要求

- DSH `>=0.2.2-rc.1 <0.3.0-0`（0.2.x，已在 0.2.2-rc.3 验证），并已启用 Plugin Manager 与 Cordis bundle 支持。
- Windows、macOS 或 Linux；CMD 仅 Windows 可用。
- 使用哪种解释器，就需要该解释器已安装并在系统中可用；DSH 自带 Python 时可直接使用。
- 插件没有 npm 依赖；使用离线包安装和日常使用都不需要联网。

### 安装

在 DSH 中执行 `dsh plugin --profile <profile> add github:Fuxfantx/dsh-startup-command`，然后刷新页面；也可以从 Release 下载离线包，通过 DSH 的 Plugin Manager 安装。详见 [INSTALL.md](INSTALL.md)。

### 许可证

MIT-0。详见 [LICENSE](LICENSE)。

---

## English

Runs your presets in order when DSH starts, and opens a left-sidebar panel for live output and preset management.

### Features

- PowerShell, CMD, Bash, and Python.
- Each preset is enabled or disabled on its own; enabled presets run in list order when DSH starts.
- A row's switch starts or stops that preset immediately and decides whether it runs at the next DSH startup.
- Use ↑ / ↓ to change the order; reordering does not interrupt running programs and applies on the next start or restart.
- Live output for the selected preset, with ANSI colors.
- Changing a running preset's command, interpreter, or working directory ends the old process first and starts a new one when needed.
- Stopping, restarting, disabling, or deleting a preset — or exiting DSH — ends every process it started.
- Presets are stored in the DSH profile: they survive DSH restarts and plugin reinstalls.
- Follows the DSH light/dark theme and ships Chinese and English UI text.

### Usage

1. Open **Startup command** in the left sidebar.
2. Create a preset: enter a name, pick an interpreter, and write the startup command; the working directory and interpreter path are optional.
3. Use the row switch to decide whether it runs.
4. **Restart** stops every preset and starts the enabled ones in order; **Stop** stops every preset; **Clear output** only clears the view and does not affect running programs.

Selecting a preset only switches the view. An enabled preset starts if it is not running; selecting a disabled preset never enables it.

### Behavior

- An enabled preset must have a startup command; a disabled preset may be empty.
- An empty working directory uses the DSH profile directory; a configured one must be an existing absolute path.
- An empty interpreter path picks one automatically: PowerShell prefers PowerShell 7 and falls back to the inbox Windows PowerShell; Python prefers the DSH bundled runtime and falls back to system Python. An explicitly configured interpreter path or directory always wins.
- Several presets may run together, but the panel shows only the selected preset's output.
- Output is cleared when DSH exits, while presets are kept.
- A child that explicitly detaches from process management cannot be guaranteed to end with DSH.

### System requirements

- DSH `>=0.2.2-rc.1 <0.3.0-0` (the 0.2.x line; verified on 0.2.2-rc.3), with Plugin Manager and Cordis bundle support enabled.
- Windows, macOS, or Linux; CMD is available on Windows only.
- Whichever interpreter you use must be installed and available to the system; the DSH bundled Python can be used directly when present.
- The plugin has no npm dependencies; the offline package and daily use need no network access.

### Install

Run `dsh plugin --profile <profile> add github:Fuxfantx/dsh-startup-command` in DSH and refresh the page, or download the offline package from Releases and install it through the DSH Plugin Manager. See [INSTALL.md](INSTALL.md).

### License

MIT-0. See [LICENSE](LICENSE).
