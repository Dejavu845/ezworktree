# 黎明调研 loop（到 2026-09-15 07:00 Asia/Shanghai）

十分钟一圈。调研 UI / 动效 / 已落地功能，修设施 bug，把人从进仓到完成的流程补完整。不是再铺玻璃。

硬停：Asia/Shanghai 已到或过 **2026-09-15 07:00** → unsubscribe `workzoon-dawn-iterate` 和 `workzoon-dawn-stop`，不开新刀，三行报告：停了 / 落地了哪几圈 / PR。

## 这一圈怎么做

1. 读本文件「队列」第一件未勾的。
2. 只做一件。能复现的 bug 优先于新功能。
3. 不重做已勾。不发明第四视图。不引 Three.js / GSAP / `motion/react`。不在本仓库检出上 `git worktree add`。不提交根 `pnpm-lock.yaml`。
4. 测试绿再 commit。
5. UI 刀：短条目 + 1 视频或 1–2 静帧。调研刀：改本文件「记录」。

## 已落地（不要重做）

| 层 | 在哪 | 状态 |
|---|---|---|
| 三主视图 | 掌控 / 全部分支 / 任务车道 | 锁死 |
| 检查器六页 | 清单 · 对照 · 宪章 · 交接 · 范围 · 百科 | 锁死 |
| 动效 7 动词 | `MOTION-SPEC.md`：rise / scene / pane / press / receive / tick / depth | 已做 |
| 双皮肤 | lean 纸面 · forge 晶圆工位，同一 `WorktreeDeck` | 已做 |
| 玻璃材料 | chrome / 四格 / 胶囊 / 甲板 / pulse | 窗口已关 |
| 百科检索 | `WIKI-SEARCH-SPEC.md` | 已做 |
| 任务闭环读层 | `LOOP-SPEC.md` 对照工序条 | 已做 |
| 过夜治理 | 拓扑 / agentWrites / worktree 根 / 复制配方 | 已做 |

工场皮肤：视差和晶圆是皮肤刀；玻璃刀给两套甲板同材料。闭环下一手接到工位卡上。百科仍不在卡上。

## 完整流程（人）

见 `FLOW-SPEC.md`。一句话：登记仓 → 掌控看数 → 车道建卡 → 对照种树（只复制配方）→ 心跳（文件或 sha）→ 交接 → 完成。`/` 查百科。工场是同一流程的深色地板。

## 队列

- [x] **证据格 tree 不亮**：对照用车道路径，证据格只认 `task.worktreeId`。圈 1：开树格跟 live checkout / 同任务 active 树对齐。
- [x] **交接页也挂闭环条**：完成只在对照。做完停在交接时看不见「已完成」。圈 0：交接挂条；标记完成后回对照。
- [x] **建卡后收起组卡条**：`+ 新任务` 开着挡住车道。圈 0：建卡后 `composeOpen=false`。
- [x] **工位卡下一手**：forge/lean 甲板点卡 → 对照并读下一手（不新视图）。圈 2：卡上写下一手动词；点卡切对照，仍停全部分支。
- [x] **pulse cite**：短 sha / 绝对路径相对化；无 sha 时登记失败要说人话。圈 3：写时收相对路径；空 cite / 对不上说中文。
- [x] **百科空搜自动展开 index** 是否挤掉命中列表；搜定时不要误开无链接页。圈 4：`wikiAutoOpen` 恒空；只点行 / j/k / Enter 打开。
- [x] **车道 taskId 对不齐**：森林选 `lattice/修播放器` 才稳。圈 5：`resolveSelection` — 车道跟 taskId，森林跟车道；无任务分支不清错卡。
- [x] **已归档树仍占甲板**：`status: archived` 的 worktree 不该当活工位。圈 6：车道不写归档/失踪路径；甲板排除仓根。
- [x] **键盘**：`/` 百科、2 交接；对照下一手有没有快捷键（不要抢 j/k）。圈 7：select 里不抢 `/` `2`；`n` 走下一手。
- [x] **Swift 差距表**：只记，本环境无 Xcode，不写 Swift。圈 8：`SWIFT-GAP.md`。

