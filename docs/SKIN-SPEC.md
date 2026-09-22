# 双皮肤（干练 / 工场）

人自己选视图。机器级 `AppSettings.skin`，进 catalog，不进仓内 `project.json`。

工场是**主题色**，不是科幻地板。对照可读性：列表、检查器、四格数字保持静止。

## 闭集

| 值 | 给人看 | 行为 |
|---|---|---|
| `lean`（默认） | 干练 | 纸面工区。森林上方同样有 worktree 工位。 |
| `forge` | 工场 | 深色主题。同一套 `WorktreeDeck`，三主视图不变。列表 / 检查器 / 表格 **零 transform**。 |

其它值加载时回落 `lean`。

## 工场装饰

`AppSettings.forgeDecor`：`off`（默认）| `on`。只加一层静止底色，不扭列表、不转工位、不让四格数字随滚动变淡。

CLI：`workzoon settings --skin forge --forgeDecor off --actor human`。

`motion: off` / 系统减弱动效时，装饰层也不跟手。换页 / 接住 / 证据跳动见 [MOTION-SPEC.md](./MOTION-SPEC.md)。

## 工场阅读面（硬约束）

| 层 | 规则 |
|---|---|
| 列表行 / 检查器 / 工序条 | `transform: none` |
| 四格数字 | 不位移、不缩放、不降透明度 |
| 工位甲板 | 平铺，无透视 |
| 工位状态点 | 静止圆点，无无限旋转 |
| 视差 | 默认不画；`forgeDecor=on` 最多一层静止底色 |

正文用 `ink-2`，路径 / meta 用 `ink-3` 且 ≥12.5px。`ink-4` 只做装饰，不承载信息。侧栏和检查器是实底，正文不铺在模糊层上。页签粘在检查器顶部。

## 不做

第四主视图 · 假红绿灯 · 自报 % · 改三主视图职责 · 把皮肤写进仓内真相 · Three.js / GSAP · 再开一轮大面积玻璃
