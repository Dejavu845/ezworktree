import { existsSync, readFileSync } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { normalizeCharterVersion } from "./charter.ts";
import { formatEscalation } from "./escalation.ts";
import { branchExists, featureHead, runGit } from "./git.ts";
import { plannedBranch } from "./lane.ts";
import type { BlastReport, Handoff, Project, Task } from "./types.ts";
import { nowIso, uuid } from "./ids.ts";

export const HANDOFF_MARKER = "<!-- agent-handoff v1";
export const HANDOFF_SECTIONS = ["Decisions", "Live state", "In flight", "Landmines", "Next action", "Lattice"] as const;
export const HANDOFF_META_KEYS = ["v", "task", "branch", "head", "from", "to", "updated"] as const;

export type HandoffMeta = {
  v: 1;
  task: string;
  branch: string;
  head: string;
  from?: string;
  to?: string;
  updated?: string;
};

const META_KEYS = new Set<string>(HANDOFF_META_KEYS);

export function normalizeHandoffHead(value: string): string {
  const sha = value.trim().toLowerCase();
  return !sha || sha === "none" ? "" : sha;
}

export function shaAligned(claimed: string, live: string): boolean {
  const a = normalizeHandoffHead(claimed);
  const b = normalizeHandoffHead(live);
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length < 7 || b.length < 7) return false;
  return b.startsWith(a) || a.startsWith(b);
}

export function parseHandoffMeta(markdown: string): HandoffMeta | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) return null;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!META_KEYS.has(key)) return null;
    fields[key] = value;
  }
  if (fields.v !== "1" || !fields.task || !fields.branch || !("head" in fields)) return null;
  return {
    v: 1,
    task: fields.task,
    branch: fields.branch,
    head: fields.head,
    ...(fields.from ? { from: fields.from } : {}),
    ...(fields.to ? { to: fields.to } : {}),
    ...(fields.updated ? { updated: fields.updated } : {}),
  };
}

export function hasHandoffSections(markdown: string): boolean {
  return HANDOFF_SECTIONS.every((heading) => new RegExp(`^## ${heading}\\s*$`, "m").test(markdown));
}

export function isValidHandoff(markdown: string): boolean {
  return Boolean(parseHandoffMeta(markdown)) && markdown.includes(HANDOFF_MARKER) && hasHandoffSections(markdown);
}

export function handoffRejectReason(): string {
  return "这份交接还不完整。缺开头、标记或那六段。";
}

export function liveHandoffRef(project: Project, task: Task): { branch: string; head: string } {
  const tree = project.worktrees.find((item) => item.id === task.worktreeId);
  const planned = plannedBranch(task);
  if (tree?.path && existsSync(tree.path)) {
    try {
      return { branch: tree.branch, head: featureHead(tree.path) || runGit(tree.path, ["rev-parse", "HEAD"]) };
    } catch {
      return { branch: tree.branch, head: "" };
    }
  }
  if (branchExists(project.rootPath, planned)) {
    try {
      return {
        branch: planned,
        head: featureHead(project.rootPath, planned) || runGit(project.rootPath, ["rev-parse", planned]),
      };
    } catch {
      return { branch: planned, head: "" };
    }
  }
  return { branch: planned, head: "" };
}

export function isAlignedHandoff(project: Project, task: Task, markdown: string): boolean {
  const meta = parseHandoffMeta(markdown);
  if (!meta || !isValidHandoff(markdown)) return false;
  if (meta.task !== task.id) return false;
  const live = liveHandoffRef(project, task);
  if (meta.branch !== live.branch) return false;
  return shaAligned(meta.head, live.head);
}

export function handoffPath(project: Project, taskId: string): string {
  return join(project.rootPath, ".lattice", "handoffs", `${taskId}.md`);
}

