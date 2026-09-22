import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { WORKZOON_BRIEF, renderWorkzoonBrief } from "./brief.ts";
import { normalizeCharterVersion } from "./charter.ts";
import { beginMarker, BLOCK_RE, driftOf, END } from "./drift.ts";
import { formatEscalation } from "./escalation.ts";
import { installGuardHook } from "./guard.ts";
import { currentBranch, ENGINE_TASK_COMMIT, GitError, runGit } from "./git.ts";
import { nowIso } from "./ids.ts";
import { ACTIONS, mergePolicy, renderPolicyMarkdown } from "./policy.ts";
import { plannedBranch } from "./lane.ts";
import type { Project, Task } from "./types.ts";

function upsertMarked(existing: string, block: string): string {
  const wrapped = `${beginMarker(block)}\n${block}\n${END}`;
  if (existing.match(BLOCK_RE)) {
    return existing.replace(BLOCK_RE, () => wrapped);
  }
  const prefix = existing.trim().length ? `${existing.trimEnd()}\n\n` : "";
  return `${prefix}${wrapped}\n`;
}

function write(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body.endsWith("\n") ? body : `${body}\n`);
}

export function renderCharterMarkdown(project: Project): string {
  const layers = project.charter.layers
    .map(
      (layer) =>
        `- **${layer.name}** \`${layer.id}\` ${layer.frozen ? "FROZEN" : "open"} — ${layer.paths.join(", ")}`,
    )
    .join("\n");
  return `# ${project.name} Charter

Version: ${normalizeCharterVersion(project.charter.version)}

## Purpose
${project.charter.purpose}

## Architecture
${project.charter.architecture}

## Conventions
${project.charter.conventions.map((item) => `- ${item}`).join("\n") || "- (none)"}

## Do not touch
${project.charter.doNotTouch.map((item) => `- \`${item}\``).join("\n") || "- (none)"}

## Layers
${layers || "- (none)"}
`;
}

export function renderAgentsBlock(project: Project, task?: Task): string {
  const frozen = project.charter.layers
    .filter((layer) => layer.frozen)
    .map((layer) => `${layer.name}: ${layer.paths.join(", ")}`)
    .join("; ");
  const policy = mergePolicy(project.policy);
  const allow = ACTIONS.filter((item) => policy.agentMay[item.id] === "allow").map((item) => item.label);
  const ask = ACTIONS.filter((item) => policy.agentMay[item.id] === "ask").map((item) => item.label);
  const never = ACTIONS.filter((item) => policy.agentMay[item.id] === "never").map((item) => item.label);
  const taskLines = task
    ? [
        `Current task: ${task.title} (\`${task.slug}\`)`,
        `Allowed paths: ${task.allowedPaths.join(", ") || "(any non-frozen)"}`,
        `Forbidden: ${[...project.charter.doNotTouch, ...task.forbiddenPaths].join(", ") || "(none)"}`,
        `May touch frozen layers: ${task.allowFrozenTouch ? "YES (explicit)" : "NO"}`,
        `Escalation: ${formatEscalation(task)}`,
        `Read \`.lattice/handoffs/${task.id}.md\` before writing code.`,
      ]
    : [
        "This is the main checkout. Do not start feature work here.",
        "Work in a listed worktree. Read WORKZOON.md at that tree root.",
        "No current task on this checkout.",
      ];

  return `## Agent Workzoon
This project is dual-audience. The human owns the repo, branches, source checkouts, and artifacts.
You work inside a listed worktree and follow the charter. You do not invent paths.
完成前必须维护百科并 lint。

Read first: \`.lattice/HOLDINGS.md\`, \`.lattice/POLICY.md\`, \`.lattice/charter.md\`, \`.lattice/wiki/index.md\`.
Knowledge is a Karpathy LLM wiki: \`.lattice/raw/\` (immutable) and \`.lattice/wiki/\` (compiled).
Preset: **${policy.preset}**
可直接做: ${allow.join("、") || "（无）"}
需确认: ${ask.join("、") || "（无）"}
禁止: ${never.join("、") || "（无）"}
Read \`.lattice/POLICY.md\`.
Frozen layers: ${frozen || "(none)"}.
${taskLines.join("\n")}
Do not add remotes, delete branches, or publish artifacts unless the human asked.
Do not rewrite unrelated files. If you must touch a frozen layer, stop and ask.
Write or update the handoff file before you consider the task done.
Ingest sources into \`.lattice/raw/\` only. Compile into \`.lattice/wiki/\`. Never edit raw after write.
Schema: \`.agents/skills/workzoon-wiki/SKILL.md\`.
`;
}

