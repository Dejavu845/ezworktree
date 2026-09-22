# 破坏性要点名（KEEL #5）

人归档 worktree（删树）或删除分支时，默认必须输入**该分支名**。引擎执法，不只 UI。

## 闭集

| 动作 | 要点名 | 设置关时 |
|---|---|---|
| 归档 worktree（干净或 `--force`） | `worktree.branch` | 不检查 |
| 删除分支 | 要删的分支名 | 不检查 |

其它动作不进这把刀。Agent 仍走仓级 Policy（`ask` / `never`），不靠点名。

## 执法

`AppSettings.confirmDestructive` 默认 `true`。`actor=human` 且该项为开：`confirm` 必须与要点名完全相等（去首尾空白）。否则 `先打出「<name>」再确认。`

已批准请求回放：引擎带上已知分支名，不再让人在批准后再打一遍。

CLI：`--confirm <branch>`。HTTP：`body.confirm`。

## 不做

改 Policy 矩阵 · 第四主视图 · 让 Agent 点名过关 · 把确认写进 `project.json`
