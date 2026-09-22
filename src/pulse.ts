import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { changedFiles, changedOnBranch, isMerged, runGit } from "./git.ts";
import { nowIso } from "./ids.ts";
import { plannedBranch } from "./lane.ts";
import type { Caller, Project, Pulse, PulseCite, Task } from "./types.ts";

export const PULSE_TTL_MS = 30 * 60 * 1000;
export const PULSE_DOING_MAX = 80;
const TOP_KEYS = new Set(["v", "taskId", "agent", "doing", "remainMin", "cite", "writtenAt"]);
const CITE_KEYS = new Set(["kind", "value"]);

export function pulseDir(project: Project): string {
  return join(project.rootPath, ".lattice", "pulses");
}

export function pulsePath(project: Project, taskId: string): string {
  return join(pulseDir(project), `${taskId}.json`);
}

export function blastFileSet(project: Project, task: Task): string[] {
  const tree = project.worktrees.find((item) => item.id === task.worktreeId);
  const branch = tree?.branch || plannedBranch(task);
  const base = tree?.baseBranch || task.baseBranch || project.baseBranch;
  if (tree && tree.status === "active" && existsSync(tree.path)) {
    return changedFiles(tree.path, base);
  }
  if (branch) return changedOnBranch(project.rootPath, base, branch);
  return [];
}

export function headRef(project: Project, task: Task): { cwd: string; ref: string } {
  const tree = project.worktrees.find((item) => item.id === task.worktreeId);
  if (tree && tree.status === "active" && existsSync(tree.path)) {
    return { cwd: tree.path, ref: "HEAD" };
  }
  return { cwd: project.rootPath, ref: tree?.branch || plannedBranch(task) };
}

function citeRoots(project: Project, task: Task): string[] {
  const tree = project.worktrees.find((item) => item.id === task.worktreeId && item.status === "active");
  return [tree?.path, project.rootPath].filter((item): item is string => Boolean(item));
}

export function normalizeCite(project: Project, task: Task, cite: PulseCite, files?: string[]): PulseCite {
  const kind = cite.kind === "sha" ? "sha" : "path";
  let value = String(cite.value || "").trim();
  if (kind === "sha") {
    value = value.replace(/^@/, "");
    return { kind, value };
  }
  const set = files || blastFileSet(project, task);
  if (set.includes(value)) return { kind, value };
  if (value.startsWith("/")) {
    for (const root of citeRoots(project, task)) {
      const prefix = root.endsWith("/") ? root : `${root}/`;
      if (value.startsWith(prefix)) {
        const rel = value.slice(prefix.length);
        if (set.includes(rel)) return { kind, value: rel };
      }
      try {
        const rel = relative(resolve(root), resolve(value));
        if (rel && !rel.startsWith("..") && set.includes(rel)) return { kind, value: rel };
      } catch {
        // keep trying other roots
      }
    }
  }
  const hit = set.find((file) => value === file || value.endsWith(`/${file}`));
  return { kind, value: hit || value };
}

export type DoingRejectKind = "empty" | "long" | "percent" | "remain";

export function doingRejectReason(kind: DoingRejectKind): string {
  if (kind === "empty") return "还没写正在做。写你在干什么，不要进度。";
  if (kind === "long") return `正在做太长了。压到 ${PULSE_DOING_MAX} 个字以内。`;
  if (kind === "percent") return "正在做里不能写 %。写你在干什么，不要进度。";
  return "剩下的分钟请填大于 0 的整数。";
}

export function citeRejectReason(cite: PulseCite): string {
  if (!cite.value.trim()) {
    return cite.kind === "sha"
      ? "还没标是哪一版。点对照里的版本号，或点源码文件。"
      : "还没标到哪。点对照里的源码文件，或改用版本号。";
  }
  if (cite.kind === "path") {
    return "这条路径不在这次改动里。点对照里的源码文件，或改用版本号。";
  }
  return "这个版本对不上现在的工作。点对照里的版本号，或用当前这一版。";
}

export function citeValid(project: Project, task: Task, cite: PulseCite, files?: string[]): boolean {
  const normalized = normalizeCite(project, task, cite, files);
  if (!normalized.value || (normalized.kind !== "path" && normalized.kind !== "sha")) return false;
  if (normalized.kind === "path") {
    const set = files || blastFileSet(project, task);
    return set.includes(normalized.value);
  }
  const { cwd, ref } = headRef(project, task);
  try {
    if (runGit(cwd, ["rev-parse", "--verify", `${normalized.value}^{commit}`]) === runGit(cwd, ["rev-parse", ref])) {
      return true;
    }
  } catch {
    return false;
  }
  return isMerged(cwd, normalized.value, ref);
}

export type PulseShapeKind =
  | "not-object"
  | "extra"
  | "version"
  | "task"
  | "agent"
  | "cite-shape"
  | "cite-extra"
  | "cite-value";