- [x] **对照主按钮被心跳抢**：未开树时「登记」盖住「创建 worktree」。圈 9：心跳盒等开树；主按钮只跟下一手。
- [x] **掌控树数含仓根**：四格 / 侧栏 `worktree 2`，甲板 1 棵。圈 10：`liveBayCount` 跟甲板同一口径。
- [x] **掌控工序条仍含主树**：四格已是 1，条上 `2 · 主树`。圈 11：`processStripView` 只数活检出，仓根留在图里给 pin/build。
- [x] **完成失败 toast 英文**：`Cannot mark done: …`。圈 12：`doneRejectReason` 跟人话，跟 pulse cite 同一口径。
- [x] **交接页主按钮抢下一手**：未开树仍写「生成交接」。圈 13：交接主按钮跟 `nextHandIntent`，跟对照同一口径。
- [x] **对照路径写成仓根**：未开树 / 归档卡「路径」是主 checkout。圈 14：`bayPath` 跟甲板同一口径，空则「创建后才会有独立目录」。
- [x] **归档复审卡催种树**：`archive` 把卡打成 review，闭环仍写「创建 worktree」。圈 15：review 且无活树 → 写交接 / 完成。
- [x] **交接页 hint 双份 / 未开树摊表单**：LoopRail 已有 hint，下面又写一遍；种树前还摊决定框。圈 16：hint 只留条上；`intent=tree` 不画交接表单。
- [x] **未开树交接仍写不能完成**：种树前页脚还说「没有交接文件就不能完成」。圈 17：`intent=tree` 不画这句。
- [x] **进仓失败英文**：`is not a git repository`。圈 18：`initRejectReason` 跟人话。
- [x] **种树路径已存在仍英文**：`Worktree path already exists`。圈 19：`plantRejectReason` 跟人话。
- [x] **心跳正在做失败英文**：`Pulse doing cannot contain %` / empty / 超长。圈 20：`doingRejectReason` 跟人话。
- [x] **百科收入中文撞车仍英文**：ingest dest 把中文收成当天 `source.md`，第二篇 `Raw source already exists`。圈 21：slug 跟 write 同一口径；撞车说中文。
- [x] **打字确认失败英文**：`Type … to confirm`。圈 22：`confirmRejectReason` 跟人话。归档和删分支同一句。
- [x] **删活树 / 缺 worktree 仍英文**：`Archive first` / `Task has no worktree`。圈 23：`deleteLiveRejectReason` / `archiveRejectReason` 跟人话。
- [x] **删基线 / HEAD / 未合入仍英文**：`Cannot delete base` / `HEAD of a checkout` / `pass force`。圈 24：`deleteRejectReason` 跟人话。
- [x] **建卡基线 / 意图仍英文**：`own branch as base` / `Base branch not found` / 非法意图。圈 25：`taskRejectReason` 跟人话。
- [x] **森林 / 对照 `on` 基线**：行上写 `on main`。圈 26：改成「基线」。产物行 `on branch` 改成「在」。
- [x] **森林 / 产物英文标签**：`checkout` / `remote` / `gitignore` / `tracked`。圈 27：改成检出 / 远程 / 已忽略 / 已跟踪。
- [x] **破例 hover / 心跳 cite 英文**：`allowFrozenTouch (no reason on record)`、sha / path。圈 28：hover 写「没有记下破例理由」；选项标签短 sha / 路径。值仍是 sha / path。不改 `formatEscalation` 磁盘摘要。
- [x] **车道 / 森林 / 四格 `worktree` 标签**：表头和掌控格仍写英文。圈 29：表头改路径；四格改树（跟 FLOW-SPEC）；侧栏 N 棵树；甲板「工位 · N 棵检出」。「创建 worktree」动词不动。
- [x] **百科收入区标题英文**：`ingest`。圈 30：改成「收入原文」。按钮仍是「收入 raw」。不改 raw 磁盘、不跑收入。
- [x] **百科顶栏英文**：`LLM Wiki`。圈 31：改成「百科」，跟检查器页签同一口径。不改 `docs/LLM-WIKI.md` / 引擎种子文。
- [x] **百科 hint 英文 API 名**：`wiki-write` / `agentWrites`。圈 32：改成「编译受 Agent 授权约束」。raw 仍是层名。不改授权磁盘。
- [x] **百科 lint 按钮英文**：圈 33：改成「检查」。下方 issue kind 仍是引擎英文。不改 lint 磁盘格式。
- [x] **百科检查 kind 英文**：`index-missing` / `orphan` / `raw-uncompiled`…。圈 34：预览用 `ISSUE_LABEL` 显示中文。kind 值 / detail / 磁盘不动。
- [x] **百科检查 detail 英文**：`is not listed` / `has no wiki page`…。圈 35：引擎 detail 说中文。kind 值不动。不改 raw / wiki 磁盘。
- [x] **编译百科 WikiWriteError 英文**：`Agent may not write wiki/…`。圈 36：`wikiWriteRejectReason` 跟人话。不改授权磁盘，不在 Harbor 点编译。
- [x] **种树空名英文**：`Branch is required`。圈 37：`plantNameRejectReason` 跟人话。空名在写盘前抛。不种 Harbor。
- [x] **钉产物空名英文**：`Artifact name is required`。圈 38：`pinNameRejectReason` 跟人话。空名在写盘前抛。不钉 Harbor。
- [x] **卸钉空 id / 找不到英文**：`Pin id is required` / `Pin not found`。圈 39：`pinUnpinRejectReason` 跟人话。不卸 Harbor 真钉。
- [x] **未进仓英文**：`Project is not initialized`。圈 40：`projectRejectReason` 跟人话。不改 Harbor 磁盘。
- [x] **未知任务英文**：`Unknown task`。圈 41：`taskMissingRejectReason` 跟人话。requireTask / guard 同一句。不种 Harbor。
- [x] **交接缺结构英文**：`Handoff is missing a valid v1 frontmatter…`。圈 42：`handoffRejectReason` 跟人话。写盘前抛。不改交接磁盘格式。
- [x] **检出无工区英文**：`No Workzoon project at this checkout`。圈 43：`checkoutRejectReason` 跟人话。resolveGovernedRoot / load miss 同一句。不改 Harbor 磁盘。
- [x] **人闸英文**：`Only a human can pin/unpin/sync`。圈 44：`humanRejectReason` 跟人话。不钉不卸 Harbor，不同步 Harbor。
- [x] **改授权英文**：`Only a human can update policy`。圈 45：`humanRejectReason("policy")` 跟人话。写盘前抛。不改 Harbor 授权表。
- [x] **批请求英文**：`Only a human can decide requests`。圈 46：`humanRejectReason("decide")` 跟人话。写盘前抛。不批 Harbor 真请求。
- [x] **清心跳英文**：`Only a human can clear a pulse`。圈 47：`pulseClearRejectReason` 跟人话。写盘前抛。不清 Harbor 真心跳。
- [x] **错 Agent 心跳英文**：`Agent can only pulse a task assigned to them`。圈 48：`pulseWriteRejectReason` 跟人话。写盘前抛。不改 Harbor 真心跳。
- [x] **请求已批 / 找不到英文**：`Request is not pending` / `Unknown request`。圈 49：`requestRejectReason` 跟人话。写盘前抛。不批 Harbor 真请求。
- [x] **动作不能重放英文**：`Action cannot be replayed`。圈 50：`requestRejectReason("replay")` 跟人话。不批 Harbor 真请求。
- [x] **心跳形状英文**：`Pulse must be an object` / cite 形状。圈 51：`pulseShapeRejectReason` 跟人话。不改 pulse 磁盘格式，不改 Harbor 真心跳。
- [x] **守卫拦住英文**：`guard blocked: …`。圈 52：`guardRejectReason` 跟人话。finding.reason 仍是引擎英文。不改 Harbor 磁盘。
- [x] **设置 worktree 根目录**：圈 53：预览改「检出根目录」。创建 / 归档 worktree 动词不动。不写 Swift。
- [x] **车道空路径 tooltip**：`尚未创建 worktree`。圈 54：改「还没创建检出」。格上「未创建」不动。创建 / 归档 worktree 动词不动。
- [x] **内存缺仓路径英文**：`Project.rootPath is required in memory`。圈 55：`rootPathRejectReason` 跟人话。写盘前抛。不改 Harbor 磁盘。
- [x] **改宪章 Agent 英文**：`Agent can only change conventions…` / shrink doNotTouch / remove layers / unfreeze。圈 56：`charterRejectReason` 跟人话。写盘前抛。不改 Harbor 宪章。
- [x] **提示太工程**：toast / hint / 空态仍写 cite、sha、绝对路径、门禁。圈 57：对人说人话。创建 / 归档 worktree 动词不动。不改磁盘字段。
- [x] **百科页越界 / 未知桶英文**：`Page is outside the wiki/raw trees` / `Missing page` / `Unknown wiki bucket`。圈 58：`wikiPageRejectReason` 跟人话。写盘前抛。不改 Harbor 百科。
- [x] **浏览路径越界英文**：`Path is outside registered repos and worktrees` / `Not a directory`。圈 59：`sourceRejectReason` 跟人话。不改 Harbor 磁盘。
- [x] **清单外分支英文**：`Branch … is outside HOLDINGS`。圈 60：`topologyRejectReason` 跟人话。写盘前抛。不种不删 Harbor 真分支。
- [x] **钉产物找不到英文**：`Artifact not found`。圈 61：`pinMissingRejectReason` 跟人话。写盘前抛。不钉 Harbor。
- [x] **清单外筛选太工程**：`git 有、project.json 没有`。圈 62：改「仓库里有、清单里没有。你来处理，不会自动删。」不改磁盘。

