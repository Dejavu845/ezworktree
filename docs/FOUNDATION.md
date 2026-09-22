# Lattice 底座（v1 合同）

这是实现必须遵守的法。改行为先改这份文件。

## 0. 双读者

Agent Workzoon 是同时给 **人和 Agent** 用的控制面，不是启动器。

| 读者 | 产品帮他做什么 |
|---|---|
| 人 | 看见并掌控自己的 **仓库、分支、源码 checkout、产物**。复制路径，检出分支，归档树。不把项目交给黑盒。 |
| Agent | 按宪章在一棵已登记的 worktree 里开发。先读 `.lattice/HOLDINGS.md`，再读 wiki / 交接。不许发明路径、加 remote、删分支、私自发布产物。 |

一份磁盘真相，两套读法。UI 是人的仪表盘；`HOLDINGS.md` + `wiki/entities/` 是 Agent 的仪表盘。

## 1. 产品

- **中文名**：工区
- **英文名**：Agent Workzoon
- **一句话**：人掌控仓 / 分支 / 源码 / 产物；Agent 在宪章和 worktree 里规范开发，并把知识编译进 wiki。
- **One job**：后来的 Agent 默认不能改已经冻住的层；要改必须显式破例，并留下交接。
- **不是**：Git GUI、IDE、Claude 启动器、第二款 Obsidian、Gas Town 式操作系统。

## 2. 不变量（可测试）

1. **仓内真相**：一个已注册项目的宪章、任务、交接、知识库以该仓 `.lattice/` 为准。App catalog 只记「路径、分组、最近打开」。`.lattice/project.json` 不写绝对 `rootPath`；运行时由加载路径注入。
2. **一任务一树**：`Task.worktreeId` 最多指向一棵 `status=active` 的树。新任务先建卡，不预种树。开树时默认 `git worktree add -b <intent>/<slug>`，`intent` 闭集 `feat|spike|hotfix`。基线默认仓 `baseBranch`；叠做必须指向已存在的本地分支。意图不是层，不能代替冻层。
3. **冻层默认不可写**：`charter.layers[i].frozen === true` 的 `paths` 出现在相对 base 的 diff 里 → `blocked`，除非该任务 `allowFrozenTouch === true`。开冻层必须写书面理由（至少 4 个字），记入 `task.escalation`；判定仍只看 boolean。
4. **禁止区永远不可写**：`doNotTouch ∪ task.forbiddenPaths` 命中 → `blocked`，即使 `allowFrozenTouch`。
5. **允许区是闭集**：`task.allowedPaths` 非空时，diff 中未命中允许 glob 的路径 → `blocked`（生成物/lockfile 可标 `warning` 白名单）。
6. **交接先于完成**：`status` 不能变成 `done`，除非交接通过 v1 frontmatter 结构校验且 `head` 对齐当前 HEAD。只认 `<!-- agent-handoff v1` 不够。
7. **并行交接不互相覆盖**：交接写在 `.lattice/handoffs/<taskId>.md`；`.lattice/HANDOFF.md` 只是「当前选中任务」的指针副本。
8. **指令不是执法**：`AGENTS.md` / `CLAUDE.md` / `.cursor/rules` 只注入上下文。执法是 `blast.check` + `workzoon guard --staged`（pre-commit）。`LATTICE_OVERRIDE=1` 才放行 blocked 并记 ledger。
9. **Agent 无关**：引擎不启动、不包装 Cursor / Claude / Codex 进程。它写文件、建树、给打开路径。
10. **演示隔离**：自动演示/测试只在临时 fixture 仓建树，不在本仓库自己的检出上建树。
11. **人掌控四样**：仓库路径与 remotes、全部分支、全部 worktree、磁盘上的产物（`out/` `dist/` 等）必须出现在 `.lattice/HOLDINGS.md`。钉住的产物版本挂在分支上（`.lattice/artifacts/`），bytes 不进功能分支。Agent 不得在这份清单外发明位置。
12. **未检出可种树**：人对已有分支可 `plant` 成 worktree；不因此自动新建 `<intent>/<slug>` 任务。
13. **授权随仓**：仓级 Policy 写在 `.lattice/project.json`，不进 catalog。破坏性动作对 Agent 最高 `ask`。引擎默认 `actor=agent`（fail closed）；人的 UI 必须带 `X-Workzoon-Actor: human`。
14. **百科是义务**：维护 wiki 不是 boolean duty。交接必入 `raw/handoffs/`；`markDone` 受 `policy.wiki.gate` 约束（`block` 时本任务 raw-uncompiled 过不去）。`agentWrites` 关掉的 `concepts` / `sources` / `syntheses`：Agent 经 `wiki-write` 写不进去；磁盘上多出来的页 lint 为 `write-forbidden`。见 `WIKI-WRITES-SPEC.md`。
15. **工序图纯读**：`GET /api/graph` 只推导五种节点（`repo|branch|worktree|artifact|task`）和五条边（`ref|checkout|open|build|pin`）。不写 `.lattice/graph.json`。remote / commit / Agent 不是节点。未种树的任务没有 `open` 边。
16. **任务文件跟分支**：已开树的任务，`.lattice/tasks/<id>.md` 与 `.lattice/handoffs/<id>.md` 用 `git add -f` 钉在任务分支上。主 checkout 的 `AGENTS.md` 永远不写「当前任务」。未开树的卡只留主仓磁盘（exclude），不进任何分支。
17. **仓内无机器路径**：`.lattice/project.json` 不持久化绝对 `rootPath`。内存里的 `Project.rootPath` 由 `loadProject(abs)` 注入。本机路径只进 catalog。
18. **宪章有版本**：`charter.version` 是正整数，引擎持有。正文一变就 `+1`。`BlastReport.charterVersion` 与交接 `## Lattice` 的 `Charter: vn` 记下当场版本。不改冻层判定。
19. **破坏性要点名**：人归档 worktree 或删除分支时，若 `confirmDestructive`（默认开），必须输入该分支名。引擎执法。Agent 仍走 Policy。已批准请求回放时带上已知分支名。见 `CONFIRM-SPEC.md`。
20. **清单外拓扑可见**：git 有、`project.json` 没有的本地分支和 worktree 必须出现在森林 / HOLDINGS「清单外」。不自动删。Agent 经引擎不得 plant / delete 这些行。见 `TOPOLOGY-SPEC.md`。

