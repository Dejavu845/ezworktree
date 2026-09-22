# 打开配方（overnight #4）

`AppSettings.openIn` 是剪贴板配方，不是启动器。引擎、preview、Swift 都不 `spawn` Cursor / VS Code / Finder / 终端。

## 配方

| `openIn` | 标签 | 复制内容 |
|---|---|---|
| `cursor` | 复制打开命令，不会自动打开 | `cursor <path>` |
| `vscode` | 复制打开命令，不会自动打开 | `code <path>` |
| `finder` | 复制打开命令，不会自动打开 | `open <path>` |
| `terminal` | 复制打开命令，不会自动打开 | `cd <path>` |
| `none` | 只复制路径 | `<path>` |

路径带空格时加引号。`openRecipe` 是纯函数，不碰进程。

## UI

- 设置：「打开配方」+ 说明「只复制命令，不启动外部 App」
- 对照：已有 worktree 时，「复制 … 配方」
- 创建 / 检出成功后把配方写入剪贴板
- Swift「创建并打开」改「创建 worktree」。本环境无 Xcode，不在此验证原生壳

## 禁止

`child_process.exec` / `open` / `xdg-open` 拉起编辑器。第四主视图。改三主视图 IA。
