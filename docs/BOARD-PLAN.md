# 占用板 + 设置通畅（对照四路意见后的裁定）

用户要：Agent 自己到 Dashboard 登记；板上看到正在开发的分支任务、正在做什么、大概多久、进度。再捋设置和 UI 是否通畅。

Fable 无额度。四路并行（立场不同）后由执行侧定案：

| 路 | 立场 | 采纳 |
|---|---|---|
| 车道占用派 | 升级任务车道；pulse 在树上；步骤比 `k/n`；掌控只准卫星 | 挂车道；不第四视图 |
| 磁盘怀疑派 | 先派生板；禁 `%` 与时钟估时；心跳可选且必须 cite | **进度与估时的算法**；两层交付 |
| UI 审计派 | 双掌控、在场含 backlog、三条开工入口、Policy 全展开 | **IA 疏通一刀**；车道不做 Trello 列 |
| 路线派 | pin 必须在看板前；登记与进度分刀 | pin 仍下一刀；**否决**自报 37% |

## 1. 一句话原则

看板是**占用透镜**（谁在哪条任务上），不是地图、不是家。进度只许**治理证据格**，不许 Agent 自报完成度。登记是带引用的短命声明， derivable 行永远先有。

## 2. 挂哪

**升级「任务车道」表，不改成状态列看板，不加第四主视图。**

- 掌控 = 四资产 + 以后的工序条。最多一块「在岗」卫星（未过期 pulse ≤5），点进车道。
- 森林 = 分支地图。
- 车道 = 占用板：现有表 + 行下心跳/证据；检查器「对照」看详情。
- UX.md 已拒「看板当地图」。状态列 Trello 会和滤镜双源，v1 不做。

工序图（仓→分支→树→产物版本）是容器链，只挂掌控。板上不画节点、不挂 ArtifactVersion。`Task.status` 只由人/治理改，不由 pulse、不由节点位置推导。

## 3. 磁盘合同

### 3.1 派生层（必做，零新写入）

读时从已有真相拼行。无 pulse 也必须有：

- 状态 · 标题 · `lattice/<slug>` · `@sha12` · ahead/behind · N files vs base
- blast 当场结论（不读上次摘要）
- handoff 有/无 · 卫生
- 「正在做」推导（按序第一条非空）：`status` 文案 → dirty 前 3 路径 → HEAD subject → 本任务待批准 → 卫生标签
- **证据格** 6 格（见 §4）
- **闲置 Δt** = `now - max(HEAD committerdate, pulse.writtenAt, task.updatedAt)`

plant 无任务：只显示 git 车道，禁止 pulse。

### 3.2 心跳层（第二刀，可薄）

路径：主仓 `.lattice/pulses/<taskId>.json`，`syncGovernanceToWorktree` 抄到树。不入库（已 exclude）。不进 catalog。不写进 `WORKZOON.md` / wiki / 常规 ledger。

只许 7 键，多键拒写：

```
v: 1
taskId
agent
doing        ≤80 字；含 % 或 \d+% → 拒
remainMin?   可选，声称「估」，过期即摘；板上必须标「估」
cite         { kind: "path"|"sha", value }
writtenAt    引擎盖章，忽略调用方时间
```

- 覆盖：同 taskId last-write-wins。
- stale：`writtenAt + 30min` **或** cite 失效 **或** `status ∉ {active,review}` → 板上当无。
- cite：`path` 必须在该树当前 blast 文件集；`sha` 必须是 HEAD 或祖先。
- 写权：Agent 只能写 `task.agent` 对得上的任务（fail closed 仍是默认 actor=agent，但**不进 Policy 表、不 ask**）。人可 `--clear`。
- `markDone` / 归档树 → 引擎删 pulse。
- 生成交接**不要**自动抄 pulse。handoff 是给下一任的快照，pulse 是最短命声明。

「正在做」文案优先级：活 pulse（cite 仍成立）> handoff `## In flight` 首条非占位 > HEAD subject > dirty 路径 > 推导句。

## 4. 进度怎么算（用户要百分比：给证据比，不给完成度）

**禁止**落盘 `percent`、自报 73%、commit 数、耗时、行数、token、跨任务平均。

**唯一合法数**：证据格 `亮/分母`，文案必须写「证据」不准写「完成度」。可以在旁边用同一比值画短条，**禁止**改写成 `50%`。

| # | 格 | 亮 |
|---|---|---|
| 1 | 开树 | 有 active worktree 且分支存在 |
| 2 | 有 diff | `base...HEAD ∪ dirty` 非空 |
| 3 | blast 未阻 | **当场** check ≠ blocked（无 diff → 不亮） |
| 4 | 交接在 | 有 `<!-- agent-handoff v1` |
| 5 | 交接填过 | Decisions 与 Next action 均非占位 |
| 6 | 百科过门 | 本任务 raw 已编译；`wiki.gate=off` 时本格划掉、不计入分母 |

