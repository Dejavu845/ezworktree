import { branchExists } from "./git.ts";
import type { Project, Task, TaskIntent } from "./types.ts";

export const INTENTS: TaskIntent[] = ["feat", "spike", "hotfix"];

export type TaskRejectKind = "intent" | "base-empty" | "base-missing" | "own-base";

export function taskRejectReason(kind: TaskRejectKind, detail: { name?: string } = {}): string {
  if (kind === "intent") return "意图请选功能、试探或热修。";
  if (kind === "base-empty") return "还没写从哪条分支开。";
  if (kind === "base-missing") return `「${detail.name}」这条分支不在。换一条已经在的。`;
  return "任务不能拿自己准备开的分支当起点。换一条已经在的。";
}

export function taskMissingRejectReason(taskId: string): string {
  const id = taskId.trim();
  if (!id) return "还没写要找的任务。";
  return `找不到任务「${id}」。`;
}

export function parseIntent(value?: string): TaskIntent {
  if (!value || value === "feat") return "feat";
  if (value === "spike" || value === "hotfix") return value;
  throw new Error(taskRejectReason("intent"));
}

export function plannedBranch(task: Pick<Task, "slug" | "intent">): string {
  return `${parseIntent(task.intent)}/${task.slug}`;
}

export function resolveTaskBase(project: Project, requested?: string): string {
  const name = (requested || project.baseBranch).trim();
  if (!name) throw new Error(taskRejectReason("base-empty"));
  if (name === project.baseBranch) return name;
  if (!branchExists(project.rootPath, name)) {
    throw new Error(taskRejectReason("base-missing", { name }));
  }
  return name;
}

export function taskBase(project: Project, task: Pick<Task, "baseBranch">): string {
  return task.baseBranch || project.baseBranch;
}
