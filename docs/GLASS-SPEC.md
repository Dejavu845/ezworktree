# 玻璃控制台（3h loop）

人嫌纸面丑。这一窗只改 **preview 材料层**，不改三主视图、不改引擎合同、不加第四视图、不引 Three.js / GSAP / `motion/react`。

对照 Apple **Control Center 模块** + **Liquid Glass**（WWDC25 / iOS 26 / macOS Tahoe）：玻璃是 **浮在内容上的功能层**，不是墙纸，也不是给每一行列表上霜。

## 闭集

| 层 | 材料 | 为什么 |
|---|---|---|
| 顶栏 / 侧栏 / 检查器 | Regular 玻璃 | 导航与控制，要让底下内容透过来 |
| 掌控四格 / 工序条 / 设置 sheet / toast | 模块玻璃 | Control Center 那种成组圆角砖 |
| 滤镜 / 页签 / 设置钮 | 胶囊簇 | 一组控制，不要四条硬下划线 |
| 中栏列表、源码、交接正文 | 不铺满玻璃 | 内容层保持可读 |

## 光学（CSS 近似，不是系统材质）

系统 Liquid Glass 有实时透镜。本环境只有 CSS：

1. `backdrop-filter: blur + saturate`（散射）
2. 半透明 fill（让底下纸面 / 工场远景透上来）
3. 1px 亮边 + inset 高光（透镜轮廓）
4. 轻阴影（厚一点的模块更深）
5. hover 时 fill 略亮，不长投影、不跳色

`motion: off` / `prefers-reduced-motion`：blur 归零，fill 更实，只留圆角模块。
`prefers-contrast`：边更实，透明更低。

## 几何

Control Center：大圆角、模块间隙小、组内对齐。

- 模块 `--radius-mod: 22px`
- 胶囊 `--radius-chip: 999px`
- 玻璃 chrome `--radius-chrome: 16px`
- 四格仪表同一簇，gap 10px，不是四条裸数字

## 下一刀（本 loop）

1. **材料 token + chrome 玻璃 + 四格模块** — 已做
2. **滤镜 / 页签 / sheet / toast 胶囊簇** — 已做
3. **侧栏与检查器选中态玻璃砖** — 已做
4. **指针高光** — 已做。`--hx --hy` 跟手，镀在顶栏 / 四格 / 选中砖 / sheet。`motion: off` 钉死。
5. **工位甲板 + 工序条同材料** — 已做
6. **对比度 / `motion: off` 补洞** — 已做。关动效时 blur 全摘；高对比度时高光层关掉、边更实。
7. **组卡条收进玻璃托盘** — 已做。队列空后最刺眼的一处：中栏「新任务」不再是裸输入框。
8. **列表去发丝线** — 已做。森林/车道/源码不再画表格底边，未选中行仍是内容层。
9. **干练场子加深** — 已做。纸面略沉、砖更透，玻璃才有东西可透。
10. **对照 pulse 收进模块** — 已做。检查器心跳盒不再用顶部分割线；路径表去掉左边线。

## 不做

第四主视图 · 假完成度 · 改名 · spawn · 把玻璃写进仓内真相 · 重做设置矩阵字段 · 提交根 `pnpm-lock.yaml`
