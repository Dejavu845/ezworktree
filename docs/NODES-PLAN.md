# 节点工作流 + 产物版本 + 顶栏（Fable · 插入 loop）

用户 2026-09-13：达芬奇式「节点即工作流」融入 worktree；代码版本与产物版本都要挂到分支；UI 有些字不好看、顶着显示栏。Fable 规划，Grok 按刀执行。

产品名仍是 Agent Workzoon / 工区。目录仍用 `.lattice/`。三主视图不动。图是读层。产物 bytes **不进**功能分支。

## 1. 一句话原则

节点即工序，边由文件推导，唯一新写入是「钉产物」。图只读五种节点；磁盘只多一种 pin 文件。

## 2. 节点闭集（5，不可加）

| 节点 | 工序 | 磁盘真相 |
|---|---|---|
| Repo | 来源 | `project.json` + remotes |
| Branch | 分支 | `refs/heads/*` |
| Worktree | 检出 | `git worktree list` + `worktrees[]` |
| ArtifactVersion | 构建 | `.lattice/artifacts/<branch-dir>/<id>.json`（新） |
| Task | 工单 | `tasks/<id>.md` + `tasks[]` |

Commit / sha **不是**节点，是边的标签。

## 3. 边闭集（5，全部读时推导）

`ref` Repo→Branch · `checkout` Branch→Worktree · `open` Task→Branch · `build` Worktree→ArtifactVersion · `pin` Branch→ArtifactVersion

`off-branch` = sha 不是该分支祖先。`behind n` = `rev-list --count sha..branch`。

## 4. 「都要加到分支里去」

**记录挂分支，bytes 不进分支。** pin 主键是 `branch + sha`。`out/` 仍 gitignore。否决：把产物 commit 进功能分支、orphan 分支、git notes。

钉 / 取消钉：仅人。Agent 本 loop 拒绝。图本身纯读，点节点只换选中。

## 5. IA

挂在「掌控」：GaugeStrip 下右栏改工序条 `来源 → 分支 → 检出 → 构建×n`。检查器掌控页列版本并钉。全部分支行用 tag 显示 `n 版产物`。任务车道不动。无 canvas、无拖拽、无第四主视图。

## 6. UI chrome（刀 1，先于节点图）

病灶：双身份堆叠贴顶；中栏 `.title` 空死区；uppercase + 0.14em 套中文；负字距挤「工区」；非 Mac 上 `font-synthesis: none` 标题发虚；身份显 `groupId`。

规格：`--chrome-h: 52px`；titlebar `auto 1fr auto`，中栏写视图名；侧栏品牌一行「工区 Agent Workzoon」；禁 uppercase；禁 `letter-spacing ≥ 0.08em`；负字距只留给 gauge 数字。不加回假红绿灯。不改 `src/**`。

## 7. Loop 顺序

0. **WORKZOON.md 简报** — 已做。`LATTICE.md` 名弃用。按 `LATTICE-SPEC.md`。
1. **顶栏 / 字体** — 已做。本节 §6。
2. **产物版本 pin** — 已做。记录挂分支；人钉/取消钉；HOLDINGS `## 版本` + `@sha12`。见 `ARTIFACTS-SPEC.md`。
3. **IA 疏通** — 已做。检查器页签「清单」；在场 title 写清口径；待批准只顶栏徽标；开树文案「创建 worktree」；Policy 明细默认折叠。见 `BOARD-PLAN.md` §6。
3b. **开树三轴** — 已做。意图闭集 feat/spike/hotfix；基线可叠在已有分支；范围仍是允许路径。见 `INTENT-SPEC.md`。
4. **派生占用板** — 已做。任务车道行：推导「正在做」+ 证据格 `k/n`。无 pulse 也有行。见 `OCCUPANCY-SPEC.md`。
5. **Pulse 登记** — 已做。`.lattice/pulses/<taskId>.json`。Agent 写 doing / 估；cite + 30min。见 `PULSE-SPEC.md`。
6. **工序图构建器** — 已做。`src/graph.ts` 纯读。`GET /api/graph`。无 roster 节点。见 `GRAPH-SPEC.md`。
7. **掌控页读图** — 已做。工序条 + 检查器版本列 + 在岗卫星≤5。无 canvas。见 `CONTROL-SPEC.md`。
8. **交接 frontmatter + HEAD** — 已做。结构校验 + `head` 对齐。见 `HANDOFF-SPEC.md`。
9. **Guard hook** — 已做。`workzoon guard --staged`；`LATTICE_OVERRIDE=1` 才放行。见 `GUARD-SPEC.md`。

看板合同：`BOARD-PLAN.md`。不第四主视图。进度只许证据格，不许自报 %。

## 8. 不做

改名 / Rust / 拆仓 / 第四主视图 / 假红绿灯 / 产物 bytes 进功能分支 / canvas 编辑器 / Agent 钉产物 / CI / 在本仓库检出上建 worktree。
