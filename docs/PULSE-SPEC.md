# Pulse 登记（BOARD-PLAN 刀 5）

最短命声明。不进 catalog、不进 `WORKZOON.md`、不进 wiki、不进常规 ledger。生成交接不抄 pulse。

## 磁盘

主仓 `.lattice/pulses/<taskId>.json`。`syncGovernanceToWorktree` 抄到树。已被 `.lattice/` exclude。

只许 7 个顶键：`v` `taskId` `agent` `doing` `remainMin?` `cite` `writtenAt`。多键拒写。`writtenAt` 引擎盖章。

- `doing` ≤80 字，含 `%` 拒。
- `remainMin` 可选正整数；板上标「估」，跟 pulse 一起过期。
- `cite.kind` = `path` | `sha`。path 必须在当场 blast 文件集；sha 必须是 HEAD 或祖先（短 sha 可）。写时把绝对路径收成相对路径，去掉 `@`。空 cite / 对不上时引擎说人话，不丢英文内部句。

## 活 / 当无

同 taskId last-write-wins。板上当无：`writtenAt + 30min`，或 cite 失效，或 `status ∉ {active,review}`。

写权：Agent 只能写 `task.agent` 对得上的任务（不进 Policy，不 ask）。人可 `--clear`。`markDone` / 归档树 → 删文件。

「正在做」：活 pulse > 交接 `## In flight` 首条非占位 > 派生占用句。

## CLI

`workzoon pulse --task <id> --doing <text> --cite path:app/x.tsx --remain 20`  
`workzoon pulse --task <id> --clear 1 --actor human`
