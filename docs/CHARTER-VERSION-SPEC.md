# 宪章 version（KEEL-ADVISORY #4）

宪章是法。改过就要加版本，blast 和交接记下当时对照的是哪一版。不改冻层 / 禁区判定。

## 字段

`charter.version`：正整数，引擎持有。init = `1`。旧 `project.json` 缺字段 → 加载补 `1` 并回写。

调用方传入的 `version` 不算数。正文（purpose / architecture / conventions / doNotTouch / layers）没变 → 版本不动；变了 → `+1`。

## 谁记

| 面 | 写法 |
|---|---|
| `.lattice/charter.md` | `Version: n` |
| `BlastReport.charterVersion` | 当场 `charter.version` |
| 交接 `## Lattice` | `- Charter: vn` |

frontmatter 闭集不动（不加 `charter` 键）。Policy `version: 1` 是 schema，不是宪章版。

## UI

检查器宪章页与对照页各一行「宪章 vN」。不第四主视图。不改判定。

## 不做

用 version 放行冻层 · 在交接 YAML 加键 · 自报 % · 改三主视图
