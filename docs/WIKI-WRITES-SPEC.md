# agentWrites 执法（KEEL #6 百科侧）

`policy.wiki.agentWrites` 不是 POLICY.md 上的装饰。`concepts` / `sources` / `syntheses` 关掉以后，Agent 不能往对应目录写页；磁盘上多出来的页，lint 标 `write-forbidden`。

## 写入

引擎入口：`workzoon wiki-write --bucket <concepts|sources|syntheses> --title … --body …`

| 谁 | `agentWrites[bucket]=true` | `=false` |
|---|---|---|
| 人 | 可写 | 可写（人补编译） |
| Agent | 可写 | `WikiWriteError`，不进待批准 |

引擎种子页豁免：`wiki/concepts/charter.md`、`wiki/concepts/workzoon.md`。`entities/` 仍只由引擎编译。`raw/` 仍走 `ingestRaw`，本刀不动。

## lint

- 非种子页落在关掉的 bucket → `write-forbidden`（不可 auto-fix）
- `lint --fix` 不把这些页补进 index
- `agentWrites.sources=false` 时不报 `raw-uncompiled`（Agent 没法编译进 `wiki/sources/`）
- `markDone` 在 `wiki.gate=block` 时：交接 raw 未编译仍拦（sources 开着时）；`write-forbidden` 也拦

`agentWrites.concepts=false` 时 `mergePolicy` 仍把 `gate` 降为 `off`（已有钳制）。

## UI

宪章·授权明细里三对「禁止 / 允许」。百科页人可以 `wiki-write`。不加第四主视图。不 spawn。

## 禁止

不把 wiki 义务做成总开关。不写向量库。不让 Agent 改 `entities/` / `raw/`。
