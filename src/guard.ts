import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkBlast } from "./blast.ts";
import { currentBranch, gitCommonDir, gitToplevel, stagedFiles } from "./git.ts";
import { plannedBranch, taskMissingRejectReason } from "./lane.ts";
import { appendLedger } from "./ledger.ts";
import { loadProject } from "./store.ts";
import type { BlastFinding, BlastVerdict, Project, Task } from "./types.ts";

export const GUARD_HOOK_MARK = "# workzoon-guard";

export class GuardError extends Error {
  result: GuardResult;
  constructor(message: string, result: GuardResult) {
    super(message);
    this.name = "GuardError";
    this.result = result;
  }
}

export type GuardResult = {
  ok: boolean;
  overridden: boolean;
  verdict: BlastVerdict;
  files: string[];
  findings: BlastFinding[];
  taskId?: string;
  checkout: string;
  rootPath: string;
};

function samePath(a: string, b: string): boolean {
  try {
    if (existsSync(a) && existsSync(b)) return realpathSync(a) === realpathSync(b);
  } catch {
    // compare raw
  }
  return a.replace(/\/$/, "") === b.replace(/\/$/, "");
}

function charterTask(project: Project): Task {
  return {
    id: "charter",
    slug: "charter",
    title: "charter",
    status: "active",
    intent: "feat",
    baseBranch: project.baseBranch,
    agent: "guard",
    allowedPaths: [],
    forbiddenPaths: [],
    layerIds: [],
    allowFrozenTouch: false,
    notes: "",
    createdAt: "",
    updatedAt: "",
  };
}

export function checkoutRejectReason(rootPath: string): string {
  return `「${rootPath}」还没有工区。先点左下登记仓。`;
}

export function guardRejectReason(path = "commit", reason = "forbidden"): string {
  return `守卫拦住了「${path}」。${guardReasonLabel(reason)}`;
}

function guardReasonLabel(reason: string): string {
  if (reason.startsWith("forbidden")) return "这是禁区，不要碰。";
  if (reason.startsWith("frozen layer")) return "这是冻结层。";
  if (reason === "outside allowed paths") return "不在允许路径里。";
  if (reason.includes("i18n")) return "中英日文案要一起改。";
  return "先看这张卡能碰的范围。";
}

export function resolveGovernedRoot(cwd: string): { checkout: string; rootPath: string } {
  const checkout = gitToplevel(cwd);
  const common = gitCommonDir(cwd);
  const main = common.replace(/\/\.git$/, "") || dirname(common);
  if (existsSync(join(main, ".lattice", "project.json"))) return { checkout, rootPath: main };
  if (existsSync(join(checkout, ".lattice", "project.json"))) return { checkout, rootPath: checkout };
  throw new Error(checkoutRejectReason(checkout));
}

export function taskForCheckout(project: Project, checkout: string, taskId?: string): Task {
  if (taskId && taskId !== "charter") {
    const named = project.tasks.find((item) => item.id === taskId);
    if (!named) throw new Error(taskMissingRejectReason(taskId));
    return named;
  }
  const tree = project.worktrees.find((item) => item.path && samePath(item.path, checkout));
  if (tree) {
    const task = project.tasks.find((item) => item.id === tree.taskId);
    if (task) return task;
  }
  let branch = "";
  try {
    branch = currentBranch(checkout);
  } catch {
    branch = "";
  }
  const byBranch = project.tasks.find((item) => {
    const live = project.worktrees.find((entry) => entry.id === item.worktreeId);
    return live?.branch === branch || plannedBranch(item) === branch;
  });
  return byBranch || charterTask(project);
}

export function hookPath(cwd: string): string {
  const common = gitCommonDir(cwd);
  return join(common, "hooks", "pre-commit");
}

export function renderGuardHook(): string {
  const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
  return `#!/bin/sh
${GUARD_HOOK_MARK}
set -e
ROOT=$(git rev-parse --show-toplevel)
if [ -n "$WORKZOON_BIN" ]; then
  exec "$WORKZOON_BIN" guard --staged --root "$ROOT"
fi
exec node --experimental-strip-types "${cli}" guard --staged --root "$ROOT"
`;
}

export function installGuardHook(rootPath: string): string {
  const dest = hookPath(rootPath);
  mkdirSync(dirname(dest), { recursive: true });
  const prev = existsSync(dest) ? readFileSync(dest, "utf8") : "";
  if (prev && !prev.includes("workzoon-guard")) return dest;
  writeFileSync(dest, renderGuardHook());
  chmodSync(dest, 0o755);
  return dest;
}

export function guardStaged(
  cwd: string,
  input: { taskId?: string; override?: boolean } = {},
): GuardResult {
  const { checkout, rootPath } = resolveGovernedRoot(cwd);
  const project = loadProject(rootPath);
  if (!project) throw new Error(checkoutRejectReason(rootPath));
  const task = taskForCheckout(project, checkout, input.taskId);
  const files = stagedFiles(checkout);
  const blast = checkBlast(project, task, files);
  const override = input.override === true || process.env.LATTICE_OVERRIDE === "1";
  const blocked = blast.verdict === "blocked";
  const result: GuardResult = {
    ok: !blocked || override,
    overridden: blocked && override,
    verdict: blast.verdict,
    files,
    findings: blast.findings,
    ...(task.id !== "charter" ? { taskId: task.id } : {}),
    checkout,
    rootPath,
  };
  if (blocked && override) {
    appendLedger(project, {
      actor: "agent",
      agent: "guard",
      action: "guard.override",
      target: files.join(",") || "(empty)",
      outcome: "override",
    });
    return result;
  }
  if (blocked) {
    const first = blast.findings.find((item) => item.verdict === "blocked");
    throw new GuardError(guardRejectReason(first?.path || "commit", first?.reason || "forbidden"), result);
  }
  return result;
}