## 3. 磁盘布局

### 3.1 每个被治理的 git 仓

```
<repo>/
  AGENTS.md                         # 正文；Lattice 段用标记包裹
  CLAUDE.md                         # 仅 @AGENTS.md
  WORKZOON.md                       # 仅 linked worktree 根；引擎覆盖；不入库（见 exclude）
  .worktreeinclude                  # 复制被 gitignore 的 .env 等
  .cursor/rules/lattice-charter.mdc # glob 作用域的冻层/禁区
  .lattice/
    project.json                    # 结构化状态（schema 见下；含 policy）
    charter.md                      # 给人/Agent 读的宪章
    POLICY.md                       # 仓级 Agent 授权（人写，Agent 只读）
    HOLDINGS.md                     # 人/Agent 共用：仓、分支、源码、产物
    ledger.md                       # 治理账本
    artifacts/<branch-dir>/<id>.json # 产物版本 pin（记录挂分支，bytes 不进仓）
    HANDOFF.md                      # 当前任务交接的副本（指针）
    requests/<id>.json              # Agent 待批准请求
    tasks/<taskId>.md
    handoffs/<taskId>.md            # 权威交接
    context/                        # 注入本任务的短笔记（由 vault 选出）
    wiki/                           # Karpathy LLM wiki（编译层）
      index.md
      log.md
      entities/                     # 引擎对照 git 刷新
      concepts/
      sources/
      syntheses/
    raw/                            # 原文，写后不可改
      .manifest.json                # relPath → sha256
      sources/
      handoffs/<taskId>/            # 交接副本
    vault/                          # Foam 兼容阅读层（不再是主格式）
      index.md
      inbox.md
      charter.md
      decisions/
      conventions/
      handoffs/
      .foam/templates/
```

`AGENTS.md` 中 Lattice 只维护这一段，其余人类文字不动：

```
<!-- lattice:begin -->
...generated...
<!-- lattice:end -->
```

### 3.2 App catalog（机器本地，不进仓）

- macOS：`~/Library/Application Support/Lattice/catalog.json`
- Linux / 本云环境：`$LATTICE_HOME/catalog.json`，默认 `~/.lattice/catalog.json`（含机器级 AppSettings，含 `skin`）
- 工作树根：`$LATTICE_HOME/worktrees/<projectId>/<taskSlug>/`

不要把工作树放进系统临时目录。

### 3.3 分支与 git

```
git worktree add -b <intent>/<slug> <abs-path> <base>
```

- `base` 默认项目 `baseBranch`（通常 `main`）。
- 分支已被其他树占用 → 失败，提示换 slug 或复用该树。
- 归档：`git worktree remove`（干净）或 `remove --force`（用户确认）；分支保留到用户删。
- `.worktreeinclude` 按 Claude Code 语义：只复制「匹配且已被 ignore」的文件。
- worktree 治理 exclude 写在主仓 `.git/info/exclude`（git common dir，全树共享）。第一次开树后，主树里未跟踪的 `.lattice/` / `AGENTS.md` 也会被忽略；已跟踪文件不受影响。
- 已开树时，引擎对 `.lattice/tasks/<id>.md` 与 `.lattice/handoffs/<id>.md` 执行 `git add -f` 并提交到任务分支（信息前缀 `workzoon:`）。exclude 仍覆盖 `.lattice/`，主仓 status 不吵。

