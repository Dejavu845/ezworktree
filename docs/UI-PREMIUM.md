# Preview 控制面视觉规格（Fable · 这一刀）

用户原话：这个 UI 不够高级。产品锁不变：三主视图、六页签、暖纸、中文、motion DOM/mini。

「高级」= Linear / Raycast / 仪器面板。不是毛玻璃 SaaS，不是假 macOS 皮。

## 必做

1. 删假交通灯。titlebar 左侧 = `组 / 仓名`；右侧 = 待批准徽标 + `人` actor + 引擎点 + sliders SVG。slogan 和「已复制」镜像删掉。
2. Token：三层表面 `--bg --surface --raised`；五档 ink；圆角只 0 / 4 / 8；字重禁止 700；`--moss-soft` 归零。
3. 掌控四宫格改 `GaugeStrip`（4 仪表 + 刻度 + 分母）+ 来源/产物两栏。无卡底、无 `will-change`。
4. 森林/车道：36px 行、无圆角卡底、rail 列、按前缀分组。删除确认搬出行为 popover。
5. 侧栏登记表单收进 sheet；主区新任务收进「+ 新任务」展开行。静止态 `.primary` = 0。
6. inspector 页签改下划线；授权改三格矩阵（按任务/分支/宪章/百科分组）。破坏「允许」斜纹禁用。
7. 动效：删 hover 上浮；rise 只前 16 条、更短；press 只按钮。

## 验收

```
rg "⚙" preview/src                       # 0
rg "border-radius: (10|12|14|16)px" preview/src/styles.css   # 0
rg "moss-soft|!important|#fff\b" preview/src/styles.css      # 0（斜纹除外）
rg "translateY\(-2px\)" preview/src/motion.ts               # 0
rg "\.lights" preview/src                 # 0
```

- `styles.css` 可整文件重写。`App.tsx` 只改 markup/className + `registerOpen` `composeOpen` `deleteFor`。
- 不改 `api.ts`、`src/**`、三主视图 IA。不引新依赖。不 `motion/react`。
- `pnpm --dir lattice/preview build` 过；`pnpm --dir lattice test` 仍绿。

## 下一刀（loop 选题，按序）

见 [WORKTREE-DECK-SPEC.md](./WORKTREE-DECK-SPEC.md)。worktree 工位跟鼠标，不第四视图。
