# Lattice UX 摘录

来源：[Fable UX 调研](bc-70552ac2-0ec3-5e05-a5a6-f5ab8789cd3d)。实现以 `FOUNDATION.md` 为准；这里只留「偷什么 / 拒什么」和 v1 文案。

## 论点

竞品管的是 **session**。没人管 **scope**。产品的主对象是带宪章的任务；worktree 只是容器。

## 偷 / 拒

| 对象 | 偷 | 拒 |
|---|---|---|
| Conductor | 新建 worktree 必须零摩擦 | 城市名当身份；侧栏以 session 为主 |
| Crystal / Nimbalyst | diff 和审查闭环 | 再做一套 Git GUI |
| Vibe Kanban | 状态是透镜，不是家 | 看板当地图 |
| Gas Town | 需要规则和角色 | 全部名词 |
| GitButler | 所有权可视化 | 虚拟分支当存储（Agent 要真实文件夹） |
| Teebe | Reveal in Finder / Open in Cursor | 做成文件浏览器 |
| Maestri | 一眼看到多条进行中 | 无限画布 |
| Fork / Tower | 深链出去 | 提交图、rebase |
| Foam / Obsidian | 读 `[[wikilink]]` | 当笔记编辑器 |

## v1 屏幕

欢迎/登记仓 · 项目总览 · 宪章 · 任务表 · 任务详情 · 交接 · 影响范围 · 空状态。

知识库只渲染和写入交接/决策，不编辑 vault。⌘↩ 留给 Obsidian/VS Code。

动效用 `motion` 的 DOM API（spring / stagger / press / hover），不引入 `motion/react`。`prefers-reduced-motion` 时全部关掉。动词闭集和触发见 [MOTION-SPEC.md](./MOTION-SPEC.md)：挂在换页、选中、证据上，不挂在背景漂浮上。
