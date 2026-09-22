# ROADMAP #2 Drift（Fable · 这一刀）

只做一件事：`AGENTS.md` 托管段被手改要看得见，人可以「同步」。引擎算，UI 显示，只有 human 写。

v1 只检测 `AGENTS.md`。`HOLDINGS.md`（compileEntityWiki 每次 snapshot 重写）和 `POLICY.md`（loadProject / inject 重写）是引擎所有，**不报 drift**。

## 1. 类型（`src/types.ts`）

```ts
export type DriftKind = "edited" | "missing" | "stale";
export type Drift = { file: "AGENTS.md"; kind: DriftKind; recorded?: string; actual?: string };
```

- `missing`：文件不存在，或没有成对的 BEGIN/END。
- `stale`：BEGIN 没带 `sha256=`（旧格式）。
- `edited`：标记里的 hash ≠ 正文 hash。
- 干净 = `[]`。单文件最多一条，数组是为以后留的。

## 2. hash / 标记 / 旧标记

新文件 `src/drift.ts`，纯函数，唯一的 fs 是 `detectDrift` 里的 `readFileSync`。

```ts
import { createHash } from "node:crypto";

export const END = "<!-- lattice:end -->";
// 非 g 标志。group1 = 旧/新 BEGIN 里的 hash（可空），group2 = 正文
export const BLOCK_RE = /<!-- lattice:begin(?: sha256=([0-9a-f]{12}))? -->([\s\S]*?)<!-- lattice:end -->/;

export function blockHash(body: string): string {
  return createHash("sha256").update(body.replace(/\r\n/g, "\n").trim()).digest("hex").slice(0, 12);
}
export function beginMarker(body: string): string {
  return `<!-- lattice:begin sha256=${blockHash(body)} -->`;
}
export function driftOf(text: string | null): Drift | null   // 纯：text → 一条 drift 或 null
export function detectDrift(project: Project): Drift[]       // 读 <root>/AGENTS.md → driftOf
```

- 正文 = BEGIN 行与 END 行之间的文字（不含标记行）；hash 前 `CRLF→LF` + `trim()`，所以写入时 `blockHash(block)` 与读回时 `blockHash(group2)` 相等。
- 写入格式：`<!-- lattice:begin sha256=<12hex> -->\n${block}\n<!-- lattice:end -->`。
- 旧标记 `<!-- lattice:begin -->` 被同一个 `BLOCK_RE` 匹配，group1 为空 → `stale`。任何一次引擎写入（inject 或 sync）都会换成带 hash 的新标记，所以 stale 只会出现一次。

## 3. 谁写磁盘

| 函数 | 写盘 |
|---|---|
| `detectDrift` / `driftOf` / `projectDrift` / `GET /api/drift` / `snapshot` | 否 |
| `syncAgents`（human） | 是：主仓 `injectProjectFiles` 不带当前任务；有树则 `syncGovernanceToWorktree` + `publishTaskFilesToBranch` |
| 常规 `injectProjectFiles`（openWorktree / updateCharter / updatePolicy / deleteBranch / init） | `missing`、`stale`、干净 → 照写并盖 hash；**`edited` → 跳过 AGENTS.md 不写**，其余文件照写 |

最后一行是这一刀的核心：人手改过的段，只有人按「同步」才会被覆盖。同步 = 用当前引擎渲染整段替换托管段，段外人类文字保留，不做 merge。

## 4. snapshot

`snapshotWithMaps()` 加一项，紧跟 `ledgerTail` 的写法：

```ts
drift: snap.projects.map((project) => ({ rootPath: project.rootPath, items: detectDrift(project) }))
```

只读。snapshot 已有的 compileEntityWiki / collectHoldings 写盘与 AGENTS.md 无关，顺序不影响结果。

## 5. API / CLI

`src/service.ts`

```ts
export function projectDrift(rootPath: string): Drift[]            // requireProject → detectDrift
export function syncAgents(rootPath: string, caller: Caller = AGENT, taskId?: string):
  { project: Project; before: Drift[]; drift: Drift[] }
```

`syncAgents`：`who.actor !== "human"` → `throw new PolicyError("never", "editCharter", humanRejectReason("sync"))`（与 `updatePolicy` 同一写法，不新增 AgentAction）。`task` = `--task` 指定的，否则第一个 `status === "active" && worktreeId` 的任务，否则不带。写完 `ledger(project, who, "syncAgents", "AGENTS.md", before.map(d => d.kind).join(",") || "clean")`。不 `touch(project)`。

`src/server.ts`

- `GET /api/drift?root=` → `projectDrift(root)`
- `POST /api/agents/sync` body `{ rootPath, taskId? }` → `syncAgents(root, caller, body.taskId)`；agent 走 `wrap` 得 403

`src/cli.ts`

- `workzoon drift --root <p>` → 打印 `Drift[]`，exit 0（是报告，不是 gate）
- `workzoon sync --root <p> --actor human [--task <id>]` → 打印返回值；默认 actor agent → exit 2
- usage 字符串加 `drift|sync`

## 6. Preview

`preview/src/api.ts`

```ts
export type Drift = { file: string; kind: "edited" | "missing" | "stale"; recorded?: string; actual?: string };
// Snapshot 加：drift?: { rootPath: string; items: Drift[] }[];
sync: (rootPath: string) => json<{ project: Project; drift: Drift[] }>("/api/agents/sync", { method: "POST", body: JSON.stringify({ rootPath }) }),
```