队列空：对着 FLOW-SPEC 走一遍 Harbor，修最刺眼的一处设施，不发明产品。

## 记录

- 圈 0：交接挂条；建卡收起组卡条。
- 圈 1：证据格开树跟车道 live path 对齐。`planted && branchOk` 仍要；找树不再只靠 `worktreeId`。
- 圈 2：工位卡写下一手；点卡打开对照。无任务卡不写动词。
- 圈 3：pulse cite 收短 sha / 绝对路径；空 cite 说人话。
- 圈 4：百科不自动展开 index / 第一条命中。
- 圈 5：选中对齐。车道 j/k 不再被森林 laneId 抢走任务。
- 圈 6：归档树和主 checkout 不再占甲板。活树才写 `worktreePath`（仓根除外）。
- 圈 7：`/` 百科搜索，`2` 交接；`n` 对照下一手。打字（含 select）和 j/k 不抢。
- 圈 8：Swift 差距只记。壳仍是任务 List + 三按钮；分支误写成 `lattice/<slug>`。不写 `.swift`。
- 圈 9：对照主按钮跟下一手。未开树不画心跳盒，避免「登记」盖过种树。
- 圈 10：掌控 / 侧栏树数不把仓根算进去，跟甲板一致。
- 圈 11：掌控工序条树格跟甲板同一口径。仓根仍是图节点，条上不写「主树」不当活 bay。
- 圈 12：完成失败 toast 说中文（缺交接 / head 不对 / 爆炸半径 / 百科门禁）。不改交接磁盘格式。
- 圈 13：交接页主按钮跟下一手。未开树是「创建 worktree」；心跳是「登记心跳」。不发明第四按钮组。
- 圈 14：对照路径不写仓根。未开树 / 归档卡显示「创建后才会有独立目录」。仓行仍复制主树。
- 圈 15：待复审且树不在，下一手是写交接，不催种树。backlog / active 未开树仍是创建 worktree。
- 圈 16：交接页 hint 不重复。未开树不摊决定 / 下一步，只留「创建 worktree」。
- 圈 17：未开树交接页不再写「没有交接文件就不能完成」。待复审 / 写交接时这句还在。
- 圈 18：登记仓路径不是 git 时 toast 说中文。不改磁盘格式。
- 圈 19：种树路径已被占时 toast 说中文。openWorktree / plantBranch 同一句。不改磁盘格式。
- 圈 20：心跳正在做空 / 带 % / 超长 / 估分非法时 toast 说中文。不改 pulse 磁盘格式。
- 圈 21：百科收入原文中文标题不再挤进同一天的 `source.md`。dest 已被占时说中文。不改已有 raw 文件。
- 圈 22：破坏性确认打错分支名时 toast 说中文。归档和删分支同一句。不改确认开关。
- 圈 23：删还有活树的分支、给没树的卡归档，toast 说中文。基线 / HEAD / 未合入仍留后圈。
- 圈 24：删基线 / 当前检出 / 未合入分支 toast 说中文。预览没有强制勾，未合入只劝先合入。
- 圈 25：建卡意图非法、基线空/不存在、拿自己的计划分支当基线，toast 说中文。不改建卡磁盘格式。
- 圈 26：森林标签、对照叠基线、产物所在分支不再写英文 on。
- 圈 27：森林归属 checkout/remote、产物 gitignore/tracked 改成中文。HEAD 仍是 git 专名。
- 圈 28：车道破例 hover、心跳 cite 选项改中文。磁盘 escalation / WORKZOON 摘要仍是引擎英文。
- 圈 29：车道 / 森林表头、掌控四格、侧栏树数、甲板眉不再写英文 worktree。创建 / 归档 worktree 仍是动词。
- 圈 30：百科收入区标题改「收入原文」。lint 按钮和下方 issue kind 仍是引擎英文。
- 圈 31：百科页 h2 改「百科」。hint 里的 wiki-write / agentWrites、lint 按钮仍留后圈。
- 圈 32：百科 hint 不再写 wiki-write / agentWrites。lint 按钮仍留后圈。
- 圈 33：百科 lint 按钮改「检查」。issue kind 仍留后圈。
- 圈 34：百科检查结果 kind 改中文标签。detail 仍是引擎英文。
- 圈 35：百科检查 detail 说中文。WikiWriteError 仍留后圈。
- 圈 36：Agent 写关闭的 wiki 桶，toast 说中文。人不拦。不改授权表。
- 圈 37：种树没写分支名，toast 说中文。路径已存在仍走 plantRejectReason。
- 圈 38：钉产物没写名字，toast 说中文。Pin id / 找不到仍留后圈。
- 圈 39：卸钉空 id / 找不到钉，toast 说中文。不卸真钉。
- 圈 40：路径没有工区时 toast 说中文。不是 git 仍走 initRejectReason。
- 圈 41：找不到任务 toast 说中文。空 id 另句。不种树。
- 圈 42：写非法交接 toast 说中文。缺 v1 头 / 标记 / 六节同一句。不改磁盘。
- 圈 43：检出没有工区时 guard 说中文。跟登记仓同一句。不改 Harbor。
- 圈 44：Agent 钉 / 卸 / 同步 AGENTS.md 说中文。不改授权表，不钉不卸 Harbor。
- 圈 45：Agent 改授权 toast 说中文。写盘前抛。不改 Harbor 授权表。
- 圈 46：Agent 批请求 toast 说中文。幽灵 id 写盘前抛。不批 Harbor 真请求。
- 圈 47：Agent 清心跳 toast 说中文。写盘前抛。不清 Harbor 真心跳。
- 圈 48：错 Agent 登记心跳 toast 说中文。写盘前抛。不改 Harbor 真心跳。
- 圈 49：请求已批过 / 找不到 toast 说中文。写盘前抛。不批 Harbor 真请求。
- 圈 50：不能重放的动作 toast 说中文。不批 Harbor 真请求。
- 圈 51：心跳对象 / 多键 / cite 形状 toast 说中文。不改磁盘。
- 圈 52：守卫拦住提交 toast 说中文。爆炸半径 reason 字段不动。
- 圈 53：设置标签改「检出根目录」。创建 / 归档 worktree 仍是动词。不写 Swift。
- 圈 54：车道空路径 tooltip 改「还没创建检出」。创建 worktree 仍是动词。
- 圈 55：内存里没有仓路径 toast 说中文。写盘前抛。不改 Harbor。
- 圈 56：Agent 越权改宪章 toast 说中文。写盘前抛。不改 Harbor 宪章。
- 圈 57：提示和注释对普通人说。不堆 cite / sha / 绝对路径 / 门禁。创建 worktree 仍是动词。
- 圈 58：百科页不在百科里 / 找不到 / 不认识的类别，toast 说人话。写盘前抛。不改 Harbor 百科。
- 圈 59：浏览路径不在仓里 / 不是文件夹，toast 说人话。不改 Harbor。
- 圈 60：清单外分支 toast 说人话。写盘前抛。不种不删 Harbor 真分支。
- 圈 61：钉产物找不到 toast 说人话。写盘前抛。不钉 Harbor。
- 圈 62：清单外筛选注释对人说。不改磁盘。

## 禁止

第四主视图 · 向量百科 · `declared.push` Git GUI · 再开玻璃 3h · spawn Cursor/Finder · 改 handoff/pulse 磁盘格式