## 4. 数据模型（project.json）

见 `schema/lattice.schema.json`。字段摘要：

- `Project`（内存）：`id`, `name`, `rootPath`（加载注入，不进 `project.json`）, `groupId`, `baseBranch`, `charter`, `policy`, `tasks[]`, `worktrees[]`, `handoffs[]`
- `Group`：只存在于 catalog（Studio / Career / Experiments…）
- `Charter`：`version`（正整数，引擎持有）, `purpose`, `architecture`, `conventions[]`, `doNotTouch[]`, `layers[]`
- `Layer`：`id`, `name`, `paths[]`, `frozen`
- `Task`：`intent` (`feat|spike|hotfix`), `baseBranch`, `allowedPaths`, `forbiddenPaths`, `layerIds`, `allowFrozenTouch`, `escalation?`, `agent`, `status`
- `Handoff`：`taskId`, `fromAgent`, `toAgent`, `path`, `updatedAt`
- `BlastReport`：按次计算，不持久化整份 diff，只存上次摘要

身份：实体用 UUID；给人和分支用 `slug`（`[a-z0-9-]+`）。

## 5. 爆炸半径算法

输入：`baseRef` 与 worktree `HEAD` 的 `git diff --name-status`。

对每个路径：

1. 命中 `doNotTouch` 或 `forbiddenPaths` → **blocked**
2. 命中任一 `frozen` 层且任务未 `allowFrozenTouch` → **blocked**
3. `allowedPaths` 非空且未命中 → **blocked**
4. 命中 warning 白名单（`pnpm-lock.yaml`, `package-lock.json`, `*.map`, `out/**`）→ **warning**
5. 否则 **ok**

重命名：旧、新路径都检查。`i18n` 成对文件（`messages/{zh,en,ja}.json`）若只改其中一个 → **warning**。

整体：任一 blocked → 报告 `blocked`；否则有 warning → `warning`；否则 `ok`。

## 6. 交接模板

`.lattice/handoffs/<taskId>.md` 必须能被机器识别：

```markdown
---
v: 1
task: <uuid>
branch: feat/<slug>
head: <sha>|none
from: cursor
to: next-agent
updated: 2026-09-13T00:00:00Z
---
# HANDOFF
<!-- agent-handoff v1 · updated: 2026-09-13T00:00:00Z · by: cursor · task: <uuid> -->

## Decisions
## Live state
## In flight
## Landmines
## Next action

## Lattice
- Task:
- Worktree:
- Branch:
- Blast:
- Allowed:
- Forbidden:
- Frozen touch:
```

前五节标题固定（RFC 0002）。`Lattice` 节为本产品附加，不升 v1 版本号。

「生成交接」把 git 摘要填进 Live state / Lattice；人（或 Agent）补 Decisions 与 Next action。**没有这份文件就不能点完成。**

下一位 Agent 的启动方式（v1）：

1. 打开该 worktree 路径（树内有 `WORKZOON.md` 任务简报、`AGENTS.md`、`.lattice/` 副本）
2. 读 `WORKZOON.md`（若看不见这份 untracked 文件，读分支上已跟踪的 `.lattice/handoffs/<id>.md`）再读该树的 `AGENTS.md` + `.lattice/wiki/index.md`。不要在主 checkout 找「当前任务」。
3. 剪贴板里已有一段「从交接继续」的 prompt

不控制对方进程。

## 7. 知识库（Karpathy LLM Wiki）

- **主格式**：仓内 `.lattice/raw` + `.lattice/wiki`。`[[wikilink]]` + YAML。详见 `docs/LLM-WIKI.md`。
- **所有权**：`raw/` 写后不可改；`wiki/entities/` 由引擎编译；`concepts/` / `syntheses/` 由 Agent 维护。
- **schema**：`AGENTS.md` 托管段 + `.agents/skills/workzoon-wiki/SKILL.md`。操作只有 ingest / query / lint。
- **注入**：为任务挑选 `type: charter|decision|convention|concept|entity` 且 tag 命中任务 layer 的笔记，清空后写入 `.lattice/context/`（默认 8 篇）。跳过 Foam 模板。
- **可视化**：前端是只读 `site/`，不是编辑器。
- **Foam / Obsidian**：可打开同一目录。不嵌 SiYuan / Mem0 / Graphiti。

## 8. 信息架构（macOS）