export function pulseShapeRejectReason(kind: PulseShapeKind): string {
  if (kind === "not-object") return "心跳记法不对。请用对照里的登记。";
  if (kind === "extra") return "心跳多写了不该有的项。";
  if (kind === "version") return "心跳只能是这一版记法。";
  if (kind === "task") return "还没写心跳要挂哪张卡。";
  if (kind === "agent") return "还没写心跳是谁登记的。";
  if (kind === "cite-shape") return "还没标心跳对着哪。";
  if (kind === "cite-extra") return "心跳标注多写了不该有的项。";
  return "心跳标注只能是文件或版本，而且要有内容。";
}

function assertCiteShape(cite: unknown): PulseCite {
  if (!cite || typeof cite !== "object" || Array.isArray(cite)) {
    throw new Error(pulseShapeRejectReason("cite-shape"));
  }
  const extra = Object.keys(cite as object).filter((key) => !CITE_KEYS.has(key));
  if (extra.length) throw new Error(pulseShapeRejectReason("cite-extra"));
  const kind = (cite as PulseCite).kind;
  const value = String((cite as PulseCite).value || "").trim();
  if ((kind !== "path" && kind !== "sha") || !value) {
    throw new Error(pulseShapeRejectReason("cite-value"));
  }
  return { kind, value };
}

export function parsePulse(raw: unknown): Pulse {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(pulseShapeRejectReason("not-object"));
  }
  const rec = raw as Record<string, unknown>;
  const extra = Object.keys(rec).filter((key) => !TOP_KEYS.has(key));
  if (extra.length) throw new Error(pulseShapeRejectReason("extra"));
  if (rec.v !== 1 && rec.v !== undefined) throw new Error(pulseShapeRejectReason("version"));
  const taskId = String(rec.taskId || "").trim();
  const agent = String(rec.agent || "").trim();
  const doing = String(rec.doing || "").trim();
  if (!taskId) throw new Error(pulseShapeRejectReason("task"));
  if (!agent) throw new Error(pulseShapeRejectReason("agent"));
  if (!doing) throw new Error(doingRejectReason("empty"));
  if ([...doing].length > PULSE_DOING_MAX) throw new Error(doingRejectReason("long"));
  if (/%/.test(doing)) throw new Error(doingRejectReason("percent"));
  let remainMin: number | undefined;
  if (rec.remainMin !== undefined && rec.remainMin !== null && rec.remainMin !== "") {
    const n = Number(rec.remainMin);
    if (!Number.isInteger(n) || n < 1) throw new Error(doingRejectReason("remain"));
    remainMin = n;
  }
  return {
    v: 1,
    taskId,
    agent,
    doing,
    ...(remainMin ? { remainMin } : {}),
    cite: assertCiteShape(rec.cite),
    writtenAt: typeof rec.writtenAt === "string" ? rec.writtenAt : nowIso(),
  };
}

export function readPulse(project: Project, taskId: string): Pulse | null {
  const path = pulsePath(project, taskId);
  if (!existsSync(path)) return null;
  try {
    return parsePulse(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return null;
  }
}

export function writePulseRecord(project: Project, pulse: Pulse): void {
  const path = pulsePath(project, pulse.taskId);
  mkdirSync(dirname(path), { recursive: true });
  const body: Pulse = {
    v: 1,
    taskId: pulse.taskId,
    agent: pulse.agent,
    doing: pulse.doing,
    ...(pulse.remainMin ? { remainMin: pulse.remainMin } : {}),
    cite: pulse.cite,
    writtenAt: pulse.writtenAt,
  };
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
}

export function clearPulseRecord(project: Project, taskId: string): void {
  const path = pulsePath(project, taskId);
  if (existsSync(path)) rmSync(path);
  const tree = project.worktrees.find((item) => item.taskId === taskId && item.status === "active");
  if (tree?.path) {
    const copy = join(tree.path, ".lattice", "pulses", `${taskId}.json`);
    if (existsSync(copy)) rmSync(copy);
  }
}

export function livePulse(
  project: Project,
  task: Task,
  ctx: { now?: number; files?: string[] } = {},
): Pulse | null {
  if (task.status !== "active" && task.status !== "review") return null;
  const pulse = readPulse(project, task.id);
  if (!pulse) return null;
  const at = Date.parse(pulse.writtenAt);
  const now = ctx.now ?? Date.now();
  if (!Number.isFinite(at) || now - at > PULSE_TTL_MS) return null;
  if (!citeValid(project, task, pulse.cite, ctx.files)) return null;
  return pulse;
}

export function pulseWriteRejectReason(): string {
  return "这张卡不是你的。换分配给你的卡，或用人来登记。";
}

export function authorizePulseWrite(task: Task, caller: Caller): string {
  if (caller.actor === "human") return caller.agent || task.agent;
  const agent = caller.agent || "cursor";
  if (agent !== task.agent) {
    throw new Error(pulseWriteRejectReason());
  }
  return agent;
}

export function pulseClearRejectReason(): string {
  return "只有人能清心跳。";
}

export function authorizePulseClear(caller: Caller): void {
  if (caller.actor !== "human") {
    throw new Error(pulseClearRejectReason());
  }
}
