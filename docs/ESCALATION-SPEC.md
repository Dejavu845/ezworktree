# ROADMAP #3 Escalation（Fable · 这一刀）

`allowFrozenTouch: true` 必须附带 `escalation`（理由 + 谁 + 何时）。不改冻层判定语义。最短 4 个字。

完整规则见上一轮 Fable 规格：`src/escalation.ts` 纯函数；createTask 先校验理由再 guard；blast 只改 ok 文案；worktree `AGENTS.md` / 任务卡 / wiki / handoff 各一行（主仓 AGENTS 不写当前任务）；preview toggle 展开理由框。

禁止：不改 policy 钳制、不新增路由、不删 boolean、不改 invariants 现有断言。
