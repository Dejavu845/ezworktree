# Agent Workzoon · Settings / Policy / Wiki Duty 规格

来源：Fable 架构总审（对照用户原话 + 现有 `lattice/`）。这是执行规格，不是散文。Grok 按本文增量实现，不重写已完成层。

产品名：**Agent Workzoon / 工区**。目录仍用 `.lattice/`。不要改名 Keel，不要 Rust，不要拆仓。

---

## A. 架构一张图

Agent Workzoon 是治理层。磁盘是唯一真相——git 拓扑（remotes / branches / worktrees / 产物目录）加仓内 `.lattice/`。TS 引擎是唯一的「执法写入者」：它按不变量和授权改 git 拓扑、写治理文件、把 git 实况编译成 wiki 实体页。人的 UI（preview / SwiftUI）和 Agent 的文件（`AGENTS.md` / `HOLDINGS.md` / wiki）是同一份真相的两套读法。catalog 只是每台机器的索引透镜。它管 **scope 与 container**（谁在哪棵树、能碰什么、留下了什么），不管 **content**（不看 diff 正文、不编辑源码、不 merge、不跑模型）。

| 层 | 内容 | 谁写 | 谁读 |
|---|---|---|---|
| L0 真相·git | remotes、全部分支、活 worktree、产物目录 | 人（git 或 UI→引擎）；Agent 在授权内经引擎 | `map.ts` `holdings.ts` |
| L0 真相·法 | `project.json`（charter + tasks + worktrees + handoffs + **policy**）、`charter.md`、**`POLICY.md`** | 只有人（经引擎） | 引擎执法；Agent 只读 |
| L0 真相·工作 | `tasks/`、`handoffs/`、`HANDOFF.md`、`context/`、**`ledger.md`**、**`requests/`** | 引擎 + Agent | 人 + 下一位 Agent |
| L0 真相·知识 raw | `.lattice/raw/**`，写后不可改 | 引擎（交接副本）、Agent/人（ingest） | Agent 编译时 |
| L1 派生·知识 wiki | `entities/`（引擎编译＝可重建缓存）；`concepts/ sources/ syntheses/`（Agent 著述＝真相）；`index.md` `log.md` | 引擎 / Agent | 人（百科页）、Agent（先读 index） |
| L2 控制面 | `service.ts` → `server.ts`(:7780) / `cli.ts` | — | 三个壳只能经它 |
| L3 读层·人 | preview（Vite）、SwiftUI | 不写磁盘 | 人 |
| L3 读层·Agent | `AGENTS.md` 托管段、`HOLDINGS.md`、`POLICY.md`、`wiki/index.md`、`WORKZOON.md`、SKILL.md | 引擎渲染 | Agent |
| L4 透镜 | `~/.lattice/catalog.json`：分组、路径、**AppSettings**（机器级偏好） | 引擎 | UI |

- **wiki**：跨 L0/L1。raw 是 L0 真相；entities 是 L1 从 git 编译出的缓存；concepts/syntheses 是 L1 里 Agent 写的真相。
- **settings 必须拆两个东西**。机器级 `AppSettings` 在 L4（catalog）；仓级 `Policy` 在 L0 法层（`project.json`），与 charter 并列。**禁止把授权只放 catalog**（Agent 在另一台机器读不到）。

漂移纠正：

- 不是 Git GUI：森林/车道显示并创建/归档**容器**，不看 diff 正文、不提交、不 merge/rebase。
- 不是 IDE：源码列表只为复制路径给 Agent。
- 不是聊天宿主：不 spawn、不 PTY、不存会话。
- 「视觉化 worktree 管理」= 每个 repo、每条 branch、每棵 worktree、每份 checkout、每个产物都能被点到、复制、种树、归档。这是**资产视图**。

---

## B. 人机双环

**人的四资产环**：登记仓 → 看掌控/森林 → 建任务或种树 → 复制路径/分支给 Agent → 看范围/交接 → **批准/拒绝 Agent 的请求** → 标记完成/归档 → 产物在磁盘。

**Agent 的开发+百科环**：进 worktree → 读 `AGENTS.md` → 读 `HOLDINGS.md` `POLICY.md` `wiki/index.md` → 读 `entities/task-<slug>.md` + `context/` → 在 allowed 内开发 → `workzoon blast` 自检 → `workzoon handoff`（引擎自动把交接收入 raw）→ **编译**：写 `wiki/sources/handoff-<slug>.md`、把决定沉淀为 `wiki/concepts/*.md`、更新 index、追加 log → `workzoon lint --fix 1` → `workzoon done`（或因 `ask` 变成一条待批准请求）。