主对象是 **带范围的任务**，不是会话、不是终端。Worktree 只是宪章被执行的容器。

`NavigationSplitView` 三栏：

| 栏 | 内容 |
|---|---|
| Sidebar | 分组 → 项目；项目下是宪章 / 任务；不要做 Sessions 列表 |
| Content | 掌控（四样资产）· 全部分支 · 任务车道 |
| Inspector | 页签：资产清单 · 对照 · 宪章（分层与禁区 + Agent 授权 + 待批准） · 交接 · 范围 · 百科 |

App 设置在 titlebar 齿轮 / SwiftUI `Settings { }`，不占第四个主视图。待批准徽标点进宪章页顶部请求列表。掌控页底部是 ledger 最近 10 条。

主路径（≤6 次点击）：选项目 → 新任务 → 填标题与允许路径 → 创建 worktree → 复制打开配方 → （完成后）生成交接。

### 文案（v1）

| 动作 | 中文 | English |
|---|---|---|
| New task | 新任务 | New Task |
| Create worktree | 创建 worktree | Create Worktree |
| Generate handoff | 生成交接 | Generate Handoff |
| Blast radius | 影响范围 | Blast Radius |
| Out of scope | 越界 | Out of Scope |
| Needs review | 待审 | Needs Review |
| Reveal in Finder | 在 Finder 中显示 | Reveal in Finder |

`worktree` / Cursor / Codex 在中文界面不翻译。

### UX 拒绝清单

不把终端当首页；不用 Mayor/Polecat 隐喻；不做第二款 Obsidian；颜色只表示治理信号（ok / 邻层 / 越界）；系统外观与系统字体。细节见 `docs/UX.md`。

## 9. 技术分层（本环境无 Xcode）

| 层 | 技术 | 职责 |
|---|---|---|
| Engine | TypeScript / Node 22 | 不变量、git、vault、HTTP |
| Preview | Vite + React（拟 Sequoia） | Linux 上可验证 UX |
| Native | SwiftUI 源码 | Mac 上用同一 JSON/HTTP |
| Schema | `schema/lattice.schema.json` | 跨三层合同 |

引擎是唯一实现法的地方。UI 不得自己 `git worktree add`。

## 10. v1 范围

做：注册项目与分组、写宪章/冻层、建/列/归档工作树、任务卡、blast、强制交接、Foam 检索与注入、拟 Mac UI、SwiftUI 壳、fixture 测试。

不做：嵌入 Agent PTY、自动 merge、IM、画布、图数据库、iCloud、多仓 workspace。

## 11. 最容易建错的五件事

1. 把 catalog 当真相，Agent 在另一台机器上什么都看不见。
2. 只有 `AGENTS.md`、没有 blast。
3. 完成按钮不检查交接。
4. 工作树建在 `/tmp`。
5. 做成启动器而不是治理层。

## 12. 顾问结论（已锁定 / 明确延期）

产品对外名锁定为 **Agent Workzoon / 工区**。内部目录仍用 `.lattice/`，避免拆仓。格栅 / 格律只作旧隐喻。

已与 v1 对齐、不再争论：

- 产品是治理层，不是 Git GUI / IDE / 聊天壳 / swarm orchestrator。
- 仓内文件为真源；App 库只做索引。
- 不启动、不监控 Agent 进程。
- 知识用 Foam/Obsidian 兼容 Markdown，不嵌 SiYuan / Mem0 / Graphiti。
- worktree 不放系统临时目录。新树默认 `~/Workzoon/worktrees/<project>/<slug>`；已有树不搬家。见 `WORKTREE-ROOT-SPEC.md`。

[Fable 龙骨简报](./KEEL-ADVISORY.md) 作为顾问输入：吸收执法与交接论点，**拒绝改名 / Rust 重写 / 拆 `.lattice/`**。

[Fable 授权 / 百科义务规格](./SETTINGS-PLAN.md) 已落地：仓级 Policy + 机器级 AppSettings；wiki 维护是义务不是开关；破坏性动作对 Agent 最高 `ask`。

下一版再做（见 `docs/ROADMAP.md`），v1 不回头重写成 Swift Core 或 Rust：

- worktree 内 `WORKZOON.md` + 主仓 `.git/info/exclude`（已做，见 `LATTICE-SPEC.md`）
- 节点工作流 / 产物版本挂分支 / 顶栏挤字（见 `NODES-PLAN.md`）
- managed block 的 hash / drift 检测
- 越界升级（escalation）留痕，而不只是 `allowFrozenTouch`
- `pre-commit` 调 `workzoon guard --staged`（已做，见 `GUARD-SPEC.md`）
- 智能列表：缺交接、过期 worktree
- 兄弟目录 `../<repo>.worktrees/` 作为可配置根
