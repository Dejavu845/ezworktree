# 工序图引擎（NODES-PLAN 刀 6）

纯读。不写盘。无 canvas。无 roster 节点。掌控页读图见 `CONTROL-SPEC.md`。

## 节点闭集（5）

| kind | 工序 | 磁盘 |
|---|---|---|
| `repo` | 来源 | `project.json` + remotes（remote 不是节点） |
| `branch` | 分支 | 本地 `refs/heads/*` |
| `worktree` | 检出 | `git worktree list` |
| `artifact` | 构建 | `.lattice/artifacts/**/*.json` |
| `task` | 工单 | `tasks[]` |

Commit / sha 不是节点。未种树的任务没有 `branch` 节点，也就没有 `open` 边。

## 边闭集（5）

`ref` Repo→Branch · `checkout` Branch→Worktree · `open` Task→Branch · `build` Worktree→Artifact · `pin` Branch→Artifact

`pin` 边上：`offBranch` = sha 不是分支祖先；`behind` = `rev-list --count sha..branch`。

## API

`GET /api/graph?root=` · CLI `workzoon graph --root`

## 不做

第四主视图 · canvas · Agent 节点 · 把图写进 `.lattice/`
