# 人可读 worktree 根（KEEL #7）

新树种在 `~/Workzoon/worktrees/<project>/<slug>`。设置可改。已有树不搬家。仓内 `project.json` 仍不写 `rootPath`。

## 默认

| 环境 | `worktreesRoot` |
|---|---|
| 本机、未设 `LATTICE_HOME` | `~/Workzoon/worktrees`（catalog 可存波浪号） |
| 测试 / 云 fixture（设了 `LATTICE_HOME`） | `$LATTICE_HOME/worktrees`（不写进真实家目录） |

`<project>` 是项目名的 slug（小写、保汉字），不是 UUID。空名字才退回 `project.id`。

`<slug>` 仍是任务 slug；`plant` 用 `plant-<branch-slug>`。

## 不搬家

`openWorktree` / `plant` **只在新建**时调用 `worktreeRoot`。已有 `worktrees[].path` 且目录还在，原路返回。改设置、改默认，都不 `mv`、不改 git worktree 登记。

catalog 里已经写过的 `worktreesRoot` 原样保留。只有空值或新 catalog 才套新默认。

## 读写

- `expandWorktreesRoot`：`~` / `~/…` 在用的时候展开。
- `collapseWorktreesRoot`：家目录前缀收成 `~`，给人看、进 catalog。
- 引擎创建用展开后的绝对路径。HOLDINGS 仍写磁盘上的真路径。

## 禁止

不在本仓库检出上 `git worktree add`。不改三主视图。不把绝对 `rootPath` 写回 `project.json`。不自动迁移旧树。
