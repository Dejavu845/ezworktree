# 百科本地检索

磁盘 markdown 是真相。`GET /api/wiki?q=` 是包含匹配，不是向量，不是第四主视图。

## 命中

非空 query：每个空白分开的 token 都必须出现在 `title + type + tags + path + body`（小写包含）。命中页带：

```
hit: { field: "title" | "type" | "tags" | "path" | "body", snippet: string }
```

`field` 是第一个 token 最先出现的字段，顺序 title → type → tags → path → body。`snippet` 约 88 字，落在命中附近，两端可加 `…`。不改磁盘，不改 frontmatter。

空 query：`wikiList` 仍返回 wiki + raw 全量，不带 `hit`。`searchWiki("")` 仍只回 wiki 层（CLI 兼容）。

## `[[wikilink]]`

`resolveWikiLink(pages, target)` 按路径后缀、文件名、标题解析，忽略 `.md` 与 `.lattice/` 前缀。解析失败不是错误：UI 改搜这个词。

## UI（检查器「百科」）

- `/` 跳到百科并聚焦搜索。打字中（含 `<select>`）不抢键。`2` 仍是交接，不是百科。
- wiki 与 raw 都行可点；选中是砖
- 有 query 显示 snippet；空 query 显示 summary
- 命中计数；没有命中说「没有命中」
- 层滤镜：全部 / wiki / raw
- 正文里的 `[[wikilink]]` 可点
- j/k 或方向键在结果间走并打开；Enter 打开当前或第一条；Escape 清空搜索
- lint 问题的路径可点，打开那一页
- **不自动展开**。空搜不打开 `wiki/index.md`（长文会挤掉列表）。输入 query 不打开第一条（可能是没有链接的 raw）。只在点行 / j/k / Enter 时打开。

## 禁止

不写向量库。不加第四主视图。不把 qmd 做成新产品。不改 raw / entities 的写入规则。
