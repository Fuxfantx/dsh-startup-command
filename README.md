# DSH Startup Command / DSH 启动命令

[中文](#中文) · [English](#english)

---

## 中文

在 DSH 启动时按顺序运行 Preset，在左侧边栏查看实时输出，并在停止、重启、停用或退出时结束对应进程。

### 功能

- 支持 PowerShell、CMD、Bash、Python。
- 多个 Preset 可独立启用；启用项按列表顺序启动，相邻启动间隔 500 ms。
- 使用 ↑ / ↓ 调整执行顺序；顺序在下次启动或重启时生效。
- 实时查看当前 Preset 的 ANSI 彩色输出，最多保留 256 KiB。
- 停止、重启、停用、删除或修改正在运行的 Preset 时，会结束对应进程。
- 页面跟随 DSH 的浅色 / 深色主题。
- 中文 / English 双语界面。

### 安装

- DSH 需支持 Cordis bundle 与 Plugin Manager。
- 从离线 zip 或插件目录安装，刷新 DSH 页面；详见 [INSTALL.md](INSTALL.md)。
- 本包没有 npm 依赖。

### 使用

1. 刷新 DSH 页面，点击左侧边栏的终端图标「启动命令」。
2. 点击「新建 Preset」，选择解释器，填写名称、启动指令和可选工作目录。
3. 用每行的开关控制该 Preset 是否启用并运行。
4. 用 ↑ / ↓ 调整启用项的顺序。
5. 「重启」停止全部 Preset，再按顺序启动启用项；「停止」停止全部 Preset。
6. 「清空输出」只清除当前显示，不影响进程。

选择 Preset 只会切换显示；如果该 Preset 已启用但未运行，会启动它。停用的 Preset 不会被选择操作自动启用。

调整顺序不会中断已运行的进程；新顺序在下次启动或重启时生效。

### 行为

- 启动指令由配置的解释器执行；工作目录留空时使用 DSH Profile 目录。
- 输出保存在 Host 内存中，重启 DSH 后清空。
- 页面只在可见时轮询；运行时更新更快，空闲时降低频率。
- 当用户停留在输出底部时，新输出会自动跟随；向上翻阅时不会被强制拉回底部。

### 限制

- 多个 Preset 可以同时运行，但页面一次只显示当前选中 Preset 的输出。
- 显式脱离进程管理的子进程无法保证随 DSH 结束。
- 输出按 UTF-8 解码；其它编码可能显示为乱码。
- 工作目录必须是已存在的绝对路径。

---

## English

Runs presets in order when DSH starts, streams their output in the sidebar, and ends the managed processes on stop, restart, disable, or exit.

### Features

- PowerShell, CMD, Bash, and Python presets.
- Each preset has its own switch; enabled presets start in list order, 500 ms apart.
- Reorder with ↑ / ↓; the new order applies on the next start or restart.
- Live ANSI-colored output for the selected preset, capped at 256 KiB.
- Stops the process when a preset is stopped, restarted, disabled, deleted, or changed while running.
- Matches the DSH light/dark theme.
- Bilingual Chinese / English UI.

### Install

- DSH with Cordis bundle and Plugin Manager support.
- Install from the offline zip or plugin directory, then refresh DSH. See [INSTALL.md](INSTALL.md).
- The package has no npm dependencies.

### Usage

1. Refresh DSH and click the terminal icon named **Startup Command** in the sidebar.
2. Click **New Preset**, choose an interpreter, and enter a name, startup command, and optional working directory.
3. Use each row's switch to enable or disable the preset.
4. Use ↑ / ↓ to set the execution order.
5. **Restart** stops every preset and starts the enabled ones in order; **Stop** stops every preset.
6. **Clear output** only clears the current view; it does not affect the process.

Selecting a preset only switches the view. An enabled preset starts if it is not already running; selecting a disabled preset does not enable or start it.

Reordering does not interrupt running processes; the new order applies on the next start or restart.

### Behavior

- Commands run through the configured interpreter; an empty working directory uses the DSH profile directory.
- Output is held in Host memory and cleared when DSH restarts.
- The page polls only while visible: faster while running, slower while idle.
- New output follows the bottom while you are reading there; scrolling up is not forced back down.

### Limitations

- Several presets may run together, but the page shows only the selected preset's output.
- A child that explicitly breaks away from process management cannot be guaranteed to end with DSH.
- Output is decoded as UTF-8; other encodings may appear garbled.
- The working directory must be an existing absolute path.

---

## Files / 文件

- `index.js` — Host: preset storage, process lifecycle, output buffer, HTTP API.
- `client.js` — sidebar entry, preset list/editor, output viewer.
- `cordis.patch.yml` — installs the `startup-command` loader row.
- `locale/` — plugin inventory copy (`zh`, `en`).
- `icon.svg` — plugin icon.

## License / 许可证

MIT-0. See [LICENSE](LICENSE).
