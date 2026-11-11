# DSH Startup Command / DSH 启动命令

[中文](#中文) · [English](#english)

---

## 中文

在 DSH 启动时按顺序运行你的 Preset，并在左侧边栏的面板中查看实时输出、管理 Preset。

### 功能

- 支持 PowerShell、CMD、Bash、Python 四种解释器。
- 每个 Preset 独立启用或停用；启用项按列表顺序启动，相邻两项间隔 500 ms。
- 行内开关会立即启动或停止该 Preset，并决定 DSH 下次启动时是否运行它。
- 用 ↑ / ↓ 调整执行顺序；调整不会打断正在运行的进程，新顺序在下次启动或重启时生效。
- 实时查看当前选中 Preset 的输出，支持 ANSI 颜色，最多保留最近 256 KiB。
- 修改正在运行的 Preset 的指令、解释器、工作目录或启用状态时，先结束旧进程再按需启动。
- 停止、重启、停用、删除 Preset 或退出 DSH 时，结束该 Preset 启动的整棵进程树。
- Preset 保存在 DSH Profile 中：重启 DSH 或重新安装插件都不会丢失。
- 界面跟随 DSH 的浅色 / 深色主题，提供中文与 English。

### 使用

1. 打开左侧边栏的「启动命令」。
2. 新建 Preset：填写名称、选择解释器、输入启动指令；工作目录和解释器路径可选。
3. 用行内开关决定它是否运行。
4. 「重启」停止全部 Preset 后按顺序启动启用项；「停止」停止全部 Preset；「清空输出」只清除当前显示，不影响进程。

选择 Preset 只会切换显示；若它已启用但未运行，会启动它。选择不会启用已停用的 Preset。

### 行为说明

- 启用的 Preset 必须有启动指令；停用的 Preset 可以留空。
- 工作目录留空时使用 DSH Profile 目录；填写时必须是已存在的绝对路径。
- 输出按 UTF-8 解码并实时刷新；DSH 退出后输出清空，Preset 保留。
- 多个 Preset 可以同时运行，但面板一次只显示选中 Preset 的输出。
- 明确脱离进程管理的子进程无法保证随 DSH 结束。

### 系统要求

- DSH，并已启用 Plugin Manager 与 Cordis bundle 支持。
- 使用哪种解释器，就需要该解释器已安装并在系统中可用。
- 插件没有 npm 依赖，安装和使用都不需要联网。

### 安装

在 DSH 中执行 `dsh plugin --profile <profile> add github:Fuxfantx/dsh-startup-command`，然后刷新页面；也可以从 Release 下载离线包，解压后通过 DSH 的 Plugin Manager 安装。详见 [INSTALL.md](INSTALL.md)。

---

## English

Runs your presets in order when DSH starts, and opens a left-sidebar panel for live output and preset management.

### Features

- PowerShell, CMD, Bash, and Python presets.
- Each preset is enabled or disabled on its own; enabled presets start in list order, 500 ms apart.
- A row's switch starts or stops that preset immediately and decides whether it runs at the next DSH startup.
- Use ↑ / ↓ to change the order; reordering does not interrupt running processes and applies on the next start or restart.
- Live output for the selected preset, with ANSI colors, keeping the most recent 256 KiB.
- Changing a running preset's command, interpreter, working directory, or enabled state ends the old process first and starts a new one when needed.
- Stopping, restarting, disabling, or deleting a preset — or exiting DSH — ends the whole process tree it started.
- Presets are stored in the DSH profile: they survive DSH restarts and plugin reinstalls.
- Follows the DSH light/dark theme and ships Chinese and English UI text.

### Usage

1. Open **Startup command** in the left sidebar.
2. Create a preset: enter a name, pick an interpreter, and write the startup command; the working directory and interpreter path are optional.
3. Use the row switch to decide whether it runs.
4. **Restart** stops every preset and starts the enabled ones in order; **Stop** stops every preset; **Clear output** only clears the view and does not affect the process.

Selecting a preset only switches the view. An enabled preset starts if it is not running; selecting a disabled preset never enables it.

### Behavior

- An enabled preset must have a command; a disabled preset may be empty.
- An empty working directory uses the DSH profile directory; a configured one must be an existing absolute path.
- Output is decoded as UTF-8 and refreshed live; it is cleared when DSH exits, while presets are kept.
- Several presets may run together, but the panel shows only the selected preset's output.
- A child that explicitly detaches from process management cannot be guaranteed to end with DSH.

### System requirements

- DSH with Plugin Manager and Cordis bundle support enabled.
- Whichever interpreter you use must be installed and available to the system.
- The plugin has no npm dependencies and needs no network access to install or run.

### Install

Run `dsh plugin --profile <profile> add github:Fuxfantx/dsh-startup-command` in DSH and refresh the page, or download the offline package from Releases and install it through the DSH Plugin Manager. See [INSTALL.md](INSTALL.md).

---

## License / 许可证

MIT-0. See [LICENSE](LICENSE).
