import { existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { isIgnored, listRemotes } from "./git.ts";
import { repoMap } from "./map.ts";
import { ACTIONS, mergePolicy } from "./policy.ts";
import { enrichArtifacts, listArtifactVersions } from "./artifacts.ts";
import type { Artifact, ArtifactVersionView, Holdings, HygieneKind, Policy, Project, RepoLane, RepoMap } from "./types.ts";

const ARTIFACT_DIRS = new Set(["out", "dist", "build", "site", ".next", "coverage", "release", "artifacts"]);
const ARTIFACT_FILE = /\.(dmg|app|zip|tgz|whl|apk|ipa)$/i;

function dirBytes(root: string, limit = 200): number {
  let total = 0;
  let seen = 0;
  const walk = (dir: string) => {
    if (seen >= limit || !existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (seen >= limit) return;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      try {
        total += statSync(full).size;
        seen += 1;
      } catch {
        // unreadable artifact entry
      }
    }
  };
  walk(root);
  return total;
}

function scanCheckout(checkout: string): Artifact[] {
  if (!existsSync(checkout)) return [];
  const found: Artifact[] = [];
  for (const entry of readdirSync(checkout, { withFileTypes: true })) {
    const isDirHit = entry.isDirectory() && ARTIFACT_DIRS.has(entry.name);
    const isFileHit = entry.isFile() && ARTIFACT_FILE.test(entry.name);
    if (!isDirHit && !isFileHit) continue;
    const full = join(checkout, entry.name);
    found.push({
      name: entry.name,
      path: full,
      kind: entry.isDirectory() ? "dir" : "file",
      ignored: isIgnored(checkout, entry.name),
      bytes: entry.isFile() ? statSync(full).size : dirBytes(full),
      checkout,
    });
  }
  return found;
}

export function collectHoldings(project: Project, map?: RepoMap): Holdings {
  const live = map || repoMap(project);
  const checkouts = [...new Set([project.rootPath, ...live.worktrees.map((item) => item.path)])];
  const artifacts = enrichArtifacts(
    project,
    checkouts.flatMap((checkout) => scanCheckout(checkout)),
  );
  const versions = listArtifactVersions(project);
  const remotes = listRemotes(project.rootPath);
  const markdown = renderHoldings(project, live, remotes, artifacts, versions, project.policy);
  return {
    rootPath: project.rootPath,
    name: project.name,
    remotes,
    map: live,
    artifacts,
    versions,
    markdown,
  };
}

function agentRules(policy?: Policy): string {
  const live = mergePolicy(policy);
  const allow = ACTIONS.filter((item) => live.agentMay[item.id] === "allow").map((item) => item.label);
  const ask = ACTIONS.filter((item) => live.agentMay[item.id] === "ask").map((item) => item.label);
  const never = ACTIONS.filter((item) => live.agentMay[item.id] === "never").map((item) => item.label);
  return `- Preset: **${live.preset}**
- 可直接做: ${allow.join("、") || "（无）"}
- 需确认: ${ask.join("、") || "（无）"}
- 禁止: ${never.join("、") || "（无）"}
- 完成前必须维护百科并 lint。
- Read \`.lattice/POLICY.md\`.
- Do not add remotes, force-push, or edit policy.
- Do not publish or overwrite artifacts unless the current task lists that path.
- Copy worktree paths from this file or from \`wiki/entities/holdings.md\`.
- Hygiene tags are hints. Archiving or deleting still goes through policy.
- Do not plant or delete branches listed under 清单外. A human handles those.`;
}

export function renderHoldings(
  project: Project,
  map: RepoMap,
  remotes: Holdings["remotes"],
  artifacts: Artifact[],
  versions: ArtifactVersionView[] = [],
  policy?: Policy,
): string {
  const remoteLines = remotes.map((item) => `- \`${item.name}\` ${item.url}`).join("\n") || "- (no remotes)";
  const branches = map.lanes
    .map((lane) => {
      const tree = lane.worktreePath ? `\`${lane.worktreePath}\`` : "unplanted";
      return `| \`${lane.branch}\` | ${tree} | ${lane.taskTitle || (lane.managed ? "task" : "git")} | ${hygieneCell(lane)} |`;
    })
    .join("\n");
  const hygieneCounts = { merged: 0, stale: 0, "no-handoff": 0 };
  for (const lane of map.lanes) {
    for (const kind of lane.hygiene) hygieneCounts[kind] += 1;
  }
  const outside = map.lanes.filter((lane) => lane.undeclared);
  const outsideLines = outside
    .map((lane) => {
      const tree = lane.worktreePath ? `→ \`${lane.worktreePath}\`` : "unplanted";
      return `- \`${lane.branch}\` ${tree}`;
    })
    .join("\n");
  const trees = map.worktrees
    .map((tree) => `- \`${tree.branch}\` → \`${tree.path}\`${tree.isPrimary ? " (primary)" : ""}`)
    .join("\n");
  const pinCount = new Map<string, number>();
  for (const version of versions) {
    pinCount.set(version.name, (pinCount.get(version.name) || 0) + 1);
  }
  const arts = artifacts
    .map((item) => {
      const sha12 = item.sha ? item.sha.slice(0, 12) : "";
      const on = item.branch ? `on \`${item.branch}\`${sha12 ? ` @${sha12}` : ""}` : "";
      const pinned = pinCount.get(item.name) ? ` · 钉 ${pinCount.get(item.name)} 版` : "";
      return `- \`${item.name}\` ${item.ignored ? "ignored" : "tracked"} · ${item.bytes}B${on ? ` · ${on}` : ""}${pinned} · \`${item.path}\``;
    })
    .join("\n");
  const pinnedLines = versions
    .map(
      (item) =>
        `- \`${item.name}\` @${item.sha.slice(0, 12)} · ${item.state}${item.onBranch ? "" : " · off-branch"}${item.behind ? ` · behind ${item.behind}` : ""} · \`${item.id}\``,
    )
    .join("\n");
  return `# ${project.name} holdings

<!-- workzoon:holdings -->

The human owns these four. Agents may use them only as listed. Do not invent paths.

## 仓库
- root: \`${project.rootPath}\`
- base: \`${project.baseBranch}\`
- HEAD: \`${map.currentBranch}\`

${remoteLines}

## 分支

| Branch | Worktree | Owner | Hygiene |
|---|---|---|---|
${branches || "| — | — | — | — |"}

## 卫生
merged ${hygieneCounts.merged} · stale ${hygieneCounts.stale} · no-handoff ${hygieneCounts["no-handoff"]}

## 清单外
${outsideLines || "- (none)"}

## 源码

${trees || "- (primary checkout only)"}

## 产物

${arts || "- (none on disk)"}

## 版本

${pinnedLines || "- (none pinned)"}

## Agent rules
${agentRules(policy || project.policy)}
`;
}

function hygieneCell(lane: RepoLane): string {
  if (!lane.hygiene.length) return "—";
  const labels: Record<HygieneKind, string> = {
    merged: "merged",
    stale: "stale 14d",
    "no-handoff": "no-handoff",
  };
  return lane.hygiene.map((kind) => labels[kind]).join(" · ");
}

export function writeHoldings(project: Project, holdings?: Holdings): Holdings {
  const live = holdings || collectHoldings(project);
  const dest = join(project.rootPath, ".lattice", "HOLDINGS.md");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, live.markdown.endsWith("\n") ? live.markdown : `${live.markdown}\n`);

  const wiki = join(project.rootPath, ".lattice", "wiki", "entities", "holdings.md");
  mkdirSync(dirname(wiki), { recursive: true });
  writeFileSync(
    wiki,
    `---
title: 资产清单
type: entity
tags: holdings repo
---

<!-- workzoon:compiled -->

${live.markdown}
`,
  );

  const artifactsPage = join(project.rootPath, ".lattice", "wiki", "entities", "artifacts.md");
  writeFileSync(
    artifactsPage,
    `---
title: 产物
type: entity
tags: artifacts
---

<!-- workzoon:compiled -->

# 产物

这些产物归人。助手不要删，也不要自己发布。

${live.artifacts.map((item) => `- [${item.name}](${relative(join(project.rootPath, ".lattice", "wiki", "entities"), item.path)}) · \`${item.path}\``).join("\n") || "- (none)"}
${
  live.versions.length
    ? `
## 版本

${live.versions.map((item) => `- \`${item.name}\` @${item.sha.slice(0, 12)} · ${item.state} · \`${item.id}\``).join("\n")}
`
    : ""
}
`,
  );
  return live;
}
