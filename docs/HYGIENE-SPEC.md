# ROADMAP #5 卫生透镜（Fable · 这一刀）

卫生是筛选透镜「待清理」，不是第 4 个主视图。只标不动。不自动归档、不自动删。`STALE_DAYS = 14` 写在 `map.ts`，不进 Policy。

## 字段

```ts
export type HygieneKind = "merged" | "stale" | "no-handoff";
// RepoLane 加：updatedAt: string; merged: boolean; hygiene: HygieneKind[];
```

顺序固定：`merged → stale → no-handoff`。

## 豁免（永不打标）

remote-only、base 分支、HEAD、detached、无 sha。

## 判定

- **merged**：`mergedBranches(root, base)` 一次 git；刚建的托管任务分支 tip==base tip 且任务还是 backlog/active → 不标。
- **stale**：非 atBaseTip，且 `max(lane.updatedAt, worktree.createdAt, task.updatedAt)` 超过 14 天。
- **no-handoff**：托管 lane，任务 `active|review`，且没有有效 handoff。

## UI

- Filter 加 `hygiene` / 「待清理」
- 行内 tag：已合入 / 14 天无动 / 缺交接
- 分支仪表可选 `hygieneCount` delta；点击切森林 + 待清理
- HOLDINGS.md `## 卫生` + 分支表第 4 列

## 禁止

不自动清理、不按 lane 调 git、不改 delete/archive 守卫、不改 invariants 共享 fixture。