export function renderHandoff(input: {
  project: Project;
  task: Task;
  fromAgent: string;
  toAgent: string;
  worktreePath?: string;
  branch?: string;
  head?: string;
  blast?: BlastReport;
  files?: string[];
  decisions?: string;
  liveState?: string;
  inFlight?: string;
  landmines?: string;
  nextAction?: string;
}): string {
  const updated = nowIso();
  const files = (input.files || input.blast?.files || []).map((file) => `- \`${file}\``).join("\n");
  const blast = input.blast?.verdict || "n/a";
  const branch = input.branch || plannedBranch(input.task);
  const head = normalizeHandoffHead(input.head || "") || "none";
  return `---
v: 1
task: ${input.task.id}
branch: ${branch}
head: ${head}
from: ${input.fromAgent}
to: ${input.toAgent}
updated: ${updated}
---
# HANDOFF
${HANDOFF_MARKER} · updated: ${updated} · by: ${input.fromAgent} · task: ${input.task.id} -->

## Decisions
${input.decisions?.trim() || "- 还没写决定"}

## Live state
${input.liveState?.trim() || (files ? files : "- 还没有记下文件改动。")}

## In flight
${input.inFlight?.trim() || "-"}

## Landmines
${input.landmines?.trim() || "-"}

## Next action
${input.nextAction?.trim() || "- 写下一步要做什么。"}

## Lattice
- Task: ${input.task.title} (\`${input.task.slug}\`)
- Worktree: ${input.worktreePath || "—"}
- Branch: ${branch}
- Head: ${head === "none" ? "—" : head.slice(0, 12)}
- Blast: ${blast}
- Charter: v${normalizeCharterVersion(input.project.charter?.version)}
- Allowed: ${input.task.allowedPaths.join(", ") || "(any non-frozen)"}
- Forbidden: ${[...input.project.charter.doNotTouch, ...input.task.forbiddenPaths].join(", ") || "(none)"}
- Frozen touch: ${input.task.allowFrozenTouch ? "yes" : "no"}
- Escalation: ${formatEscalation(input.task)}
`;
}

export function writeHandoff(project: Project, markdown: string, task: Task, fromAgent: string, toAgent: string): Handoff {
  if (!isValidHandoff(markdown)) {
    throw new Error(handoffRejectReason());
  }
  const path = handoffPath(project, task.id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  writeFileSync(join(project.rootPath, ".lattice", "HANDOFF.md"), markdown.endsWith("\n") ? markdown : `${markdown}\n`);

  const existing = project.handoffs.find((item) => item.taskId === task.id);
  const record: Handoff = existing || {
    id: uuid(),
    taskId: task.id,
    fromAgent,
    toAgent,
    path,
    updatedAt: nowIso(),
  };
  record.fromAgent = fromAgent;
  record.toAgent = toAgent;
  record.path = path;
  record.updatedAt = nowIso();
  if (!existing) project.handoffs.push(record);
  task.handoffId = record.id;
  task.updatedAt = nowIso();
  return record;
}

export function readHandoff(project: Project, taskId: string): string | null {
  const path = handoffPath(project, taskId);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

export function resumePrompt(project: Project, task: Task): string {
  const body = readHandoff(project, task.id) || "还没有交接。";
  const frozen = task.escalation
    ? "冻结层不要碰，除非这张卡写明可以，并且停在那个理由里。"
    : "冻结层不要碰，除非这张卡写明可以。";
  const worktree = project.worktrees.find((item) => item.id === task.worktreeId);
  const branch = worktree?.branch || plannedBranch(task);
  const allowed = task.allowedPaths.join(", ") || "冻结层以外";
  return [
    `接下「${project.name}」里的任务「${task.title}」。`,
    "只在这棵检出里改。先读 .lattice/charter.md。",
    `先读检出根上的 WORKZOON.md。云端如果看不到，就读分支 ${branch} 上的 .lattice/handoffs/${task.id}.md。`,
    `能碰的范围：${allowed}。`,
    frozen,
    "",
    body,
  ].join("\n");
}