`preview/src/App.tsx`

- `const drift = useMemo(() => (snap?.drift || []).find((d) => d.rootPath === project?.rootPath)?.items || [], [snap, project]);`
- titlebar 引擎点：`className={snap ? (drift.length ? "engine on drift" : "engine on") : "engine"}`，`title={drift.length ? "AGENTS.md 托管段已漂移" : "引擎"}`
- `CharterPane` 加两个 prop：`drift: Drift[]`、`onSync: () => void`。`RequestsList` 之上放一行，有 drift 才渲染：

```tsx
<p className="drift-line">
  AGENTS.md 托管段{{ edited: "被手改", missing: "缺失", stale: "无签名（旧格式）" }[drift[0].kind]}。
  <button className="text" disabled={busy} onClick={onSync}>同步</button>
</p>
```

- `onSync` → `run(async () => { await api.sync(project.rootPath); await refresh(project.id, task?.id); })`

`preview/src/styles.css` 两条：`.engine.drift { background: var(--warn); }`、`.drift-line { color: var(--warn); font-size: 12px; display: flex; gap: 8px; align-items: center; }`

Preview 不算 drift，只显示 `snapshot.drift`。

## 7. 按文件改动

| 文件 | 改动 |
|---|---|
| `src/types.ts` | `DriftKind`、`Drift` |
| `src/drift.ts`（新） | `END`、`BLOCK_RE`、`blockHash`、`beginMarker`、`driftOf`、`detectDrift` |
| `src/inject.ts` | 删本地 `BEGIN/END`，改从 `drift.ts` 导入；`upsertMarked` 用 `BLOCK_RE` 匹配、写 `beginMarker(block)`；`injectProjectFiles(project, task?, opts?: { force?: boolean })`，`driftOf(previous)?.kind === "edited" && !opts.force` 时跳过 AGENTS.md |
| `src/service.ts` | `projectDrift`、`syncAgents`；`snapshotWithMaps` 加 `drift` |
| `src/server.ts` | `GET /api/drift`、`POST /api/agents/sync` |
| `src/cli.ts` | `drift`、`sync`、usage |
| `preview/src/api.ts` | `Drift`、`Snapshot.drift`、`api.sync` |
| `preview/src/App.tsx` | `drift` memo、titlebar 黄点、`CharterPane` 顶一行 + `onSync` |
| `preview/src/styles.css` | `.engine.drift`、`.drift-line` |
| `test/drift.test.ts`（新） | 见下 |
| `README.md` | 第 51 行 `<!-- lattice:begin -->` 改为 `<!-- lattice:begin sha256=… -->`，一句话说「手改后引擎不覆盖，宪章页同步」 |

`drift.ts` 不得 import `inject.ts`（避免环）。

## 测试（`test/drift.test.ts`，自建 tmp HOME + repo，照 `requests.test.ts`）

1. **init 干净**：`detectDrift(project)` 为 `[]`；AGENTS.md 匹配 `/<!-- lattice:begin sha256=[0-9a-f]{12} -->/`；`snapshotWithMaps().drift` 中该 root 的 `items` 为 `[]`。
2. **edited 只读 + 保护**：在 BEGIN/END 之间插一行 → `[{ file: "AGENTS.md", kind: "edited" }]`；连续两次 `snapshotWithMaps()` 后 AGENTS.md 内容逐字节不变；human `updateCharter(...)` 后那一行仍在、drift 仍是 `edited`。
3. **stale → sync 保段外**：手写 `# Mine\nkeep-top\n\n<!-- lattice:begin -->\nold\n<!-- lattice:end -->\n\n## Tail\nkeep-bottom\n` → `stale`；`syncAgents(repo, { actor: "human" })` → `[]`，新 BEGIN 带 hash，`keep-top` / `keep-bottom` 原样在，`old` 不在；ledger 尾有 `human | syncAgents | AGENTS.md | stale`。
4. **missing + actor 锁**：`rmSync(AGENTS.md)` → `missing`；`syncAgents(repo)`（默认 agent）抛 `PolicyError`、`code === "never"`，文件仍不存在；human sync 后文件存在且 `[]`。
5. **纯函数**：`driftOf(null)?.kind === "missing"`；`driftOf("# x\n")?.kind === "missing"`；`blockHash("a\r\nb\n") === blockHash("a\nb")`。

不动 `invariants.test.ts` 共享 fixture。

## 8. 禁止

- 不对 `HOLDINGS.md` / `POLICY.md` 报 drift。
- `detectDrift` 不写盘、不调 `renderAgentsBlock`、不比对「当前引擎渲染」——只比标记 hash 与正文 hash。渲染不同不叫 drift。
- 读层（snapshot、任何 GET）不 sync；不加定时器、不加 file watcher。
- Preview 不算 drift，只读 `snapshot.drift`。
- sync 非 human 抛 `PolicyError never`；不新增 AgentAction、不进 Policy 表、不进 consent 队列。
- 不做三方 merge / diff UI；同步不保留块内人类文字。
- 不检测 worktree 里的 AGENTS.md 副本；`syncGovernanceToWorktree` 照旧拷贝。
- drift 不是 gate：不阻 `markDone` / `openWorktree` / commit（那是 #4 guard hook）。
- 不改 `CLAUDE.md`、`.cursor/rules`、`SKILL.md` 的写法；不改 `charter.md` / `POLICY.md` 的写入。
- hash 只用 `node:crypto` sha256 前 12 hex；不引入依赖。