估时：不做倒计时引擎。闲置 Δt 是观察。`remainMin` 只是 Agent 声称，标「估」，跟 pulse 一起过期。

GaugeStrip 继续数任务状态，不改成完成度。

## 5. 板上字段闭集

必有：谁（pulse.agent 否则 Task.agent）· 分支（活 RepoLane，可复制）· 正在做 · 证据 `k/n` · 闲置 / 过期年龄。

更强但不吵（只加这些）：cite 与活 HEAD 不符；自称步骤做完但仍 active（若以后加 steps）；待批准一粒；卫生 tag；冻层破例一粒。

不上板：产物版数、工序条、交接正文、允许路径、模型、PTY、会话、燃尽、故事点、在线绿点。

不采用「Agent 自报 steps[] 当进度」作 v1（容易变成第二套谎）。若以后要加，另开刀、仍只许 `k/n`。

## 6. 设置 / UI 审计（对照现码）

通：机器设置 vs 仓授权已拆；三主视图职责能分开；`confirmDestructive` / `motion` / `worktreesRoot` 有落点。

卡：

| 现象 | 人会以为 | 裁定 |
|---|---|---|
| 主视图和检查器页签都叫「掌控」 | 同一块 | 页签改「清单」 |
| 「在场」含 backlog（森林还含已检出） | 只等于进行中 | 文案改准，或 title 写清规则；滤镜只挂森林/车道 |
| 待批准规格写中栏、代码在右侧；任务格 pending 点去车道 | 徽标和格是同一入口 | 只留 titlebar 徽标 → `setTab("charter")`；格上去掉重复 pending |
| +新任务 / 创建并打开 / 检出 三条入口 | 都是开始干活 | compose 只建卡；开树留对照；检出只留森林选中后的对照；掌控页签不重复种树 |
| Policy 11 项全展开；declared/agentWrites 没上 UI | 这页就是全部 / 人必须逐项点 | 预设三段外默认折叠明细 |
| `openIn` 全仓无 spawn，按钮却写「创建并打开」 | 会拉起 Cursor | preview 标注不启动外部 App；按钮改「创建 worktree」 |
| 侧栏「N 任务」只数 active | 是任务总数 | 改「N 进行中」 |

一刀疏通：上表，不改三主视图、不加页签、不改 `src/**` 合同（除文案所需的 preview）。

## 7. Loop（插入 NODES-PLAN）

pin 仍是下一刀：产物身份必须先于占用板上的「构建」暗示。登记与 pin 分刀（Agent 本 loop 仍不能钉）。

0. WORKZOON.md 简报 — 已做
1. 顶栏 / 字体 — 已做
2. **产物 pin** — 原计划，不动
3. **IA 疏通** — 已做。§6 表；preview only
4. **派生占用板** — 已做。车道行永远有推导 + 证据格；零新写入。见 `OCCUPANCY-SPEC.md`。
5. **Pulse 登记** — 已做。§3.2；CLI `workzoon pulse`；板上覆「正在做 / 估」。见 `PULSE-SPEC.md`。
6. **工序图引擎** — 已做。纯读五种节点五条边；无 roster 节点。见 `GRAPH-SPEC.md`。
7. **掌控页读图** — 已做。工序条 + 清单版本列 + 在岗卫星≤5。见 `CONTROL-SPEC.md`。
8. **交接 frontmatter** — 已做。结构 + HEAD 对齐。见 `HANDOFF-SPEC.md`。
9. **Guard hook** — 已做。见 `GUARD-SPEC.md`。

每刀验收见下。测试一律 fixture + `LATTICE_HOME`。

### 刀 3 验收

- 检查器页签无第二个「掌控」
- 「在场」文案或 title 与代码一致
- 待批准只徽标进宪章
- `rg 创建并打开` preview 为 0 或改为创建 worktree
- Policy 明细默认折叠
- `pnpm --dir lattice/preview build`；引擎测试仍绿

### 刀 4 验收

- 无 pulse 的任务行仍有推导「正在做」+ 证据 `k/n`
- `WORKZOON.md` 不含进度 / `%`
- GaugeStrip 不改成完成度
- 无第四主视图、无 Trello 列

### 刀 5 验收

- 合法 pulse 覆盖「正在做」；过期 / 坏 cite / `doing` 含 `%` / 多键 → 板上当无
- Agent 不能写别人的 taskId
- markDone 后文件消失
- ledger 不因 pulse 刷屏

## 8. 不做

第四主视图 · 看板当地图 · Trello 状态列（v1）· Agent 自报 `%` · 倒计时引擎 · 在线绿点 · WebSocket/PID · catalog 存 pulse · pulse 进功能分支 / 简报 / wiki · 燃尽 / 故事点 / IM · 用 LLM 总结正在做 · spawn Agent · 把 handoff Live state 当实时 · Agent 自选 TTL · 登记进 Policy 矩阵并 ask · 推翻产物 pin
