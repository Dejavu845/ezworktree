import { plannedBranch } from "./lane.ts";
import type { Caller, Project, RepoLane } from "./types.ts";

export type TopologyRejectAction = "plantBranch" | "deleteBranch";

export function topologyRejectReason(action: TopologyRejectAction, branch: string): string {
  if (action === "plantBranch") return `「${branch}」不在清单里。请你来创建 worktree，不要让助手自己开。`;
  return `「${branch}」不在清单里。请你来删，不要让助手自己删。`;
}

export class TopologyError extends Error {
  code: "undeclared";
  action: TopologyRejectAction;
  branch: string;
  constructor(action: TopologyRejectAction, branch: string) {
    super(topologyRejectReason(action, branch));
    this.name = "TopologyError";
    this.code = "undeclared";
    this.action = action;
    this.branch = branch;
  }
}

export function declaredBranches(project: Project): Set<string> {
  const names = new Set<string>([project.baseBranch]);
  for (const task of project.tasks) names.add(plannedBranch(task));
  for (const tree of project.worktrees) {
    if (tree.branch) names.add(tree.branch);
  }
  return names;
}

export function isDeclaredBranch(project: Project, branch: string): boolean {
  const name = branch.trim();
  if (!name || name === "(detached)") return false;
  return declaredBranches(project).has(name);
}

export function laneUndeclared(lane: RepoLane, project: Project): boolean {
  if (lane.isRemote || lane.branch === "(detached)" || !lane.branch) return false;
  if (lane.managed) return false;
  return !isDeclaredBranch(project, lane.branch);
}

export function assertAgentDeclared(
  project: Project,
  action: "plantBranch" | "deleteBranch",
  caller: Caller,
  branch: string,
): void {
  if (caller.actor !== "agent") return;
  const name = branch.trim();
  if (!name) return;
  if (isDeclaredBranch(project, name)) return;
  throw new TopologyError(action, name);
}
