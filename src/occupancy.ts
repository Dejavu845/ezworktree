import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { checkBlast } from "./blast.ts";
import { branchExists, changedFiles, changedOnBranch, ENGINE_TASK_COMMIT, listBranches, listLiveWorktrees, runGit } from "./git.ts";
import { isValidHandoff, readHandoff } from "./handoff.ts";
import { plannedBranch } from "./lane.ts";
import { mergePolicy } from "./policy.ts";
import { livePulse } from "./pulse.ts";
import { listPendingRequests } from "./requests.ts";
import type {
  ConsentRequest,
  EvidenceCell,
  HygieneKind,
  LiveWorktree,
  Occupancy,
  Project,
  RepoMap,
  Task,
  WikiLint,
} from "./types.ts";
import { actionLabel } from "./policy.ts";
import { lintWiki } from "./wiki.ts";

const DECISIONS_PLACEHOLDER = ["(fill before marking done)", "还没写决定"];
const NEXT_PLACEHOLDER = ["Continue from the current worktree", "写下一步要做什么"];
const INFLIGHT_EMPTY = new Set(["", "-", "—", "(none)", "(empty)"]);

const HYGIENE_COPY: Record<HygieneKind, string> = {
  merged: "已合入",
  stale: "14 天无动",
  "no-handoff": "缺交接",
};

const CELLS: { id: EvidenceCell["id"]; label: string }[] = [
  { id: "tree", label: "开树" },
  { id: "diff", label: "有改动" },
  { id: "blast", label: "范围未拦" },
  { id: "handoff", label: "交接在" },
  { id: "filled", label: "交接填过" },
  { id: "wiki", label: "百科过门" },
];

export function formatIdle(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return "刚刚";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 分钟`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} 小时`;
  return `${Math.floor(ms / 86_400_000)} 天`;
}

