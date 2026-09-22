# Lattice 路线

v1 已经证明：宪章 + 一任务一树 + 强制交接。下面是顾问简报里值得做、但会撑破第一刀的部分。

## 下一刀

玻璃控制台窗口已关。百科检索与 Harbor 闭环已做。下一刀见下表。见 `WIKI-SEARCH-SPEC.md`、`LOOP-SPEC.md`。

顺序：

1. **百科本地检索**：已做。`q=` 带回 `hit.field` / `hit.snippet`；百科页可点 raw、可跳 `[[wikilink]]`，`/` 聚焦搜索。不是向量，不是第四视图。
2. **Harbor 真任务闭环**：已做。对照工序条读下一手；点文件填 pulse cite；GET 交接。见 `LOOP-SPEC.md`。
3. **黎明调研 loop**：进行中，到 2026-09-15 07:00 Asia/Shanghai。十分钟一圈。见 `DAWN-LOOP.md`、`FLOW-SPEC.md`。
4. Swift 壳追平 preview（本环境无 Xcode）。差距见 `SWIFT-GAP.md`。本环境不写。
5. 不做：`declared.push` / `publishArtifacts` 做成 Git GUI；qmd 新产品。

顺序曾以 [NODES-PLAN.md](./NODES-PLAN.md) 为准（用户 2026-09-13：达芬奇节点工作流 + 产物版本挂分支 + 顶栏挤字）。下列均为已做：

0. **WORKZOON.md 简报**：已做。`LATTICE.md` 名弃用。每棵 worktree 根一份引擎覆盖的任务简报，exclude 落在主仓 `.git/info/exclude`。Cloud Agent 读分支上的 `.lattice/handoffs/`。见 `LATTICE-SPEC.md`。
1. **顶栏 / 字体**：已做。52px chrome、中栏视图名、侧栏品牌一行、禁 uppercase。见 NODES-PLAN §6。
2. **产物版本 pin**：已做。记录挂分支，bytes 不进功能分支。`.lattice/artifacts/<branch-dir>/<id>.json`。见 `ARTIFACTS-SPEC.md`。
3. **占用板**：任务车道升级为占用透镜（不是第四视图）。派生行与 pulse 登记已做。进度 = 证据格，禁止自报 %。见 `BOARD-PLAN.md`、`OCCUPANCY-SPEC.md`、`PULSE-SPEC.md`。
4. **工序图**：已做。引擎 `GRAPH-SPEC.md`；掌控页工序条 `CONTROL-SPEC.md`。无 canvas。
4. **Guard hook**：已做。`workzoon guard --staged`；禁区拒绝提交，`LATTICE_OVERRIDE=1` 才放行并留痕。见 `GUARD-SPEC.md`。
5. **卫生**：已做 merged / stale(14d) / no-handoff，森林「待清理」，HOLDINGS 卫生列。不自动归档。
6. **INDEX.md**：已由 `.lattice/wiki/index.md` 承担。本地检索见 `WIKI-SEARCH-SPEC.md`。qmd 仍不做。
7. **现有分支建树**：已做 `plant`。仓级 Policy 控制 Agent 能否建/归档/删分支；破坏性动作最高 `ask`。
8. **交接结构校验**：已做。frontmatter + HEAD 对齐（Fable INV-5）。见 `HANDOFF-SPEC.md`。
9. **任务文件上分支**：已做。任务卡与交接 `git add -f` 钉在任务分支；主仓 `AGENTS.md` 不再写「当前任务」。见 `BRANCH-FILES-SPEC.md`。
10. **设置页**：已做。机器级 AppSettings（打开方式、worktrees 根、默认预设、破坏性确认、动效）在 catalog；仓级 Policy 在宪章页。待批准队列 + ledger 尾。
11. **Drift**：已做。`<!-- lattice:begin sha256=… -->`；AGENTS.md 被人改过就提示同步。
12. **Escalation**：已做。碰冻层必须写原因（至少 4 个字），记进 `task.escalation`。
13. **仓内无机器路径**：已做。`project.json` 不写 `rootPath`；加载时从仓根注入。catalog 仍记本机路径。见 `ROOT-PATH-SPEC.md`。
14. **宪章版本**：已做。`charter.version` 引擎持有；blast / 交接 `## Lattice` 记下当时版本。见 `CHARTER-VERSION-SPEC.md`。
15. **双皮肤**：已做。机器设置选 `lean`（干练）或 `forge`（工场）。工场是深色主题，列表静止；装饰默认关。见 `SKIN-SPEC.md`。
16. **破坏性要点名**：已做。归档树 / 删分支默认输入分支名；引擎执法。见 `CONFIRM-SPEC.md`。
17. **Worktree 工位**：已做。全部分支上方 `WorktreeDeck`，两皮肤共用；卡面只写任务名 / 分支 / 路径 / 下一手。见 `WORKTREE-DECK-SPEC.md`。

## 不做

不启动 Agent、不内嵌终端、不宿主模型、不做 merge/rebase UI、不做 MCP（再下一版）、不做向量库、不上 App Store。
