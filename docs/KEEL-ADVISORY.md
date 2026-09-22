# Fable「龙骨 / Keel」简报 — 顾问锁定

来源：[Fable foundation design](bc-37c4f57a-425e-5d29-b82c-1a4249d69ae4)。

这份简报把治理层想清楚了。它**不是**实现合同。实现合同仍是 `FOUNDATION.md`。产品对外名仍是 **Agent Workzoon / 工区**。

## 已吸收（不必重做）

| 简报论点 | Workzoon 现状 |
|---|---|
| 冻层永远检查，不被 `layerIds` 收窄 | `blast.ts` 已修 |
| 指令不是执法 | blast + 完成门；AGENTS.md 只注入 |
| 不 spawn Agent | 引擎只写文件、建树、给路径 |
| 仓内文件为真 | `.lattice/` + `HOLDINGS.md` + wiki |
| 交接先于完成 | `markDone` 校验 handoff 标记 |
| worktree 不进 `/tmp` | `LATTICE_HOME/worktrees/` |
| 治理文件必须进 worktree | `syncGovernanceToWorktree` + `WORKZOON.md` |
| blast 看 staged / rename 两侧 | `changedFiles` 已修 |
| 人掌控仓、分支、源码、产物 | holdings 四宫格 + `plant` |

## 明确拒绝（会拆掉已定产品）

- **改名 Keel / 龙骨 / `.keel/` / `keel/` 分支**。用户已定 Agent Workzoon。内部目录保持 `.lattice/`，避免拆仓。
- **用 Rust 重写引擎、去掉 HTTP、改 stdio**。本环境与现有预览走 TypeScript。v1 不回头。
- **ASCII-only slug**。中文任务名必须能进分支。
- **把知识库退回「只做 Foam」**。知识层是 Karpathy `raw/` + `wiki/`；Foam 只是兼容阅读器。
- **把 Studio/Career 默认分组当错误删掉**。那是 catalog 透镜，不是仓内真相。

## 下一刀再做（简报里对、但会撑破这一刀）

1. 交接改为结构校验 + `head` 对齐，而不是只认 marker。（已做，见 `HANDOFF-SPEC.md`）
2. 任务卡 / 交接写在**任务分支**上，主 checkout 的 `AGENTS.md` 不再带「当前任务」。（已做，见 `BRANCH-FILES-SPEC.md`）
3. `project.json` 去掉绝对 `rootPath`；机器路径只进 catalog。（已做，见 `ROOT-PATH-SPEC.md`）
4. 宪章 `version` + blast/handoff 记版本。（已做，见 `CHARTER-VERSION-SPEC.md`）
5. 破坏性操作两段式：删树 / 删分支要点名确认。（已做，见 `CONFIRM-SPEC.md`）
6. **设置页把选择交给人**：矩阵 / `openIn` / `ingestRaw` / 增删分支守卫、清单外拓扑、`agentWrites` 执法均已落地。不把 `declared.push` 做成推送 UI。
7. `worktreesRoot` 改成对人可读的目录（`~/Workzoon/worktrees/<project>/<slug>`）。已做，见 `WORKTREE-ROOT-SPEC.md`。已有树不搬家。
8. `pre-commit` 调 `workzoon guard --staged`。（已做，见 `GUARD-SPEC.md`）

## 一句话

Fable 的法（冻层、交接、仓内真相、不控进程）我们认。Fable 的船名和船坞（Keel、Rust、拆仓）我们不跟。
