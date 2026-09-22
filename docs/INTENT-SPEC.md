# 开树三轴（意图 · 基线 · 范围）

人从仓名进场。分类不是 UI / 功能 / 后续抽屉，而是开树时选的三件事。

## 闭集

| 轴 | 人看见 | 磁盘 |
|---|---|---|
| 意图 | 功能 / 试探 / 热修 | `feat/<slug>` · `spike/<slug>` · `hotfix/<slug>` |
| 基线 | 默认仓 base；或一条已存在的本地分支 | `task.baseBranch` → `git worktree add -b … <base>` |
| 范围 | 允许路径 / 冻层 | 已有 `allowedPaths` · `allowFrozenTouch` |

意图只有三个。`ui` / `later` / 自造前缀一律拒绝。缺省 `feat` + 仓 `baseBranch`。

## 写入

- `createTask` 只建卡。不预种空树。
- `openWorktree` 才 `git worktree add -b <intent>/<slug> <base>`。
- 叠做：`baseBranch` 必须是已有本地分支，且不能等于自己的计划分支。
- 旧卡无字段：读时补 `feat` + 仓 base。已开的树仍认 `worktrees[].branch`。

## 读

森林按分支第一段分组（`feat/` `spike/` `hotfix/`）。叠做行标 `on <base>`。车道仍是占用，不按意图分列。

## 不做

不为每个大类预种树。不把意图当阶段。不让意图代替冻层。不加第四主视图。