export function renderCursorRule(project: Project): string {
  const globs = [
    ...project.charter.doNotTouch,
    ...project.charter.layers.filter((layer) => layer.frozen).flatMap((layer) => layer.paths),
  ];
  const unique = [...new Set(globs)];
  return `---
description: Lattice frozen layers and do-not-touch zones
globs: ${unique.length ? unique.join(",") : "**/*"}
alwaysApply: false
---

This path is protected by the Lattice charter. Do not edit it unless the current
task has \`allowFrozenTouch: true\` and the human asked you to. Read
\`.lattice/charter.md\` and the current \`.lattice/handoffs/*.md\` first.
`;
}

export function injectProjectFiles(project: Project, _task?: Task, opts?: { force?: boolean }): void {
  const root = project.rootPath;
  write(join(root, ".lattice", "charter.md"), renderCharterMarkdown(project));
  write(join(root, ".lattice", "POLICY.md"), renderPolicyMarkdown(mergePolicy(project.policy)));

  const agentsPath = join(root, "AGENTS.md");
  const previous = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "# Agents\n";
  if (!(driftOf(previous)?.kind === "edited" && !opts?.force)) {
    write(agentsPath, upsertMarked(previous, renderAgentsBlock(project)));
  }

  const claudePath = join(root, "CLAUDE.md");
  if (!existsSync(claudePath)) {
    write(claudePath, "@AGENTS.md\n");
  } else {
    const claude = readFileSync(claudePath, "utf8");
    if (!claude.includes("@AGENTS.md")) {
      write(claudePath, `@AGENTS.md\n\n${claude}`);
    }
  }

  write(join(root, ".cursor", "rules", "lattice-charter.mdc"), renderCursorRule(project));
  writeWorkzoonSkill(root);

  const includePath = join(root, ".worktreeinclude");
  if (!existsSync(includePath)) {
    write(includePath, ".env\n.env.local\n");
  }
  installGuardHook(root);
}

function writeWorkzoonSkill(root: string): void {
  write(
    join(root, ".agents", "skills", "workzoon-wiki", "SKILL.md"),
    `---
name: workzoon-wiki
description: "Maintain the Agent Workzoon LLM wiki. Triggers: ingest, query wiki, lint wiki, worktree map, what do I know about this repo, Karpathy wiki."
---

# Agent Workzoon wiki

This repo uses Karpathy's LLM Wiki pattern, scoped to a multi-agent coding suite.

## Layers

- \`.lattice/raw/\` — immutable sources. Read only after write.
- \`.lattice/wiki/\` — compiled pages. Write concepts/sources/syntheses only via \`workzoon wiki-write\` when POLICY allows that bucket.
- \`.lattice/wiki/entities/\` — engine-compiled live git map. Do not hand-edit; run compile / open the Workzoon UI.
- Schema — this file plus the managed \`AGENTS.md\` block.

## Operations

**Ingest.** Copy a source into \`.lattice/raw/<topic>/YYYY-MM-DD-slug.md\` (engine records sha256 in \`raw/.manifest.json\`). Preserve original text. Then compile into wiki pages, update \`wiki/index.md\`, append \`wiki/log.md\` with \`## [YYYY-MM-DD] ingest | Title\`.

Handoffs are copied by the engine to \`.lattice/raw/handoffs/<taskId>/<ts>.md\`. Compile them with \`workzoon wiki-write --bucket sources\` when \`agentWrites.sources\` is on. If that switch is off, a human compiles.

**Query.** Read \`wiki/index.md\` first, then entity pages, then concepts. Cite pages. File good answers into \`wiki/syntheses/\` only when asked.

**Lint.** Check index coverage, broken \`[[wikilinks]]\`, orphan pages, and raw files that were never compiled. Auto-fix index rows. Never rewrite raw/.

## Policy

Read \`.lattice/POLICY.md\`. Default actor is agent (fail closed). Humans pass \`--actor human\` or \`X-Workzoon-Actor: human\`. Destructive actions never auto-allow.

## Duties

Wiki maintenance is a duty, not a switch. After ingest or handoff, compile allowed buckets with \`workzoon wiki-write\`, update index, append log, then \`workzoon lint --fix 1\`. Closed buckets lint as \`write-forbidden\`. Mark done only after the wiki gate passes.

## Never

Do not add remotes, force-push, delete artifacts, edit raw after write, hand-edit \`wiki/entities/\`, or edit policy. Do not delete the base branch or a live worktree HEAD.

## Holdings

The human owns four things. Read \`.lattice/HOLDINGS.md\` before you touch any of them:

1. 仓库 — remotes and the registered root
2. 分支 — every ref in the forest
3. 源码 — worktree checkouts
4. 产物 — \`out/\`, \`dist/\`, and other build products

Do not add remotes, delete branches, or publish artifacts unless asked.

## Worktree rule

One feature = one branch = one worktree. Live map is \`wiki/entities/holdings.md\`. Copy the path from that page; do not invent checkout locations.
`,
  );
}

