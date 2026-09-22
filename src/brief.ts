import { formatEscalation } from "./escalation.ts";
import type { Project, Task } from "./types.ts";

export const WORKZOON_BRIEF = "WORKZOON.md";

export function renderWorkzoonBrief(
  project: Project,
  dest: string,
  input: { branch: string; base: string; rendered: string; task?: Task },
): string {
  const { branch, base, rendered, task } = input;
  const frozen = project.charter.layers
    .filter((layer) => layer.frozen)
    .map((layer) => `${layer.name}: ${layer.paths.join(", ")}`)
    .join("; ");
  const forbidden = task
    ? [...new Set([...project.charter.doNotTouch, ...task.forbiddenPaths])]
    : [...project.charter.doNotTouch];
  const marker = `<!-- workzoon-brief v1 · task: ${task?.id || "none"} · rendered: ${rendered} · engine-owned; overwritten on every sync — put notes in the handoff -->`;

  const taskSection = task
    ? `- Task: ${task.title} (\`${task.slug}\`) · id \`${task.id}\` · status ${task.status} · agent ${task.agent}
- Branch: ${branch} (base: ${base})
- Worktree: ${dest}
- Repo: ${project.rootPath}`
    : `- Task: none — human-planted checkout, no Workzoon task bound
- Branch: ${branch} (base: ${base})
- Worktree: ${dest}
- Repo: ${project.rootPath}`;

  const scope = task
    ? `- Allowed: ${task.allowedPaths.join(", ") || "(any non-frozen)"}
- Forbidden: ${forbidden.join(", ") || "(none)"}
- Frozen layers: ${frozen || "(none)"}
- Frozen touch: ${task.allowFrozenTouch ? "YES" : "NO"} — ${formatEscalation(task)}`
    : `- Allowed: (no task — do not start feature work until a task exists in the app)
- Forbidden: ${forbidden.join(", ") || "(none)"}
- Frozen layers: ${frozen || "(none)"}`;

  const handoff = task
    ? `- Authoritative: \`.lattice/handoffs/${task.id}.md\` (copy in this tree; write or update it before you consider the task done)
- If you cannot see untracked files (cloud checkout), read \`.lattice/handoffs/${task.id}.md\` as tracked on branch \`${branch}\` or \`${base}\`; if it is not tracked there, stop and ask the human for the handoff.`
    : `- none. Ask the human which task this branch belongs to; do not create one yourself.`;

  return `# Agent Workzoon
${marker}

This worktree is a scoped checkout governed by Agent Workzoon. Files in this tree are the truth; the app UI is not.

## Task
${taskSection}

## Scope
${scope}

## Handoff
${handoff}

## Read next
1. \`AGENTS.md\`
2. \`.lattice/HOLDINGS.md\` · \`.lattice/POLICY.md\` · \`.lattice/charter.md\`
3. \`.lattice/wiki/index.md\`
4. \`.agents/skills/workzoon-wiki/SKILL.md\`

## Duty
完成前必须维护百科并 lint。Do not add remotes, delete branches, publish artifacts, or invent paths.
`;
}
