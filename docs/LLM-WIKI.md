# Karpathy LLM Wiki × Agent Workzoon

Karpathy 的 [llm-wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 不是一个要嵌进来的应用，是一份可以丢给 Agent 的想法文件。社区实现（`Astro-Han/karpathy-llm-wiki`、`Pratiyush/llm-wiki`）把它落成：

```
raw/     原文，不可变
wiki/    Agent 编译过的页面
schema   AGENTS.md / SKILL.md：ingest · query · lint
site/    给人看的只读层
```

和 RAG 的差别：知识在 ingest 时编译进 markdown，而不是每次提问从原文碎片重拼。

## 我们偷什么 / 拒什么

| 偷 | 拒 |
|---|---|
| 三层文件，仓内为真 | 再做一款 Obsidian / 笔记编辑器 |
| `index.md` + 可 grep 的 `log.md` | 向量库、Mem0、图数据库 |
| Agent 写 wiki，人读 + 提问 | 前端当真相、数据库当真相 |
| 可视化只读 `site/` | 把聊天日志当知识 |

Foam 仍可打开同一套 markdown。它不再是主格式，只是兼容的阅读器。

## Workzoon 里的落点

```
.lattice/raw/                 原文（交接副本、论文、摘录）
.lattice/wiki/index.md        Agent 先读这里
.lattice/wiki/entities/       引擎对照 git 刷新：仓、分支、worktree、任务
.lattice/wiki/concepts/       Agent 维护的概念
.lattice/wiki/syntheses/      问过的好答案归档
.agents/skills/workzoon-wiki/  schema
```

引擎只做两件确定的事：列出 git 实况，编译 `entities/`。概念页和综合页留给 Agent。可视化前端是 `site/`：森林看每一条分支和每一棵 worktree，百科页检索并渲染 wiki。本地检索见 `WIKI-SEARCH-SPEC.md`。

## Agent 维护约定

维护百科是义务，不是开关。设置只决定 Agent 可写哪些目录、lint --fix 是否需同意、done 前门禁强度。

| 时机 | 引擎自动做 | Agent 必须做 |
|---|---|---|
| 进入任务 | 已注入 `context/` | 读 index → holdings → POLICY → task 实体 → 相关 concepts |
| 读了外部资料 | `workzoon ingest` 写 raw + log | 用 CLI 收入；写 `wiki/sources/<slug>.md` + index 行 |
| 做了影响后来者的决定 | — | 写 `wiki/concepts/<slug>.md`；index 加行；log compile |
| 生成交接 | 交接副本 → `raw/handoffs/<taskId>/<ts>.md` | 写/刷新 `wiki/sources/handoff-<slug>.md` |
| 标记完成前 | `markDone` 按 `policy.wiki.gate` 检查 | `workzoon lint --fix 1` |
| 任何时候 | raw manifest 哈希校验 | 不改 raw、不改 `entities/`、不改 HOLDINGS/POLICY |

1. 先读 `wiki/index.md`、`.lattice/POLICY.md` 和 `wiki/entities/repo.md`，再碰代码。
2. 复制森林里的分支 / 路径，不要自己猜 worktree 在哪。
3. 收入资料只写 `raw/`。编译进 `wiki/`。不要改 raw。
4. 交接仍是 `.lattice/handoffs/<taskId>.md`。引擎会把副本收入 `raw/handoffs/`。wiki 不替代交接。
5. `entities/` 由引擎编译；手改会在 lint 里标 `entity-hand-edit`。
