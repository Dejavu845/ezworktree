# 派生占用板（BOARD-PLAN 刀 4）

零新写入。无 pulse 也必须有行。进度只许证据格 `k/n`，文案写「证据」，不准写「完成度」或 `%`。

## 正在做

按序第一条非空：

1. 状态文案（仅当状态本身就是占用故事：待办 / 未开树 / 待复审 / 已完成 / 已阻塞）
2. dirty 前 3 路径
3. HEAD subject
4. 本任务待批准
5. 卫生标签
6. 「进行中」

Pulse 覆盖见 `PULSE-SPEC.md`：活心跳 > 交接 In flight > 本表推导。

## 证据格

| # | 格 | 亮 |
|---|---|---|
| 1 | 开树 | 有活检出（`worktreeId` 指向的 active 树，或同任务 / 计划分支上的 live worktree）且分支存在。与车道 `worktreePath` 同一真相，不只要登记 id。 |
| 2 | 有 diff | `base...HEAD ∪ dirty` 非空 |
| 3 | blast 未阻 | 当场 check ≠ blocked；无 diff 不亮 |
| 4 | 交接在 | 有通过结构校验的交接（frontmatter + 标记 + 六节） |
| 5 | 交接填过 | Decisions 与 Next action 均非占位 |
| 6 | 百科过门 | 本任务 raw 已编译；`wiki.gate=off` 时本格划掉、不计入分母 |

闲置 Δt = `now - max(HEAD committerdate, task.updatedAt)`。

## 不做

第四主视图 · Trello 列 · 自报 % · GaugeStrip 改完成度 · `WORKZOON.md` 写进度 · pulse 文件
