# Lattice 调研纪要（2026-09-13）

多 Agent 同仓开发的痛点不是「少一个启动器」，而是：**没有可执行的项目法、没有爆炸半径、没有可交接的状态文件**。下面是 GitHub 高收藏同类项目与未解决问题。收藏数为调研当日约数。

## 1. 竞品地图

### 1.1 编排 / 工作树（高收藏）

| 项目 | Stars | 形态 | 它解决了什么 | 它没解决的（对本产品） |
|---|---:|---|---|---|
| [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban) | ~28k | Rust/React 桌面；看板 + 多 Agent CLI + worktree | 并行任务、换模型、看 diff | 没有宪章/分层；没有「不准碰前面」；worktree 默认进系统临时目录，孤儿路径、升级丢项目（#2687）、Invalid worktree（#1731）反复出现；清理策略至今是 feature request（#765） |
| [gastownhall/gastown](https://github.com/gastownhall/gastown) | ~18k | Go；Mayor / Polecat / Hook / Beads | 持久化多 Agent、合并队列 | 隐喻过重。交接在生产里经常是坏的：`GetOrCreateHandoffBead` 零调用者（#4708）；`gt hook` 与 `gt mol current` 对「当前工作」意见不一致（#4774）；上下文打满后静默冻住、无法 handoff（#3906）；身份 bead 写错库（#4540） |
| [NanmiCoder/cc-haha](https://github.com/NanmiCoder/cc-haha) | ~14k | Electron 工作区 | Claude Code 桌面壳、多会话 | 运行器，不是治理 |
| [smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad) | ~8.5k | Go TUI + tmux + worktree | 隔离并行 CLI Agent | 只有隔离。无宪章、无知识库、无 macOS 原生体验 |
| [stravu/crystal](https://github.com/stravu/crystal) → Nimbalyst | 已停更 | 多会话 IVE | 并行 Claude/Codex + worktree | OSS 已死；产品变成会话管理器，不是项目法 |
| Conductor.build | 闭源 | macOS GUI | workspace = worktree + 聊天 + PR | 绑 Claude；自带一份 Claude 二进制；无宪章、无跨 Agent 交接包 |
| GitButler | 高 | 虚拟分支，**一个**工作目录 | 少建树、提交切片 | 共享文件系统，Agent 仍能互相踩；与「一功能一树」相反 |
| [simion/termic](https://github.com/simion/termic) | ~260 | OSS Conductor | 真终端跑真 CLI | 仍是启动器 |

### 1.2 原生 macOS worktree GUI（收藏都偏低）

| 项目 | Stars | 缺口 |
|---|---:|---|
| [j1king/grovr](https://github.com/j1king/grovr) | ~40 | 只管树，不管 Agent |
| [sapsaldog/oh-my-worktree](https://github.com/sapsaldog/oh-my-worktree) | ~15 | 菜单栏 + PR，无治理 |
| [klein-t/teebe](https://github.com/klein-t/teebe) | ~10 | 跨树文件浏览器；README 自己写「不是编排器」 |
| [corveil/crow](https://github.com/corveil/crow) | ~18 | 嵌终端 + issue，无宪章 |
| Arborist / WorktreeDesk / Weave / TreePool | ≤2 | 早期 worktree 壳 |

结论：**「好看的 worktree 管理器」已经有人做了，且都没火。** 缺的不是 Finder，是法。

### 1.3 画布 / 循环派

Maestri / open-maestri（空间画布 + PTY）、XRoads（按依赖分层并行 + 故障换模型）、px-dispatch / Maestro（DAG + worktree）。它们优化的是「同时跑几个终端」，不是「后来的 Agent 不许改前面冻住的层」。

### 1.4 知识库 / Agent 记忆（高收藏，但别嵌进去）

| 项目 | Stars | v1 策略 |
|---|---:|---|
| AppFlowy / AFFiNE | ~72k | **不嵌入**。整应用塞进来等于再做一个 Notion |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | ~64k | 聊天记忆，不是仓库法。后期可选 |
| [siyuan-note/siyuan](https://github.com/siyuan-note/siyuan) | ~44k | HTTP `127.0.0.1:6806`：`/api/export/exportMdContent`、`/api/filetree/createDocWithMd`。**只做导入导出** |
| [logseq/logseq](https://github.com/logseq/logseq) | ~44k | Markdown + git + `[[wikilink]]`。格式互通 |
| [karpathy/llm-wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) | gist | **现在的主格式**：raw / wiki / schema。Agent 编译，人读。可视化只做 site 层 |
| [foambubble/foam](https://github.com/foambubble/foam) | ~17k | 兼容阅读器，不再当主格式 |
| Graphiti / Cognee / Letta | 24–30k | 要图数据库或整套 Agent runtime。后期 |

Foam 关键约定（来自官方文档）：

- 笔记 = 文件夹里的 `.md`
- frontmatter：`title` / `type` / `tags` / `alias`
- 双链：`[[filename]]`、`[[note#Section]]`、`![[embed]]`
- 模板在 `.foam/templates/`
- `foam.edit.linkReferenceDefinitions: withExtensions` 可生成 GitHub 可读的 reference definitions

## 2. 行业已经形成、必须对齐的文件约定

指令文件是**上下文，不是执法**（Anthropic / Cursor 文档共识）。长文件会稀释注意力；硬约束必须用 hook / 引擎，不能只靠 ALL CAPS。

| 文件 | 谁读 | 2026 正确用法 |
|---|---|---|
| `AGENTS.md` | Codex、Cursor、Copilot、Gemini CLI、Windsurf、Aider…（AAIF / Linux Foundation，60k+ 仓） | **唯一正文** |
| `CLAUDE.md` | 只有 Claude Code（它**不读** AGENTS.md） | 第一行 `@AGENTS.md` |
| `.cursor/rules/*.mdc` | Cursor | 按 glob 加载的短规则（爆炸半径、冻层） |
| `.cursorrules` | 遗留 | 不要写 |

交接文件（[RFC 0002 HANDOFF.md](https://github.com/mohitagw15856/pm-claude-skills/blob/main/docs/rfcs/0002-agent-handoff-file.md)）：

- 标记：`<!-- agent-handoff v1 · updated: ISO · by: agent -->`
- 固定五节：**Decisions / Live state / In flight / Landmines / Next action**
- 写状态和理由，不写聊天记录
- 单会话可覆盖同一文件；**并行必须一人一文件**，否则 last-writer-wins

Claude Code worktree（官方）：

- 默认树在 `.claude/worktrees/`，应 gitignore
- `.worktreeinclude`：gitignore 语法，只复制**已被忽略**的文件（`.env`）
- 隔离会拦对主 checkout 的 Write / 在主仓跑 git
- 这仍不阻止 Agent **在自己的树里改冻住的架构层**

Vibe Kanban 把树丢进 `/var/folders/.../T/vibe-kanban/worktrees` —— 这是孤儿 worktree 的根因。**不要学。**

## 3. 未被占领的产品缝

同时具备下面五条的，调研范围内**没有**：

1. 项目开始时写死的 **Charter + 分层（冻层）**
2. **一任务一 worktree**，除非显式申请动更早的层
3. **爆炸半径**：diff 对照允许/禁止/冻层，给出 ok / warning / blocked
4. **交接是文件**，任务在写出 HANDOFF 之前不能标完成（吸取 Gas Town #4708）
5. **Foam 兼容知识库**，注入 `.lattice/context/`，而不是再做一个 Obsidian

## 4. 设计时要躲开的坑

1. 做成又一个 Claude/Codex 启动器（Conductor / Crystal / cc-haha 已占满）。
2. 把状态只放在 App 数据库里，Agent 看不见（Vibe 升级丢项目）。
3. 用隐喻操作系统（Mayor/Polecat）代替三栏 Mac 应用。
4. 把 HANDOFF 做成可选备注（Gas Town 的死代码路径）。
5. 用 400 行 AGENTS.md 代替冻层引擎（模型会漂）。
6. 在本仓库自己的检出上直接 `git worktree add` 做演示。

## 5. 顾问分工

- 底座与调研：本文件 + `FOUNDATION.md`。
- 产品/治理缺口：`FOUNDATION.md` §12、`ROADMAP.md`（[Fable 产品顾问](bc-9690e353-36f8-5780-9ecd-2ed171faa578)）。
- UX 偷/拒与文案：`docs/UX.md`（[Fable UX 调研](bc-70552ac2-0ec3-5e05-a5a6-f5ab8789cd3d)）。
- **代码审查：Claude Opus。不再追加 Fable。**