export function aheadBehind(root: string, branch: string, base: string): { ahead: number; behind: number } {
  if (!branch || !base || branch === base) return { ahead: 0, behind: 0 };
  try {
    const ahead = Number(runGit(root, ["rev-list", "--count", `${base}..${branch}`]) || 0);
    const behind = Number(runGit(root, ["rev-list", "--count", `${branch}..${base}`]) || 0);
    return { ahead, behind };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

export function sectionBody(markdown: string, heading: string): string {
  const match = markdown.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |\\Z)`, "m"));
  return (match?.[1] || "").trim();
}

export function handoffFilled(body: string): boolean {
  const decisions = sectionBody(body, "Decisions");
  const next = sectionBody(body, "Next action");
  if (!decisions || !next) return false;
  if (DECISIONS_PLACEHOLDER.some((item) => decisions.includes(item))) return false;
  if (NEXT_PLACEHOLDER.some((item) => next.includes(item))) return false;
  return Boolean(decisions.replace(/[-*\s]/g, "")) && Boolean(next.replace(/[-*\s]/g, ""));
}

function statusCopy(task: Task, planted: boolean): string {
  if (task.status === "backlog") return planted ? "待办" : "待办，尚未开树";
  if (task.status === "active" && !planted) return "已建卡，未开树";
  if (task.status === "review") return "待复审";
  if (task.status === "done") return "已完成";
  if (task.status === "blocked") return "已阻塞";
  return "";
}

export function firstInFlight(body: string | null): string {
  if (!body) return "";
  const section = sectionBody(body, "In flight");
  for (const line of section.split("\n")) {
    const text = line.replace(/^[-*]\s*/, "").trim();
    if (text && !INFLIGHT_EMPTY.has(text.toLowerCase())) return text;
  }
  return "";
}

function deriveDoing(input: {
  statusCopy: string;
  dirty: string[];
  subject: string;
  pending: string;
  hygiene: HygieneKind[];
}): string {
  if (input.statusCopy) return input.statusCopy;
  if (input.dirty.length) return input.dirty.slice(0, 3).join(" · ");
  if (input.subject) return input.subject;
  if (input.pending) return `待批准：${input.pending}`;
  if (input.hygiene.length) return input.hygiene.map((kind) => HYGIENE_COPY[kind]).join(" · ");
  return "进行中";
}

function taskPending(task: Task, pending: ConsentRequest[]): ConsentRequest | undefined {
  return pending.find((item) => String(item.params.taskId || "") === task.id);
}

function managedTree(project: Project, task: Task) {
  return (
    project.worktrees.find((item) => item.id === task.worktreeId && item.status === "active") ||
    project.worktrees.find((item) => item.taskId === task.id && item.status === "active") ||
    project.worktrees.find((item) => item.id === task.worktreeId)
  );
}

function liveCheckoutPath(
  project: Project,
  branch: string,
  ctx: { map?: RepoMap; live?: LiveWorktree[] },
): string {
  const trees = ctx.live || ctx.map?.worktrees;
  const listed = trees || (() => {
    try {
      return listLiveWorktrees(project.rootPath);
    } catch {
      return [];
    }
  })();
  const live = listed.find((item) => item.branch === branch && !item.isPrimary);
  if (live?.path && existsSync(live.path)) return live.path;
  const lane = ctx.map?.lanes.find((item) => item.branch === branch);
  if (lane?.worktreePath && lane.worktreePath !== project.rootPath && existsSync(lane.worktreePath)) {
    return lane.worktreePath;
  }
  return "";
}

function headSubject(project: Project, branch: string, refs?: { name: string; subject: string }[]): string {
  const list = refs || listBranches(project.rootPath);
  const listed = list.find((item) => item.name === branch)?.subject || "";
  if (!listed.startsWith(ENGINE_TASK_COMMIT)) return listed;
  try {
    const log = runGit(project.rootPath, ["log", "-20", "--format=%s", branch]);
    for (const line of log.split("\n")) {
      const subject = line.trim();
      if (subject && !subject.startsWith(ENGINE_TASK_COMMIT)) return subject;
    }
  } catch {
    // keep listed engine subject
  }
  return listed;
}

function hasHandoffRaw(project: Project, taskId: string): boolean {
  const dir = join(project.rootPath, ".lattice", "raw", "handoffs", taskId);
  if (!existsSync(dir)) return false;
  return readdirSync(dir).some((name) => name.endsWith(".md"));
}

export function occupancyForTask(
  project: Project,
  task: Task,
  ctx: {
    map?: RepoMap;
    lint?: WikiLint;
    pending?: ConsentRequest[];
    now?: number;
    refs?: { name: string; subject: string }[];
    live?: LiveWorktree[];
  } = {},
): Occupancy {
  const now = ctx.now ?? Date.now();
  const lint = ctx.lint || lintWiki(project);
  const pending = ctx.pending || listPendingRequests(project);
  const tree = managedTree(project, task);
  const branch = tree?.branch || plannedBranch(task);
  const base = tree?.baseBranch || task.baseBranch || project.baseBranch;
  const managedPath = tree && tree.status === "active" && existsSync(tree.path) ? tree.path : "";
  const checkout = managedPath || liveCheckoutPath(project, branch, ctx);
  const planted = Boolean(checkout);
  const branchOk = branchExists(project.rootPath, branch);
  const lane = ctx.map?.lanes.find((item) => item.taskId === task.id);
  const files = checkout
    ? changedFiles(checkout, base)
    : branchOk
      ? changedOnBranch(project.rootPath, base, branch)
      : [];
  const blast = files.length ? checkBlast(project, task, files) : null;
  const body = readHandoff(project, task.id);
  const hasHandoff = Boolean(body && isValidHandoff(body));
  const filled = hasHandoff && body ? handoffFilled(body) : false;
  const gate = mergePolicy(project.policy).wiki.gate;
  const wikiSkip = gate === "off";
  const uncompiled = lint.issues.filter(
    (item) => item.kind === "raw-uncompiled" && item.path.includes(`/handoffs/${task.id}/`),
  );
  const forbidden = lint.issues.filter((item) => item.kind === "write-forbidden");
  const wikiLit = !wikiSkip && hasHandoffRaw(project, task.id) && uncompiled.length === 0;
  const request = taskPending(task, pending);
  const evidence: EvidenceCell[] = CELLS.map((cell) => {
    if (cell.id === "tree") return { ...cell, lit: planted && branchOk };
    if (cell.id === "diff") return { ...cell, lit: files.length > 0 };
    if (cell.id === "blast") return { ...cell, lit: Boolean(files.length && blast && blast.verdict !== "blocked") };
    if (cell.id === "handoff") return { ...cell, lit: hasHandoff };
    if (cell.id === "filled") return { ...cell, lit: filled };
    return { ...cell, lit: wikiLit, skipped: wikiSkip || undefined };
  });
  const counted = evidence.filter((cell) => !cell.skipped);
  const { ahead, behind } = planted || branchOk ? aheadBehind(project.rootPath, branch, base) : { ahead: 0, behind: 0 };
  const headAt = lane?.updatedAt ? Date.parse(lane.updatedAt) : NaN;
  const taskAt = Date.parse(task.updatedAt);
  const pulse = livePulse(project, task, { now, files });
  const pulseAt = pulse ? Date.parse(pulse.writtenAt) : NaN;
  const newest = Math.max(
    Number.isFinite(headAt) ? headAt : 0,
    Number.isFinite(taskAt) ? taskAt : 0,
    Number.isFinite(pulseAt) ? pulseAt : 0,
  );
  const dirtyPreview = files.filter((file) => !file.startsWith(".lattice/"));
  const derived = deriveDoing({
    statusCopy: statusCopy(task, planted),
    dirty: dirtyPreview,
    subject: headSubject(project, branch, ctx.refs),
    pending: request ? actionLabel(request.action) : "",
    hygiene: lane?.hygiene || [],
  });
  const inflight = firstInFlight(body);
  const doing = pulse?.doing || inflight || derived;
  const doingFrom = pulse ? "pulse" : inflight ? "inflight" : "derived";
  return {
    taskId: task.id,
    agent: pulse?.agent || task.agent,
    branch,
    sha12: (lane?.sha || "").slice(0, 12),
    ahead,
    behind,
    files: files.length,
    blast: blast?.verdict || "none",
    doing,
    doingFrom,
    ...(pulse
      ? { pulse: { remainMin: pulse.remainMin, cite: pulse.cite, writtenAt: pulse.writtenAt } }
      : {}),
    evidence,
    lit: counted.filter((cell) => cell.lit).length,
    denom: counted.length,
    idleMs: newest ? Math.max(0, now - newest) : 0,
    pending: Boolean(request),
    hygiene: lane?.hygiene || [],
    frozen: Boolean(task.allowFrozenTouch),
    wikiBlocked: gate === "block" && hasHandoff && (uncompiled.length > 0 || Boolean(forbidden.length)),
  };
}

export function onDutySatellites(rows: Occupancy[], cap = 5): Occupancy[] {
  return rows
    .filter((row) => row.doingFrom === "pulse" && row.pulse)
    .sort((a, b) => (b.pulse?.writtenAt || "").localeCompare(a.pulse?.writtenAt || ""))
    .slice(0, cap);
}

export function occupancyForProject(
  project: Project,
  ctx: { map?: RepoMap; now?: number } = {},
): Occupancy[] {
  const lint = lintWiki(project);
  const pending = listPendingRequests(project);
  const refs = listBranches(project.rootPath);
  const live = ctx.map?.worktrees || (() => {
    try {
      return listLiveWorktrees(project.rootPath);
    } catch {
      return [];
    }
  })();
  return project.tasks.map((task) => occupancyForTask(project, task, { ...ctx, lint, pending, refs, live }));
}
