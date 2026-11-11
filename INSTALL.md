# DSH Startup command — Install / 安装

Version / 版本: **1.8.0**

## Offline / 离线安装

1. Extract the package and keep the `dsh-startup-command` directory.
   解压安装包，保留 `dsh-startup-command` 目录。
2. In DSH, open Plugin Manager, choose to install from a local directory, and select that directory.
   在 DSH 中打开 Plugin Manager，选择从本地目录安装，并选中该目录。
3. Refresh the DSH page.
   刷新 DSH 页面。

The package has no npm dependencies and installs without network access.
本包没有 npm 依赖，安装无需联网。

## From GitHub / 从 GitHub 安装

```sh
dsh plugin --profile <profile> add github:Fuxfantx/dsh-startup-command
```

Then refresh the DSH page. 然后刷新 DSH 页面。