export function syncGovernanceToWorktree(project: Project, dest: string, task?: Task): void {
  if (!dest || dest === project.rootPath || !existsSync(dest)) return;
  const rels = [
    "AGENTS.md",
    "CLAUDE.md",
    ".lattice/charter.md",
    ".lattice/POLICY.md",
    ".lattice/ledger.md",
    ".lattice/project.json",
    ".lattice/wiki/index.md",
    ".lattice/wiki/log.md",
    ".lattice/HOLDINGS.md",
    ".lattice/wiki/entities/holdings.md",
    ".lattice/wiki/entities/artifacts.md",
    ".lattice/wiki/entities/repo.md",
    ".lattice/wiki/entities/worktrees.md",
    ".lattice/wiki/concepts/workzoon.md",
    ".lattice/wiki/concepts/charter.md",
    ".agents/skills/workzoon-wiki/SKILL.md",
  ];
  if (task) {
    rels.push(`.lattice/tasks/${task.id}.md`);
    rels.push(`.lattice/handoffs/${task.id}.md`);
    rels.push(`.lattice/wiki/entities/task-${task.slug}.md`);
    rels.push(`.lattice/pulses/${task.id}.json`);
  }
  for (const rel of rels) {
    const src = join(project.rootPath, rel);
    if (!existsSync(src)) continue;
    const target = join(dest, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(src, target);
  }
  const live = project.worktrees.find((item) => item.path === dest);
  let branch = live?.branch || (task ? plannedBranch(task) : "(detached)");
  try {
    branch = currentBranch(dest);
  } catch {
    // planted or non-git dest still gets a brief
  }
  write(
    join(dest, WORKZOON_BRIEF),
    renderWorkzoonBrief(project, dest, {
      branch,
      base: live?.baseBranch || project.baseBranch,
      rendered: nowIso(),
      task,
    }),
  );
  if (task) {
    const agentsPath = join(dest, "AGENTS.md");
    const previous = existsSync(agentsPath) ? readFileSync(agentsPath, "utf8") : "# Agents\n";
    write(agentsPath, upsertMarked(previous, renderAgentsBlock(project, task)));
  }
  excludeGovernance(dest);
}

export function taskFileRels(taskId: string): string[] {
  return [`.lattice/tasks/${taskId}.md`, `.lattice/handoffs/${taskId}.md`];
}

export function publishTaskFilesToBranch(project: Project, task: Task): void {
  if (!task.worktreeId) return;
  const tree = project.worktrees.find((item) => item.id === task.worktreeId);
  if (!tree?.path || !existsSync(tree.path)) return;
  const rels = taskFileRels(task.id).filter((rel) => existsSync(join(tree.path, rel)));
  if (!rels.length) return;
  try {
    for (const rel of rels) {
      runGit(tree.path, ["add", "-f", "--", rel]);
    }
    const staged = runGit(tree.path, ["diff", "--cached", "--name-only", "--", ...rels]);
    if (!staged.trim()) return;
    runGit(tree.path, [
      "commit",
      "--no-verify",
      "-m",
      `${ENGINE_TASK_COMMIT} task files for ${task.slug}`,
      "--",
      ...rels,
    ]);
  } catch (err) {
    const detail = err instanceof GitError ? `${err.message} ${err.detail || ""}` : String(err);
    if (/nothing to commit|no changes added/i.test(detail)) return;
    throw err;
  }
}

const GOVERNANCE_EXCLUDE = ["AGENTS.md", "CLAUDE.md", WORKZOON_BRIEF, ".lattice/", ".agents/"];

export function excludeGovernance(dest: string): void {
  if (!dest || !existsSync(dest)) return;
  try {
    const exclude = runGit(dest, ["rev-parse", "--git-path", "info/exclude"]);
    const excludePath = exclude.startsWith("/") ? exclude : join(dest, exclude);
    mkdirSync(dirname(excludePath), { recursive: true });
    const prev = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
    const existing = new Set(
      prev
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
    const missing = GOVERNANCE_EXCLUDE.filter((line) => !existing.has(line));
    if (!missing.length) return;
    const prefix = prev && !prev.endsWith("\n") ? `${prev}\n` : prev;
    writeFileSync(excludePath, `${prefix}${missing.join("\n")}\n`);
  } catch {
    // linked worktrees still work if exclude cannot be written
  }
}

export function writeTaskCard(project: Project, task: Task): void {
  write(
    join(project.rootPath, ".lattice", "tasks", `${task.id}.md`),
    `# ${task.title}

- id: \`${task.id}\`
- slug: \`${task.slug}\`
- status: ${task.status}
- intent: ${task.intent || "feat"}
- branch: \`${plannedBranch(task)}\`
- base: \`${task.baseBranch || project.baseBranch}\`
- agent: ${task.agent}
- allowed: ${task.allowedPaths.join(", ") || "—"}
- forbidden: ${task.forbiddenPaths.join(", ") || "—"}
- frozen touch: ${task.allowFrozenTouch}
- escalation: ${formatEscalation(task)}
- worktree: ${task.worktreeId || "—"}

${task.notes}
`,
  );
}