**Agent 维护 wiki 是义务，不是设置项。** 设置只管：Agent 可写哪些 wiki 目录、lint 自动修是否需同意、done 前门禁强度。

| 时机 | 引擎自动做 | Agent 必须做 |
|---|---|---|
| 进入任务 | 已注入 `context/` | 读 index → holdings → task 实体 → 相关 concepts |
| 读了外部资料 | `workzoon ingest` 写 raw + log | 用 CLI 收入；写 `wiki/sources/<slug>.md` + index 行 |
| 做了影响后来者的决定 | — | 写 `wiki/concepts/<slug>.md`；index 加行；log compile |
| 生成交接 | 交接副本 → `raw/handoffs/<taskId>/<ts>.md` | 写/刷新 `wiki/sources/handoff-<slug>.md` |
| 标记完成前 | `markDone` 按 `policy.wiki.gate` 检查 | `workzoon lint --fix 1` |
| 任何时候 | raw manifest 哈希校验 | 不改 raw、不改 `entities/`、不改 HOLDINGS/POLICY |

---

## C. 最终 schema

草稿（`Catalog.settings` + `duties` 布尔）**推翻**。`developInWorktree` / `maintainWiki` 不是可关开关。

```ts
// ===== 机器级：~/.lattice/catalog.json → settings =====
export type AppSettings = {
  openIn: "cursor" | "vscode" | "finder" | "terminal" | "none"; // "cursor"
  worktreesRoot: string;        // `~/Workzoon/worktrees`；测试里 `$LATTICE_HOME/worktrees`
  defaultPreset: PolicyPreset;  // 新登记仓套用；"balanced"
  confirmDestructive: boolean;  // 人做破坏性动作也要输入名称确认；true
  motion: "system" | "off";     // "system"
  skin: "lean" | "forge";       // "lean"；人在设置里选干练 / 工场
  forgeDecor: "off" | "on";     // "off"；工场装饰默认关，只加一层静止底色
};

// ===== 仓级：.lattice/project.json → policy =====
export type Consent = "never" | "ask" | "allow";
export type PolicyPreset = "locked" | "balanced" | "open" | "custom";

export type AgentAction =
  | "createTask" | "markDone" | "escalateFrozen"
  | "createBranch" | "plantBranch" | "archiveWorktree"
  | "archiveWorktreeForce" | "deleteBranch"
  | "editCharter"
  | "ingestRaw" | "lintFix";

export const DESTRUCTIVE: AgentAction[] =
  ["deleteBranch", "archiveWorktreeForce", "editCharter", "escalateFrozen"];
export const ALWAYS_FORBIDDEN =
  ["addRemote", "forcePush", "deleteArtifacts", "editRaw", "editEntities", "editPolicy"] as const;

export type Policy = {
  version: 1;
  preset: PolicyPreset;
  agentMay: Record<AgentAction, Consent>;
  wiki: {
    ingestHandoffs: "always" | "onDone";
    agentWrites: { concepts: boolean; sources: boolean; syntheses: boolean };
    gate: "off" | "warn" | "block";
  };
  declared: {
    push: Consent;
    publishArtifacts: Consent;
  };
  updatedAt: string;
  updatedBy: "human";
};

export type Actor = "human" | "agent";

export type ConsentRequest = {
  id: string;
  action: AgentAction;
  actor: "agent";
  agent: string;
  params: Record<string, unknown>;
  reason: string;
  createdAt: string;
  status: "pending" | "approved" | "denied" | "executed" | "failed";
  decidedAt?: string;
  decidedBy?: "human";
  note?: string;
  error?: string;
};
```

### 默认值（balanced 是新仓默认）

