# DSH Startup command / DSH 启动命令

[中文](#中文) · [English](#english)

---

## 中文

DSH 启动时运行启用的 Preset，在左侧边栏打开「启动命令」页面查看实时输出，并在停止、重启、保存/切换 Preset 或 DSH 退出时结束对应进程树。

### 要求与安装

- Windows 10/11；DSH 需支持 Cordis bundle 与 Plugin Manager。
- 从离线 zip 或插件目录安装，刷新 DSH 页面；详细步骤见 [INSTALL.md](INSTALL.md)。
- 本包没有 npm 依赖。

### 使用

1. 刷新一次 DSH 页面。
2. 点击左侧边栏的终端图标「启动命令」。
3. 点击「新建 Preset」，选择解释器（PowerShell / CMD / Bash / Python），填写名称和指令并保存。
4. 每个 Preset 行的开关决定它是否启用；使用 ↑ / ↓ 调整启用项的执行顺序。
5. 「重启」会停止全部受管进程，并按列表顺序重新启动启用项，相邻启动间隔 500 ms；「停止」停止全部受管进程；保存或切换某个 Preset 会先终止该 Preset 的旧进程树。

上移 / 下移只调整顺序，不会中断正在运行的进程；新顺序在下次启动或重启时生效。

### 本地化

- 界面提供简体中文（DSH 内置 locale id 为 `zh`，即 zh-CN）和 English（`en`）两套字典。
- 插件清单文案位于 `locale/zh.json`、`locale/en.json`。
- 页面文案由 `client.js` 内的 `zh` / `en` 字典注册到 `startupCommand` 命名空间；切换 DSH 语言后即时生效。
- 本 README 同时提供中文和英文说明。

### Preset 数据

Preset 保存在 DSH Profile 目录下的 `startup-command-presets.json`：

| 字段 | 说明 |
| --- | --- |
| `name` | Preset 名称。 |
| `command` | 传给所选解释器的指令。 |
| `kind` | `powershell`、`cmd`、`bash` 或 `python`。 |
| `cwd` | 可选工作目录；留空使用 DSH Profile 目录。 |
| `interpreter` | 可选解释器可执行文件；留空使用对应默认程序。 |
| `enabled` | 是否在 DSH 启动时运行，以及是否允许本 Preset 参与重启。 |

输出按 Preset 分开保存在 Host 内存中，上限 256 KiB；页面显示当前选中 Preset 的输出，重启 DSH 后清空。

### 工作方式

- 指令通过 DSH 的 `ctx.subprocess` 启动，Windows 下进入 Job Object，并设置隐藏窗口标志，因此不会弹窗。
- 启用项按列表顺序启动；一次启动多个 Preset 时，相邻两次启动间隔 500 ms。
- 停止、重启、保存/切换 Preset、停用插件或退出 DSH 时，会终止对应托管进程范围并等待其退出；超时会重试终止。Windows Job 会连同其下属进程/Job 一起结束。
- 逐项开关允许多个 Preset 并行运行；页面显示当前选中 Preset 的输出，多个进程启动时会写入名称分隔行。
- 输出中的 ANSI SGR 颜色（标准 16 色、256 色和 RGB）会渲染为彩色文本，非 SGR 控制序列会被移除。标准 ANSI 颜色使用浅色/深色两套调色板，避免深色模式下出现不可读的黑字。
- 页面跟随 DSH 的浅色/深色主题；切换主题时，页面和 ANSI 调色板会即时更新。
- 浏览器每 1 秒读取一次 `/startup-command/api/state`。
- `/startup-command/api` 路由受 DSH connection fence 保护；未认证请求返回 403。

### 离线安装

发布包是一个 npm tarball（`dsh-startup-command-<version>.tgz`）或包含该 tarball 的 zip。离线安装步骤：

1. 解压离线压缩包，得到 `dsh-startup-command` 目录（或先解包 tarball）。
2. 在目标 DSH 中打开 Plugin Manager，使用本地目录/离线包安装；也可以让 DSH Agent 用 `plugin_manager` 的 `install_bundle` 指向解压后的绝对目录。
3. 安装后刷新 DSH 页面。

本包没有 npm 依赖，安装时不需要联网。

### 限制

- 多个 Preset 可并行运行，但页面一次只显示当前选中 Preset 的输出；多个浏览器标签页看到的是同一份状态。
- 显式脱离 Job Object 的子进程（例如带 breakaway 标志）无法保证随 DSH 结束。
- 输出按 UTF-8 解码；如果 Preset 内的程序使用其他编码写出原始字节，可能出现乱码。

---

## English

Runs enabled presets when DSH starts, opens a **Startup command** page from the left sidebar to stream output, and terminates the relevant process trees on stop, restart, save/switch, or DSH exit.

### Requirements and install

- Windows 10/11; DSH with Cordis bundle and Plugin Manager support.
- Install from the offline zip or the plugin directory, then refresh DSH. See [INSTALL.md](INSTALL.md) for details.
- The package has no npm dependencies.

### Usage

1. Refresh the DSH page once.
2. Click the terminal icon named **Startup command** in the left sidebar.
3. Click **New preset**, choose an interpreter (PowerShell / CMD / Bash / Python), enter a name and command, and save.
4. Each preset row has an on/off switch; use ↑ / ↓ to set the execution order of enabled presets.
5. **Restart** stops every managed process and starts enabled presets in list order, 500 ms apart; **Stop** stops every managed process; saving or switching a preset first terminates that preset's old process tree.

Moving a preset only changes the stored order; it does not interrupt running processes. The new order applies on the next start or restart.

### Localization

- The UI ships Simplified Chinese (DSH's built-in locale id is `zh`, equivalent to zh-CN) and English (`en`) dictionaries.
- Plugin inventory copy lives in `locale/zh.json` and `locale/en.json`.
- Page copy is registered from the `zh` / `en` dictionaries inside `client.js` under the `startupCommand` namespace; switching the DSH language updates it live.
- This README is bilingual.

### Preset data

Presets are stored in `startup-command-presets.json` inside the DSH profile directory:

| Field | Meaning |
| --- | --- |
| `name` | Preset name. |
| `command` | Command passed to the selected interpreter. |
| `kind` | `powershell`, `cmd`, `bash`, or `python`. |
| `cwd` | Optional working directory; empty means the DSH profile directory. |
| `interpreter` | Optional interpreter executable; empty means the default program. |
| `enabled` | Whether this preset starts with DSH and participates in Restart. |

Output is kept per preset in Host memory, capped at 256 KiB; the page shows the selected preset's output and DSH restart clears it.

### How it works

- The command is launched through DSH's `ctx.subprocess`. On Windows it joins a Job object and uses hidden-window flags, so no console window appears.
- Enabled presets start in list order; when several start together, launches are 500 ms apart.
- Stop, restart, save/switch, plugin disable, and DSH exit terminate the managed process ranges and wait for them; timeouts retry termination. On Windows the Job ends its descendant processes/Jobs too.
- Per-preset switches allow several presets to run together; the page shows the selected preset's output, with a name separator when a process starts.
- ANSI SGR colors in the output (standard 16-color, 256-color, and RGB) render as styled text; non-SGR control sequences are removed. Standard ANSI colors use separate light/dark palettes so black-on-dark output stays readable.
- The page follows DSH's light/dark theme; switching the theme updates the page and the ANSI palette live.
- The browser polls `/startup-command/api/state` once per second.
- The `/startup-command/api` route is fenced by DSH's connection service; unauthenticated requests receive 403.

### Offline installation

The release artifact is an npm tarball (`dsh-startup-command-<version>.tgz`) or a zip containing that tarball and this package. To install offline:

1. Extract the offline zip and obtain the `dsh-startup-command` directory (or unpack the tarball first).
2. In the target DSH, use Plugin Manager to install from that local directory/offline package; alternatively ask the DSH agent to call `plugin_manager` `install_bundle` with the extracted absolute directory.
3. Refresh the DSH page after installation.

The package has no npm dependencies, so installation needs no network access.

### Limitations

- Several presets can run together, but the page shows only the selected preset's output; every browser tab sees the same state.
- A child that explicitly breaks away from the Job object cannot be guaranteed to terminate with DSH.
- Output is decoded as UTF-8; raw bytes written in another encoding may appear garbled.

---

## Files / 文件

- `index.js` — Host: preset store, ordered process lifecycle, output buffer, HTTP API.
- `client.js` — left-sidebar entry and main-column page with output viewer and preset editor.
- `cordis.patch.yml` — installs the `startup-command` loader row.
- `locale/` — plugin inventory titles and descriptions (`zh`, `en`).
- `icon.svg` — plugin icon.

---

## License / 许可证

MIT-0. See [LICENSE](LICENSE).

