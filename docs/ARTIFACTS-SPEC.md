# 产物版本 pin（NODES-PLAN 刀 2）

记录挂分支。bytes 不进功能分支。图是读层，见 `GRAPH-SPEC.md`。

## 磁盘

`.lattice/artifacts/<branch 的 / → ->/<id>.json`

`id` = `${sha12}-${safeName}-${contentHash8}`

`contentHash` = sha256(按路径排序的 `relPath\tbytes` 行)，不是文件内容。超过 5000 个文件标 `partial: true`。

同一 `sha + name + contentHash` 幂等，不新开记录。

## 谁写

只有人能钉 / 取消钉。Agent → `PolicyError("never")` + ledger `denied`。不新开 Policy 动作（复用 `editCharter` 的人闸，与 `syncAgents` 同形）。

CLI：`workzoon artifact pin|unpin|list`，人必须 `--actor human`。

HTTP：`POST /api/artifacts/pin` · `POST /api/artifacts/unpin` · `GET /api/artifacts`。

## 读时推导

`state`: `present` | `changed` | `missing`（对照现场 inventory）

`onBranch`: `merge-base --is-ancestor sha branch`

`behind`: `rev-list --count sha..branch`

HOLDINGS 产物行：`on <branch> @sha12 · 钉 n 版`。另有 `## 版本`。

`changedFiles` 不含 `.lattice/artifacts/`。

## 不做

不把 `out/` 等 bytes 写进 git。不 canvas。不 Agent 钉。不加第四主视图。
