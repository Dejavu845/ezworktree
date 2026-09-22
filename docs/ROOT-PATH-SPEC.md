# project.json 不写机器路径（ROADMAP / KEEL-ADVISORY #3）

`.lattice/project.json` 是仓内真相，会随仓走。绝对 `rootPath` 是本机坐标，只许进 catalog。

## 谁记路径

| 层 | `rootPath` |
|---|---|
| `.lattice/project.json` | **不写**。旧文件里若有，加载时丢掉。 |
| 内存 `Project` | 加载时用「包含 `.lattice/` 的仓根」注入。 |
| `$LATTICE_HOME/catalog.json` | 写。本机索引：路径、分组、最近打开。 |
| HTTP / preview / Swift | 仍读内存 / catalog 里的路径。 |

## 读写

- `projectToDisk` 删 `rootPath` 再 `JSON.stringify`。
- `hydrateProject(raw, rootPath)` 忽略盘上旧值。
- `loadProject(abs)` 的 `abs` 就是注入值。policy 补全或发现旧 `rootPath` 时立刻回写（去掉该键）。
- worktree / 交接文件里的绝对路径本刀不动（KEEL #7）。

## 不做

改 catalog 合同 · 第四主视图 · 把 HOLDINGS 里给人看的本机路径删掉 · 重写引擎
