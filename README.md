# ezworktree · 工区 / Agent Workzoon

人掌控仓库、分支、源码 checkout 和产物；Agent 在宪章和一棵已登记的 worktree 里规范开发。知识层是 Karpathy 式 LLM wiki：`raw/` 原文、`wiki/` 编译页。`.lattice/HOLDINGS.md` 是两边共用的资产清单。

这不是 Cursor / Claude / Codex 的启动器。引擎只做治理：冻层、允许路径、爆炸半径、强制交接、编译实体页。预览和 Swift 壳都不直接碰 git；所有变更经 `:7780` 引擎落地。按钮可以请引擎创建检出目录，成功后再复制打开命令，不会自动打开外部软件。

**不是**：Git GUI、IDE、聊天壳、终端复用器、Gas Town 式编排器。不启动 Agent 进程，不看 diff 正文，不合入分支。

界面上的名字是 **工区**。这个仓库叫 `ezworktree`。

## 为什么存在

Vibe Kanban、Gas Town、Claude Squad、Conductor、一堆 macOS worktree GUI，都解决「并行」或「隔离」，不解决「后来的 Agent 把前面改得六亲不认」。调研见 [`docs/RESEARCH.md`](docs/RESEARCH.md)，底座合同见 [`docs/FOUNDATION.md`](docs/FOUNDATION.md)。

## 跑起来

需要 Node.js 22。

```bash
git clone https://github.com/Dejavu845/ezworktree.git
cd ezworktree
export LATTICE_HOME="$PWD/.local"
npm test
npm run serve   # :7780
cd preview && npm install && npm run dev   # :5173，把 /api 代理到 7780
```

`LATTICE_HOME` 必须放在被治理的仓库外面。不要在本仓库自己的检出上 `git worktree add`，也不要把预览里的登记路径填成这个目录。演示请另建一个 fixture 仓。

## CLI

默认身份是 **agent**（fail closed）。人必须传 `--actor human`。`ask` 会写成 `.lattice/requests/<id>.json` 并退出码 2。

```bash
node --experimental-strip-types src/cli.ts init --root /path/to/repo --name Harbor --group studio
node --experimental-strip-types src/cli.ts task --root /path/to/repo --title "Fix player" --allow app/** --actor human
node --experimental-strip-types src/cli.ts tree --root /path/to/repo --task <id> --actor human
node --experimental-strip-types src/cli.ts handoff --root /path/to/repo --task <id>
node --experimental-strip-types src/cli.ts done --root /path/to/repo --task <id> --actor human
node --experimental-strip-types src/cli.ts policy --root /path/to/repo
node --experimental-strip-types src/cli.ts settings
node --experimental-strip-types src/cli.ts requests --root /path/to/repo
node --experimental-strip-types src/cli.ts approve --root /path/to/repo --id <request> --actor human
node --experimental-strip-types src/cli.ts map --root /path/to/repo
node --experimental-strip-types src/cli.ts holdings --root /path/to/repo
node --experimental-strip-types src/cli.ts plant --root /path/to/repo --branch feature/x
node --experimental-strip-types src/cli.ts wiki --root /path/to/repo --q charter
```

仓内会写入 `AGENTS.md`（`<!-- lattice:begin sha256=… -->` 段；手改后引擎不覆盖，宪章页同步）、`CLAUDE.md`（`@AGENTS.md`）、`.lattice/{raw,wiki,handoffs}`、以及 `.agents/skills/workzoon-wiki/SKILL.md`。

## macOS 原生

`macos/Lattice/` 是 SwiftUI 壳：`NavigationSplitView` 打 `http://127.0.0.1:7780`。在 Mac 上另开终端跑引擎，再打开 `macos/Lattice`。

## 知识库

主格式是 Karpathy [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)。详见 [`docs/LLM-WIKI.md`](docs/LLM-WIKI.md)。Foam / Obsidian 可以打开同一目录，不嵌内核。
