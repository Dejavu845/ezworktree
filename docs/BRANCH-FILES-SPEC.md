# 任务文件上分支（ROADMAP #9 / KEEL-ADVISORY #2）

任务卡与交接跟**任务分支**走。主 checkout 的 `AGENTS.md` 不再翻转「当前任务」。

Cloud Agent 看不见 untracked 文件。它们必须能在任务分支上读到已跟踪的 `.lattice/handoffs/<id>.md`（以及同目录任务卡）。

## 谁写在哪

| 文件 | 主 checkout | 已开树的任务分支 |
|---|---|---|
| `AGENTS.md` | 永远无 `Current task`。写明这是主 checkout，去 listed worktree 读 `WORKZOON.md`。 | sync 后覆盖为该任务段（Allowed / Forbidden / Escalation / 读交接） |
| `.lattice/tasks/<id>.md` | 引擎真相；exclude 仍是 `.lattice/` | `git add -f` 后提交 |
| `.lattice/handoffs/<id>.md` | 引擎真相；exclude 仍是 `.lattice/` | `git add -f` 后提交 |
| 未开树的卡 | 只留主仓磁盘，不进任何分支 | — |

exclude 不改：`AGENTS.md` `CLAUDE.md` `WORKZOON.md` `.lattice/` `.agents/` 仍写在 common dir。不把 `.lattice/` 从 exclude 拿掉（主仓 `git status` 会吵，也容易把任务文件提交进 main）。

## 提交

唯一入口 `publishTaskFilesToBranch`。只 `add -f` 上述两个路径，`commit --no-verify -- <paths>`，信息前缀 `workzoon:`。

不提交 `AGENTS.md` / `WORKZOON.md` / 宪章。不在本仓库检出上建树。测试用 fixture + `LATTICE_HOME`。

引擎提交不参与交接 `head` 对齐：`featureHead` 跳过 `workzoon:` 提交。Agent 自己的 commit 仍会让旧交接失效。

## blast

`.lattice/tasks/**` 与 `.lattice/handoffs/**` 在允许区闭集检查之前判 `ok`（`engine-owned task file`）。禁区 / 冻层仍先判。

`changedFiles` / `changedOnBranch` 不把这两类路径算进 Agent diff（与产物 pin 相同），占用板的 diff / blast 格不因引擎提交点亮。

## 不做

第四主视图 · 产物 bytes 进功能分支 · 主仓 AGENTS 轮换当前任务 · 解开全局 `.lattice/` exclude
