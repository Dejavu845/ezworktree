# 清单外拓扑对账（KEEL #6 真缺口）

git 里有、`project.json` 没有的分支和 worktree 必须看得见。只标不动。不自动归档、不自动删。

## 判定

`declared`：

- 仓 `baseBranch`
- 任务的计划分支（`plannedBranch`）
- `project.worktrees[].branch`（含已归档记录）

除此之外的**本地**分支 / 非主 checkout 的活 worktree = `undeclared`。

豁免：remote-only、detached、空分支名。base 与托管任务永不打标。

## 字段

```ts
// RepoLane 加：
undeclared: boolean;
```

图仍是读层。不写 `.lattice/graph.json`，不加第四主视图。

## 人 / Agent

| 谁 | plant / delete 清单外 |
|---|---|
| 人 | 可以。不自动写入 `project.json`。种树仍不为此建任务。 |
| Agent | 拒绝。不进待批准队列。`TopologyError`，不是 Policy `ask`。 |

Agent 改清单内拓扑仍走 Policy（`createBranch` / `plantBranch` / `deleteBranch`）。

## UI

- 森林透镜「清单外」
- 行内 tag：清单外
- 分支仪表 delta：`n 条清单外`；点击切森林 + 清单外
- HOLDINGS.md `## 清单外`；Agent rules 写明不得 plant/delete 这些行

## 禁止

不自动清理、不把 plant 改成建任务、不把 `declared.push` 做成推送 UI、不改三主视图。
