import { existsSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { currentBranch, listBranches, listLiveWorktrees, mergedBranches } from "./git.ts";
import { isValidHandoff, readHandoff } from "./handoff.ts";
import { plannedBranch } from "./lane.ts";
import { laneUndeclared } from "./topology.ts";
import type { HygieneKind, LiveWorktree, Project, RepoLane, RepoMap, SourceEntry } from "./types.ts";

export const STALE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export type HygieneContext = {
  now: number;
  baseBranch: string;
  baseSha: string;
  mergedSet: Set<string>;
  project: Project;
};

export function repoMap(project: Project, now = Date.now()): RepoMap {
  const branches = listBranches(project.rootPath);
  const worktrees = listLiveWorktrees(project.rootPath);
  const current = safeCurrent(project.rootPath) || project.baseBranch;
  const mergedSet = mergedBranches(project.rootPath, project.baseBranch);
  const baseSha = branches.find((item) => item.name === project.baseBranch)?.sha || "";
  const lanes = buildLanes(project, branches, worktrees, current, {
    now,
    baseBranch: project.baseBranch,
    baseSha,
    mergedSet,
    project,
  });
  return {
    rootPath: project.rootPath,
    name: project.name,
    baseBranch: project.baseBranch,
    currentBranch: current,
    branches,
    worktrees,
    lanes,
  };
}

function safeCurrent(root: string): string {
  try {
    return currentBranch(root);
  } catch {
    return "";
  }
}

function buildLanes(
  project: Project,
  branches: RepoMap["branches"],
  worktrees: LiveWorktree[],
  current: string,
  ctx: HygieneContext,
): RepoLane[] {
  const byBranch = new Map<string, LiveWorktree>();
  for (const tree of worktrees) {
    if (tree.branch && tree.branch !== "(detached)") byBranch.set(tree.branch, tree);
  }

  const lanes: RepoLane[] = [];
  const seen = new Set<string>();

  for (const task of project.tasks) {
    const managed = project.worktrees.find((item) => item.id === task.worktreeId);
    const branch = managed?.branch || plannedBranch(task);
    const live = byBranch.get(branch);
    const ref = branches.find((item) => item.name === branch);
    lanes.push(
      withHygiene(
        {
          id: `task:${task.id}`,
          branch,
          sha: ref?.sha || live?.sha || "",
          isHead: branch === current,
          isRemote: false,
          worktreePath: laneCheckoutPath(live, managed, project.rootPath),
          subject: task.title,
          managed: true,
          taskId: task.id,
          taskTitle: task.title,
          taskStatus: task.status,
          baseBranch: (() => {
            const base = managed?.baseBranch || task.baseBranch || project.baseBranch;
            return base !== project.baseBranch ? base : undefined;
          })(),
          updatedAt: ref?.updatedAt || "",
          merged: false,
          hygiene: [],
          undeclared: false,
        },
        ctx,
      ),
    );
    seen.add(branch);
  }

  for (const tree of worktrees) {
    if (tree.branch && seen.has(tree.branch)) continue;
    const ref = branches.find((item) => item.name === tree.branch);
    lanes.push(
      withHygiene(
        {
          id: `tree:${tree.path}`,
          branch: tree.branch || "(detached)",
          sha: tree.sha || ref?.sha || "",
          isHead: tree.isPrimary || tree.branch === current,
          isRemote: false,
          worktreePath: tree.path,
          subject: ref?.subject || (tree.isPrimary ? "primary checkout" : "worktree"),
          managed: false,
          updatedAt: ref?.updatedAt || "",
          merged: false,
          hygiene: [],
          undeclared: false,
        },
        ctx,
      ),
    );
    if (tree.branch) seen.add(tree.branch);
  }

  for (const ref of branches) {
    if (seen.has(ref.name)) continue;
    lanes.push(
      withHygiene(
        {
          id: `ref:${ref.name}`,
          branch: ref.name,
          sha: ref.sha,
          isHead: ref.isHead,
          isRemote: ref.isRemote,
          worktreePath: ref.worktreePath,
          subject: ref.subject,
          managed: false,
          updatedAt: ref.updatedAt || "",
          merged: false,
          hygiene: [],
          undeclared: false,
        },
        ctx,
      ),
    );
  }

  return lanes.sort((a, b) => rank(a) - rank(b) || a.branch.localeCompare(b.branch));
}

function withHygiene(lane: RepoLane, ctx: HygieneContext): RepoLane {
  const { merged, hygiene } = laneHygiene(lane, ctx);
  lane.merged = merged;
  lane.hygiene = hygiene;
  lane.undeclared = laneUndeclared(lane, ctx.project);
  return lane;
}

function parseTime(value: string | undefined): number {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

export function laneHygiene(lane: RepoLane, ctx: HygieneContext): { merged: boolean; hygiene: HygieneKind[] } {
  if (lane.isRemote || lane.branch === ctx.baseBranch || lane.isHead || lane.branch === "(detached)" || !lane.sha) {
    return { merged: false, hygiene: [] };
  }

  const task = lane.taskId ? ctx.project.tasks.find((item) => item.id === lane.taskId) : undefined;
  const tree =
    (task ? ctx.project.worktrees.find((item) => item.id === task.worktreeId) : undefined) ||
    ctx.project.worktrees.find((item) => item.branch === lane.branch);
  const atBaseTip = Boolean(lane.sha && ctx.baseSha && lane.sha === ctx.baseSha);
  const status = task?.status || lane.taskStatus;
  const skipMerged = atBaseTip && lane.managed && (status === "backlog" || status === "active");
  const merged = ctx.mergedSet.has(lane.branch) && !skipMerged;
  const hygiene: HygieneKind[] = [];
  if (merged) hygiene.push("merged");

  const lastActivity = Math.max(parseTime(lane.updatedAt), parseTime(tree?.createdAt), parseTime(task?.updatedAt));
  if (!atBaseTip && ctx.now - lastActivity > STALE_DAYS * DAY_MS) hygiene.push("stale");

  if (lane.managed && (status === "active" || status === "review")) {
    const body = task ? readHandoff(ctx.project, task.id) : null;
    if (!(body && isValidHandoff(body))) hygiene.push("no-handoff");
  }

  return { merged, hygiene };
}

/** Live checkout for a lane. Archived / missing / leftover registry paths stay empty. Primary still keeps the repo root. */
export function laneCheckoutPath(
  live: { path: string } | undefined,
  managed: { path: string; status: string } | undefined,
  rootPath: string,
): string {
  if (live?.path) return live.path;
  if (managed?.status === "active" && managed.path && managed.path !== rootPath && existsSync(managed.path)) {
    return managed.path;
  }
  return "";
}

/** Deck bays are planted checkouts, not the primary repo root and not a leftover archived path. */
export function isDeckBay(lane: { worktreePath?: string }, rootPath: string): boolean {
  return Boolean(lane.worktreePath && lane.worktreePath !== rootPath);
}

export function bayPath(path: string | undefined, rootPath: string): string {
  return isDeckBay({ worktreePath: path }, rootPath) ? path || "" : "";
}

export function liveBayCount(lanes: { worktreePath?: string }[], rootPath: string): number {
  return lanes.filter((lane) => isDeckBay(lane, rootPath)).length;
}

function rank(lane: RepoLane): number {
  if (lane.isHead) return 0;
  if (lane.managed && lane.worktreePath) return 1;
  if (lane.managed) return 2;
  if (lane.worktreePath && !lane.isRemote) return 3;
  if (!lane.isRemote) return 4;
  return 5;
}

export function allowedRoots(project: Project, map?: RepoMap): string[] {
  const live = map || repoMap(project);
  return [...new Set([project.rootPath, ...live.worktrees.map((item) => item.path)].filter(Boolean))];
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== "..");
}

export type SourceRejectKind = "outside" | "file";

export function sourceRejectReason(kind: SourceRejectKind): string {
  if (kind === "outside") return "这条路径不在这张仓里。请打开仓里的目录，或这张卡自己的目录。";
  return "这不是一个文件夹。请点目录，不要点文件。";
}

export function listSource(project: Project, absDir: string): SourceEntry[] {
  const roots = allowedRoots(project);
  const resolved = resolve(absDir);
  if (!roots.some((root) => isInside(root, resolved))) {
    throw new Error(sourceRejectReason("outside"));
  }
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new Error(sourceRejectReason("file"));
  }
  return readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.name !== ".git")
    .slice(0, 80)
    .map((entry) => ({
      name: entry.name,
      path: resolve(resolved, entry.name),
      kind: entry.isDirectory() ? "dir" : "file",
    }))
    .sort((a, b) => Number(b.kind === "dir") - Number(a.kind === "dir") || a.name.localeCompare(b.name));
}
