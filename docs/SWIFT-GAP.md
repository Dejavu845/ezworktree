# Swift 壳差距（只记，本环境不写）

`lattice/macos/` 是薄 SwiftUI 读层，同一引擎 `:7780`，请求已带 `X-Workzoon-Actor: human`。本云无 Xcode，**不编译、不改 `.swift`**。人走完整流程以 preview 为准（`FLOW-SPEC.md`）。Mac 上有 Xcode 再追，仍三主视图 + 六页签，不第四视图，不 spawn。

对照日期：2026-09-14。preview HEAD 已含黎明圈 0–7。

## 壳现在有什么

| 有 | 在哪 |
|---|---|
| 分组 → 项目列表 | `ContentView` 左栏 |
| 任务列表（题 / 状态 / agent） | 中栏，**不是**掌控 / 全部分支 / 车道 |
| 宪章目的 + 冻层一行 | 右栏 Form |
| 仓路径、题、允许路径 | 右栏「对照」 |
| 创建 worktree / 生成交接 / blast | 三个 Button；交接不读回、不填决定 |
| 机器设置窗 | `Settings { }`：皮肤可写；openIn / 动效 / 确认只展示 |
| `decide` HTTP | `EngineClient` 有，UI 没有待批准 |

## 信息架构（对 FOUNDATION §8）

| 该有 | Swift 实际 |
|---|---|
| 中栏三主视图：掌控 / 全部分支 / 任务车道 | 只有任务 List |
| 检查器六页：清单 · 对照 · 宪章 · 交接 · 范围 · 百科 | 一页 Form 揉在一起 |
| 甲板只放活树 | 无森林、无 `WorktreeDeck` |
| `/` 百科 · `2` 交接 · `n` 下一手 · j/k 换行 | 无快捷键 |

## FLOW-SPEC 人路径

| 步 | preview | Swift |
|---|---|---|
| 登记仓 | `+ 登记仓` → `/api/init` | 无 |
| 掌控四格 / 工序条 / 在岗 | 有 | 无 |
| 建卡（意图 feat\|spike\|hotfix、基线、允许路径） | 有 | 无；中栏只读已有卡 |
| 对照种树，只复制配方 | 有；不 spawn | 有按钮；**不复制** `openIn` 配方 |
| 心跳（path / sha，禁 %） | 有 | 无 client、无 UI |
| 读回交接再完成 | GET `/api/handoff` + `/api/done` | POST 生成即止；无 GET、无完成 |
| `/` 查百科 | 有 | 无 |

## 黎明圈（preview 已做，Swift 未跟）

| 圈 | preview | Swift |
|---|---|---|
| 0 | 交接挂闭环条；建卡收起组卡 | 无组卡、无闭环条 |
| 1 | 开树格跟 live checkout | 无占用板 |
| 2 | 工位卡下一手 | 无甲板 |
| 3 | pulse cite 相对化 / 人话 | 无 pulse |
| 4 | 百科不自动展开 | 无百科 |
| 5 | `resolveSelection` 车道/森林 | 中栏选任务即绑定，无森林 |
| 6 | 归档路径不占甲板 | 无甲板；`maps` 模型无 hygiene / undeclared |
| 7 | `/` `2` `n` | 无 |

## 显示错误（有 Xcode 时先修）

`ContentView` 把分支写成 `` `lattice/\(task.slug)` ``。引擎计划分支是 `feat|spike|hotfix/<slug>`（`INTENT-SPEC.md`）。这不是读 `lane.branch` / `plannedBranch`。

## HTTP 对照

Swift 已接：`GET /api/snapshot`、`POST /api/worktrees/open`、`POST /api/handoff`、`POST /api/blast`、`GET|POST /api/settings`、`POST /api/requests/decide`。

未接（preview 有）：`init`、`tasks`、`pulse`、`pulse/clear`、`GET handoff`、`done`、`wiki*`、`files`、`plant`、`archive`、`policy`、`branches/delete`、`agents/sync`、`artifacts*`、`graph`。

`Snapshot` 解码没有 occupancy / holdings / drift / graph。`RepoLane` 没有 `hygiene`、`undeclared`、`taskStatus`。

## 追平时不要做

第四主视图 · 向量百科 · `declared.push` Git GUI · spawn Cursor/Finder/终端 · 改 handoff/pulse 磁盘格式 · 在本环境写 Swift / 开 Xcode · 把 `lattice/<slug>` 写回引擎