| 动作 | 中文 | 破坏 | locked | balanced | open |
|---|---|---|---|---|---|
| createTask | 开新任务 | 否 | ask | allow | allow |
| createBranch | 为任务建分支和 worktree | 否 | ask | allow | allow |
| plantBranch | 检出已有分支为 worktree | 否 | ask | allow | allow |
| archiveWorktree | 归档干净的 worktree（留分支） | 否 | ask | ask | allow |
| archiveWorktreeForce | 丢弃未提交改动并归档 | 是 | never | never | ask |
| deleteBranch | 删除分支 | 是 | never | never | ask |
| markDone | 标记任务完成 | 否 | ask | ask | allow |
| escalateFrozen | 给自己的任务开「动冻层」 | 是 | never | ask | ask |
| editCharter | 修改宪章 | 是 | never | never | ask |
| ingestRaw | 收入原文到 raw/ | 否 | allow | allow | allow |
| lintFix | lint 自动补 index | 否 | ask | allow | allow |
| wiki.gate | 完成前百科检查 | — | block | warn | warn |
| wiki.ingestHandoffs | 交接进 raw | — | always | always | always |
| declared.push | 推送分支 | — | never | ask | allow |
| declared.publishArtifacts | 发布或覆盖产物 | — | never | never | ask |

**钳制**（`mergePolicy` 强制，不信 UI）：

1. `DESTRUCTIVE` 动作 `allow` → 降为 `ask`。
2. `ingestRaw` 不能 `never` → 升为 `ask`。
3. 任一项与所选 preset 模板不同 → `preset = "custom"`。
4. `agentWrites.concepts=false` 时 `gate` 自动 `off`。

**硬保护**（与 policy 无关，人也一样）：

- deleteBranch：不删 `baseBranch`、不删任何 checkout 的 HEAD、不删有活 worktree 的分支（先归档）、未合入 base 需 `force`（仅人 + `confirmDestructive` 输入分支名）。
- archiveWorktreeForce：仅人或已批准请求。
- editCharter by agent：即使 open 且被批准，只能改 `conventions` / 新增 layer；不能把 `frozen` 改 false、不能缩 `doNotTouch`。

**Actor**：HTTP header + CLI flag，默认 **agent**（fail closed）。人的 UI 必须带 `X-Workzoon-Actor: human`。

---

## D. 信息架构

设置不是第 4 个主视图。三个主视图仍是资产（掌控 / 全部分支 / 任务车道）。

1. **App 设置（机器级）** → preview titlebar 右侧齿轮 → sheet；SwiftUI `Settings { }`。
2. **项目授权（仓级 Policy）** → inspector「宪章」页签拆两段：上「分层与禁区」，下「Agent 授权」。不加第 7 个页签。
3. **待批准** → titlebar 中间显示「N 项待批准」，点击跳宪章·授权顶部请求列表。
4. **账本** → 「掌控」页签底部最近 10 条 ledger。

授权段中文开关按 C 节表格。每项三档：禁止 / 需确认 / 允许。破坏项的「允许」灰掉并注「破坏性动作最高只能到需确认」。

App 设置中文：打开配方 · 新树放在哪 · 新登记仓的默认预设 · 破坏性操作要求输入名称确认 · 动效（跟随系统 / 关闭）。

---

## E. 不动 / 改 / 禁止

**不动**：名字、`.lattice/`、`lattice/<slug>`、`LATTICE_HOME`、TS/Node 22 + HTTP :7780、Vite preview、薄 SwiftUI、不变量 1–12、三主视图 + 六页签、`wiki.ts` 骨架、`holdings.ts`、现有测试保持绿。

**改**：见 F 节按文件清单。

**禁止**：Rust / 改名 / `.keel/` / 拆仓 / 重写 preview / `motion/react` / policy 放 catalog / wiki 义务做成布尔 / 破坏性动作对 Agent 开 allow / 引擎 spawn Agent / 在本仓库检出上建 worktree。

---

## F. 实施清单（按阶段，每阶段一 commit）

每阶段：测试绿 → commit。

### 阶段 1 · Policy 核心

