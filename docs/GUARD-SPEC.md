# Guard hook（NODES-PLAN 刀 9 / ROADMAP #4）

`pre-commit` 调 `workzoon guard --staged`。禁区 / 冻层 / 允许区闭集与 blast 同一套判定。`warning` 不拦。

## 命令

`workzoon guard --staged --root <checkout>`

检出可以是主树或 worktree。仓根用 `git-common-dir` 上的 `.lattice/project.json`。任务：`--task` → 这棵树登记的任务 → 当前分支对得上的任务 → 宪章兜底（只拦禁区与冻层）。

## 放行

`LATTICE_OVERRIDE=1` 才能带 blocked 提交。引擎写 ledger：`guard.override`。没有这个环境变量就 exit 1。

## 安装

`init` / `inject` 写主仓 `.git/hooks/pre-commit`（`# workzoon-guard`）。已有别人的 hook 不覆盖。hooks 不入库。

## 不做

CI · 拦 warning · 第四主视图 · 在本仓库检出上建 worktree
