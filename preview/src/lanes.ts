import type { Project, RepoLane, Task, Worktree } from "./api";

export function formatIdle(ms: number): string {
  if (!Number.isFinite(ms) || ms < 60_000) return "刚刚";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 分钟`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} 小时`;
  return `${Math.floor(ms / 86_400_000)} 天`;
}

export function plannedBranch(task: Pick<Task, "slug" | "intent">): string {
  const intent = task.intent === "spike" || task.intent === "hotfix" ? task.intent : "feat";
  return `${intent}/${task.slug}`;
}

export function laneOf(project: Project, task: Task): { branch: string; path: string; tree?: Worktree } {
  const tree = project.worktrees.find((item) => item.id === task.worktreeId);
  const live = tree?.status === "active" ? tree.path : "";
  return {
    branch: tree?.branch || plannedBranch(task),
    path: live || "",
    tree,
  };
}

export function isDeckBay(lane: { worktreePath?: string }, rootPath: string): boolean {
  const path = lane.worktreePath || "";
  return Boolean(path && path !== rootPath);
}

export function bayPath(path: string | undefined, rootPath: string): string {
  return isDeckBay({ worktreePath: path }, rootPath) ? path || "" : "";
}

export function liveBayCount(lanes: { worktreePath?: string }[], rootPath: string): number {
  return lanes.filter((lane) => isDeckBay(lane, rootPath)).length;
}

export function shorten(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (!path.startsWith("/")) {
    if (parts.length <= 3) return path;
    return `…/${parts.slice(-2).join("/")}`;
  }
  if (parts.length <= 1) return path;
  if (parts.length === 2) return `…/${parts[1]}`;
  return `…/${parts.slice(-2).join("/")}`;
}

export function resolveSelection<L extends { id: string; taskId?: string }, T extends { id: string }>(input: {
  view: "holdings" | "forest" | "lanes";
  lanes: L[];
  tasks: T[];
  laneId: string | null;
  taskId: string | null;
}): { lane: L | null; task: T | null } {
  const { view, lanes, tasks, laneId, taskId } = input;
  if (view === "lanes") {
    const task = tasks.find((item) => item.id === taskId) || null;
    const lane =
      (task ? lanes.find((item) => item.taskId === task.id) : undefined) ||
      lanes.find((item) => item.id === laneId) ||
      null;
    return { lane, task };
  }
  const lane = lanes.find((item) => item.id === laneId) || lanes[0] || null;
  const task = lane?.taskId ? tasks.find((item) => item.id === lane.taskId) || null : null;
  return { lane, task };
}

export function groupLanes(lanes: RepoLane[], baseBranch: string): { prefix: string; lanes: RepoLane[] }[] {
  const buckets = new Map<string, RepoLane[]>();
  for (const lane of lanes) {
    const prefix = lane.branch.split("/")[0] || lane.branch;
    const list = buckets.get(prefix);
    if (list) list.push(lane);
    else buckets.set(prefix, [lane]);
  }
  const basePrefix = baseBranch.split("/")[0] || baseBranch;
  const prefixes = [...buckets.keys()].sort((a, b) => {
    if (a === basePrefix && b !== basePrefix) return -1;
    if (b === basePrefix && a !== basePrefix) return 1;
    return a.localeCompare(b);
  });
  return prefixes.map((prefix) => {
    const list = (buckets.get(prefix) || []).slice().sort((a, b) => {
      if (a.branch === baseBranch) return -1;
      if (b.branch === baseBranch) return 1;
      return a.branch.localeCompare(b.branch);
    });
    return { prefix, lanes: list };
  });
}