| # | 文件 | 改动 |
|---|---|---|
| 1.1 | `src/types.ts` | 删草稿 `Settings`；加 C 节全部类型；`Catalog.settings: AppSettings`；`Project.policy: Policy` |
| 1.2 | `src/policy.ts`（新） | `PRESETS`、`ACTIONS`、`defaultPolicy`、`mergePolicy`、`assertAllowed`、`renderPolicyMarkdown`、`PolicyError` |
| 1.3 | `src/settings.ts` | 只留 `defaultAppSettings` / `mergeAppSettings` |
| 1.4 | `src/store.ts` | catalog 用 `mergeAppSettings`；`loadProject` 后 `mergePolicy`；`worktreeRoot` 可读 `worktreesRoot` |
| 1.5 | `src/ledger.ts`（新） | 追加 `.lattice/ledger.md` |
| 1.6 | `src/service.ts` | `Caller` 默认 `{actor:"agent"}`；变更函数加 caller + assertAllowed + ledger；`deleteBranch`、`updatePolicy`、`updateAppSettings` |
| 1.7 | `src/git.ts` | `deleteBranch`、`isMerged` |
| 1.8 | `src/inject.ts` | AGENTS.md 写授权摘要；写 `POLICY.md`；同步 `POLICY.md` `ledger.md` |
| 1.9 | `src/holdings.ts` | `## Agent rules` 按 policy 渲染 |
| 1.10 | `src/server.ts` | `X-Workzoon-Actor` 等 header；`GET/POST /api/settings`、`/api/policy`、`POST /api/branches/delete` |
| 1.11 | `src/cli.ts` | `--actor`、`policy`、`settings`、`branch-delete`、`ledger` |
| 1.12 | preview + Swift | UI 请求带 `X-Workzoon-Actor: human` |
| 1.13 | `schema/lattice.schema.json` | 加 `policy`，不进 required |

测试：新 `test/policy.test.ts`；`invariants.test.ts` 里 `markDone` 传 `{actor:"human"}`。

Commit：`Add repo-level agent policy with actor-aware enforcement and ledger`

### 阶段 2 · wiki 义务

| # | 文件 | 改动 |
|---|---|---|
| 2.1 | `src/wiki.ts` | 修 `COMPILED` 标记导致 frontmatter 解析失败（entities `type` 变成 note） |
| 2.2 | `src/wiki.ts` | `ingestHandoffRaw`；raw manifest；lint kinds：`raw-uncompiled` `raw-escape` `orphan` `entity-hand-edit` |
| 2.3 | `src/service.ts` | handoff/done 接 ingest + `wiki.gate` |
| 2.4 | docs + SKILL.md | 义务表 |

Commit：`Ingest handoffs into raw, add raw manifest and duty-aware wiki lint gate`

### 阶段 3 · 请求队列

| # | 文件 | 改动 |
|---|---|---|
| 3.1 | `src/requests.ts`（新） | `.lattice/requests/<id>.json`；ask → 建请求；approve 重放白名单 |
| 3.2 | server / cli | `GET /api/requests`、`POST /api/requests/decide`；`cli requests/approve/deny` |
| 3.3 | snapshot | 加 `requests`、`ledgerTail` |

Commit：`Turn ask into a file-based consent queue with human approval`

### 阶段 4 · UI

| # | 文件 | 改动 |
|---|---|---|
| 4.1 | `preview/src/api.ts` | Policy / AppSettings / ConsentRequest API |
| 4.2 | `preview/src/App.tsx` | 宪章两段、待批准徽标、Settings sheet、LedgerTail、删除分支（confirmDestructive） |
| 4.3 | SwiftUI | 同 API；`Settings { }`；标注「本环境无 Xcode」 |

Commit：`Expose agent policy, app settings, consent inbox, and ledger in preview and SwiftUI`

### 阶段 5 · 文档

- FOUNDATION 不变量 13/14；磁盘布局加 `POLICY.md` `ledger.md` `requests/` `raw/handoffs/`
- ROADMAP 勾 5/6/7/10
- README CLI 默认 actor=agent

Commit：`Document policy, consent queue, and wiki duties in foundation and roadmap`

### 不要做

- 不改 `.lattice/` 目录名、`lattice/<slug>`；不加 Rust。
- 不重写 `App.tsx` 结构，只加组件与 props。
- 不把 policy 写进 catalog；不把 wiki 义务做成 boolean。
- 不做 diff viewer、merge、spawn、PTY。
- 不在本仓库检出上 `git worktree add`。
- 不引向量库 / Mem0 / Graphiti / `motion/react`。
- 每阶段一 commit，测试绿再 push。
- 代码审查交 Opus，不交 Fable。

---

## G. 风险

1. Agent 绕过引擎直接 `git branch -D`——引擎只能管经它的手；靠 POLICY + ledger 对账。
2. Agent 不读 SKILL——AGENTS.md 首行写义务；`markDone` 门禁把义务变成过不去。
3. 设置太复杂——三预设一键；人实际只需选预设、谁点完成。
4. ask 变黑洞——退出码 2 + 徽标 + reason。
5. `markDone` 语义变更：balanced 下 agent 不能自己 done，CLI 需 `--actor human`。这是设计意图。
