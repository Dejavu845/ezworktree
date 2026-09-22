# 交接结构 + HEAD（NODES-PLAN 刀 8 / Fable INV-5）

替代「只认 `<!-- agent-handoff v1`」。生成交接写 YAML；完成门还要对齐当前 HEAD。

## frontmatter 闭集

```
---
v: 1
task: <uuid>
branch: feat/<slug>
head: <sha> | none
from: <agent>
to: <agent>
updated: <ISO>
---
```

多键拒。`head: none` 只给还没有分支的卡。有树或已有分支时必须是该检出 / 该 ref 的 HEAD（允许 7+ 前缀）。

## 结构

标记仍写。固定节：`Decisions` · `Live state` · `In flight` · `Landmines` · `Next action` · `Lattice`。`Lattice` 含 `- Charter: vn`（当场 `charter.version`）。不进 frontmatter 闭集。

## 完成门

`isValidHandoff` = 闭集 frontmatter + 标记 + 六节。
`isAlignedHandoff` = 上式 + `task` / `branch` / `head` 对得上当场 git。
`markDone` 要对齐。HEAD 走过必须再生成。不抄 pulse。对齐用的 HEAD 跳过 `workzoon:` 引擎提交（任务卡 / 交接 `add -f`），只认 Agent / 人的 feature commit。

## 不做

第四主视图 · 把交接当实时 · 只认 marker 就能完成
