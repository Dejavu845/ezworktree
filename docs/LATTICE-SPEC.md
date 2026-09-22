# ROADMAP #1 任务简报（Fable · 这一刀）

**`WORKZOON.md` 是唯一树根简报。`LATTICE.md` 名弃用。** 不写指针文件。树根用产品名；内部存储仍是 `.lattice/`。

Cloud Agent 看不到任何 untracked 文件。回退读分支上已跟踪的 `.lattice/handoffs/<id>.md`（开树后由引擎 `git add -f`）。任务卡同样钉在该分支。主仓 `AGENTS.md` 不写当前任务。见 `BRANCH-FILES-SPEC.md`。

## 谁读

| 读者 | 读 |
|---|---|
| 本地 Agent | `WORKZOON.md` → Read next |
| Cloud Agent | 分支上 `.lattice/handoffs/<id>.md`；没有则 `AGENTS.md`；都没有 → 停，向人要 resume prompt |
| 人 | 检查器「交接」；不手改 `WORKZOON.md` |

## 写入

引擎所有。唯一入口 `syncGovernanceToWorktree`。每次整文件覆盖。不报 drift。人手改下次 sync 丢失。

标记：`<!-- workzoon-brief v1 · task: <id|none> · rendered: <ISO> · engine-owned … -->`

有任务：Task / Branch（`currentBranch(dest)`）/ Worktree / Repo；Scope（Allowed / Forbidden = doNotTouch ∪ forbidden / Frozen layers / Frozen touch）；Handoff 权威路径 + `cannot see untracked files` 回退句。

plant 无任务：`Task: none`；无 Frozen touch；Handoff 为 none；不得出现 `handoffs/<uuid>.md`。

禁止：进度、blast、编造路径、`LATTICE.md` 字样、交接正文拷贝。

## exclude

`GOVERNANCE_EXCLUDE`：`AGENTS.md` `CLAUDE.md` `WORKZOON.md` `.lattice/` `.agents/`。不加 `LATTICE.md`。

经 `git rev-parse --git-path info/exclude`。linked worktree 落在主仓 `.git/info/exclude`（common dir）。整行 trim 精确去重。写失败静默。

## 其他

`resumePrompt` 加一行：先读 `WORKZOON.md`；看不见则读分支上的交接。

本刀零 UI。不改 preview / HTTP / CLI。
