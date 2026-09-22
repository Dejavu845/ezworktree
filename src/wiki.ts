import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { formatEscalation } from "./escalation.ts";
import { nowIso } from "./ids.ts";
import { plannedBranch } from "./lane.ts";
import { collectHoldings, writeHoldings } from "./holdings.ts";
import { repoMap } from "./map.ts";
import { mergePolicy } from "./policy.ts";
import type {
  Caller,
  Project,
  RepoMap,
  Task,
  WikiBucket,
  WikiHit,
  WikiHitField,
  WikiLint,
  WikiLintIssue,
  WikiPage,
} from "./types.ts";

const WIKI = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
const MD_LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const COMPILED = "<!-- workzoon:compiled -->";
export const WIKI_BUCKETS: WikiBucket[] = ["concepts", "sources", "syntheses"];
const SEED_WIKI_PAGES = new Set(["wiki/concepts/charter.md", "wiki/concepts/workzoon.md"]);

const BUCKET_LABEL: Record<WikiBucket, string> = {
  concepts: "概念",
  sources: "来源",
  syntheses: "综合",
};

export function wikiWriteRejectReason(bucket: WikiBucket): string {
  return `Agent 现在不能改「${BUCKET_LABEL[bucket]}」这类百科。请你来写。`;
}

export type WikiPageRejectKind = "outside" | "missing" | "bucket";

export function wikiPageRejectReason(kind: WikiPageRejectKind): string {
  if (kind === "outside") return "这页不在百科里。请打开百科里的页，或原文。";
  if (kind === "missing") return "找不到这页。换一篇百科里已经有的。";
  return "这类百科不认识。请选概念、来源或综合。";
}

export class WikiWriteError extends Error {
  code: "write-forbidden";
  bucket: WikiBucket;
  constructor(bucket: WikiBucket) {
    super(wikiWriteRejectReason(bucket));
    this.name = "WikiWriteError";
    this.code = "write-forbidden";
    this.bucket = bucket;
  }
}

export function wikiBucketOf(relPath: string): WikiBucket | null {
  const norm = relPath.replace(/\\/g, "/");
  for (const bucket of WIKI_BUCKETS) {
    if (norm.includes(`/wiki/${bucket}/`) || norm.endsWith(`/wiki/${bucket}`) || norm.includes(`wiki/${bucket}/`)) {
      return bucket;
    }
  }
  return null;
}

export function isSeedWikiPage(relPath: string): boolean {
  const norm = relPath.replace(/\\/g, "/").replace(/^\.lattice\//, "");
  return SEED_WIKI_PAGES.has(norm) || [...SEED_WIKI_PAGES].some((item) => norm.endsWith(item));
}

export function agentMayWriteWiki(policy: Project["policy"] | undefined, bucket: WikiBucket): boolean {
  return mergePolicy(policy).wiki.agentWrites[bucket] !== false;
}

export function assertAgentWikiWrite(policy: Project["policy"] | undefined, caller: Caller, bucket: WikiBucket): void {
  if (caller.actor !== "agent") return;
  if (agentMayWriteWiki(policy, bucket)) return;
  throw new WikiWriteError(bucket);
}

function parseFrontmatter(raw: string): { data: Record<string, string | string[]>; body: string } {
  let text = raw;
  while (text.startsWith("<!--")) {
    const end = text.indexOf("-->");
    if (end === -1) break;
    text = text.slice(end + 3).replace(/^\s+/, "");
  }
  if (!text.startsWith("---\n")) return { data: {}, body: raw };
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return { data: {}, body: raw };
  const block = text.slice(4, end);
  const body = text.slice(end + 5);
  const data: Record<string, string | string[]> = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    data[key] = key === "tags" ? value.split(/[\s,]+/).filter(Boolean) : value;
  }
  return { data, body };
}

function walkMarkdown(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, acc);
    else if (entry.name.endsWith(".md")) acc.push(full);
  }
  return acc;
}

export function wikiRoot(project: Project): string {
  return join(project.rootPath, ".lattice", "wiki");
}

export function rawRoot(project: Project): string {
  return join(project.rootPath, ".lattice", "raw");
}

export function wikiSlug(title: string, fallback: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || fallback
  );
}

export function wikiRawRejectReason(dest: string): string {
  return `「${dest}」这份原文已经在了。换个标题，或打开已有的原文。`;
}

function writeNew(path: string, body: string): boolean {
  if (existsSync(path)) return false;
  writeAlways(path, body);
  return true;
}

function writeAlways(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body.endsWith("\n") ? body : `${body}\n`);
}

function compiledEntity(frontmatter: string, body: string): string {
  return `---
${frontmatter.trim()}
---

${COMPILED}

${body.trim()}\n`;
}

function manifestFile(project: Project): string {
  return join(rawRoot(project), ".manifest.json");
}

export function loadRawManifest(project: Project): Record<string, string> {
  const path = manifestFile(project);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function hashFile(abs: string): string {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

export function recordRawManifest(project: Project, absPath: string): void {
  const rel = relative(rawRoot(project), absPath).replace(/\\/g, "/");
  if (!rel || rel.startsWith("..") || rel.endsWith(".manifest.json")) return;
  const man = loadRawManifest(project);
  man[rel] = hashFile(absPath);
  writeAlways(manifestFile(project), `${JSON.stringify(man, null, 2)}\n`);
}

export function seedWiki(project: Project): void {
  const wiki = wikiRoot(project);
  const raw = rawRoot(project);
  mkdirSync(join(raw, "sources"), { recursive: true });
  mkdirSync(join(raw, "handoffs"), { recursive: true });
  mkdirSync(join(wiki, "entities"), { recursive: true });
  mkdirSync(join(wiki, "concepts"), { recursive: true });
  mkdirSync(join(wiki, "sources"), { recursive: true });
  mkdirSync(join(wiki, "syntheses"), { recursive: true });

  const charterRaw = join(raw, "sources", "workzoon-charter.md");
  const wroteCharter = writeNew(
    charterRaw,
    `# ${project.name} 宪章原文

这份原文收进来之后不要再改。整理后的宪章在 \`wiki/concepts/charter.md\`。

${project.charter.purpose}

架构：${project.charter.architecture}
`,
  );
  const relCharter = relative(rawRoot(project), charterRaw).replace(/\\/g, "/");
  if (wroteCharter || !loadRawManifest(project)[relCharter]) recordRawManifest(project, charterRaw);

  writeNew(
    join(wiki, "index.md"),
    `# ${project.name} 百科

先看这一页，再点进去。链接名保持不变，方便对上文件。

## Entities
- [[repo]] — 现在的分支和检出
- [[worktrees]] — 每一棵检出的位置

## Concepts
- [[charter]] — 冻结层和不要碰的地方
- [[workzoon]] — 这套工区怎么维护

## Sources
- （先收原文，再整理成页）

## Syntheses
- （把值得留下的答案写回这里）
`,
  );

  writeNew(
    join(wiki, "log.md"),
    `# 百科日志

## [${nowIso().slice(0, 10)}] compile | seed
- 处置：新建
- 原文：.lattice/raw/sources/workzoon-charter.md
`,
  );

  writeNew(
    join(wiki, "overview.md"),
    `---
title: 总览
type: synthesis
tags: workzoon
---

# 总览

${project.name} 由工区管着。现在的分支和检出写在 \`wiki/entities/\`。
人和助手都读百科。概念页和综合页由助手写，实体页由引擎刷新。
`,
  );

  writeNew(
    join(wiki, "concepts", "charter.md"),
    `---
title: 宪章
type: concept
tags: law
---

# 宪章

完整条文在 \`.lattice/charter.md\`。冻结层不能随便改。越界的改动会被拦住。

原文：[workzoon-charter.md](../../raw/sources/workzoon-charter.md)
`,
  );

  writeNew(
    join(wiki, "concepts", "workzoon.md"),
    `---
title: Agent Workzoon
type: concept
tags: workzoon
---

# Agent Workzoon

三层，照着百科的办法：

1. **raw/** — 原文。收进来之后不要再改。
2. **wiki/** — 整理后的页。助手维护概念和综合。引擎刷新 \`entities/\`。
3. **schema** — \`AGENTS.md\` 和 \`.agents/skills/workzoon-wiki/SKILL.md\`。收入、查询、检查。

界面只读这些检出和百科。真相在磁盘上。
`,
  );
  migrateKnownSeed(project);
}

const KNOWN_SEED: Array<[string, string]> = [
  [
    "Catalog of compiled knowledge. Agents read this first, then drill into pages.",
    "先看这一页，再点进去。链接名保持不变，方便对上文件。",
  ],
  ["- [[repo]] — live branches and worktrees", "- [[repo]] — 现在的分支和检出"],
  ["- [[worktrees]] — every checkout path", "- [[worktrees]] — 每一棵检出的位置"],
  ["- [[charter]] — frozen layers and do-not-touch", "- [[charter]] — 冻结层和不要碰的地方"],
  ["- [[workzoon]] — how this suite is maintained", "- [[workzoon]] — 这套工区怎么维护"],
  ["- (ingest raw files, then compile)", "- （先收原文，再整理成页）"],
  ["- (file good answers back here)", "- （把值得留下的答案写回这里）"],
  [
    "This file is immutable raw. The compiled charter lives in `wiki/concepts/charter.md`.",
    "这份原文收进来之后不要再改。整理后的宪章在 `wiki/concepts/charter.md`。",
  ],
  ["Frozen layers are law. Blast radius is enforcement.", "冻结层不能随便改。越界的改动会被拦住。"],
  ["See `.lattice/charter.md`.", "完整条文在 `.lattice/charter.md`。"],
  ["Three layers, after Karpathy's LLM Wiki:", "三层，照着百科的办法："],
  ["immutable sources. Never edit after write.", "原文。收进来之后不要再改。"],
  [
    "compiled pages. Agents maintain concepts and syntheses. Engine refreshes `entities/`.",
    "整理后的页。助手维护概念和综合。引擎刷新 `entities/`。",
  ],
  [
    "The visual app is a read layer over git worktrees and this wiki. It is not the source of truth.",
    "界面只读这些检出和百科。真相在磁盘上。",
  ],
  ["# Wiki log\n", "# 百科日志\n"],
  ["- Disposition: New\n", "- 处置：新建\n"],
  ["- Disposition: New (raw only; agent compiles wiki/)", "- 处置：新建（只收原文，助手再整理进百科）"],
  [
    "- Disposition: New (raw handoff copy; agent compiles wiki/sources/handoff-*)",
    "- 处置：新建（交接原文副本，助手再整理进百科）",
  ],
];

function migrateKnownSeed(project: Project): void {
  const paths = [
    join(wikiRoot(project), "index.md"),
    join(wikiRoot(project), "overview.md"),
    join(wikiRoot(project), "concepts", "charter.md"),
    join(wikiRoot(project), "concepts", "workzoon.md"),
    join(rawRoot(project), "sources", "workzoon-charter.md"),
    join(wikiRoot(project), "log.md"),
  ];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    let text = readFileSync(path, "utf8");
    let next = text;
    for (const [from, to] of KNOWN_SEED) {
      if (next.includes(from)) next = next.replaceAll(from, to);
    }
    next = next.replace(
      /^.+ is governed by Agent Workzoon\. Live git state is compiled into `wiki\/entities\/`\.\nHumans and agents read the wiki; only agents write concept and synthesis pages\./m,
      `${project.name} 由工区管着。现在的分支和检出写在 \`wiki/entities/\`。\n人和助手都读百科。概念页和综合页由助手写，实体页由引擎刷新。`,
    );
    if (next.startsWith(`# ${project.name} wiki\n`)) next = next.replace(`# ${project.name} wiki\n`, `# ${project.name} 百科\n`);
    if (next.includes("\n# Charter\n")) next = next.replace("\n# Charter\n", "\n# 宪章\n");
    if (next.includes("title: Charter\n")) next = next.replace("title: Charter\n", "title: 宪章\n");
    if (next.includes("title: Overview\n")) next = next.replace("title: Overview\n", "title: 总览\n");
    if (next.includes("\n# Overview\n")) next = next.replace("\n# Overview\n", "\n# 总览\n");
    if (next !== text) writeAlways(path, next);
  }
}

export function compileEntityWiki(project: Project, map?: RepoMap): RepoMap {
  seedWiki(project);
  const live = map || repoMap(project);
  const wiki = wikiRoot(project);

  writeAlways(
    join(wiki, "entities", "repo.md"),
    compiledEntity(
      `title: ${project.name} repo
type: entity
tags: repo git`,
      `# ${project.name}

- root: \`${project.rootPath}\`
- base: \`${project.baseBranch}\`
- HEAD: \`${live.currentBranch}\`

## Branches

| Branch | SHA | Worktree | Task |
|---|---|---|---|
${live.lanes
  .map((lane) => {
    const path = lane.worktreePath ? `\`${lane.worktreePath}\`` : "—";
    const task = lane.taskTitle || "—";
    return `| \`${lane.branch}\` | \`${lane.sha || "—"}\` | ${path} | ${task} |`;
  })
  .join("\n")}

从全部分支里复制分支或路径。不要编造检出位置。`,
    ),
  );

  writeAlways(
    join(wiki, "entities", "worktrees.md"),
    compiledEntity(
      `title: 检出
type: entity
tags: worktree`,
      `# 检出

${live.worktrees
  .map(
    (tree) =>
      `- \`${tree.branch}\` → \`${tree.path}\`${tree.isPrimary ? " （主树）" : ""}${tree.detached ? " 游离" : ""}`,
  )
  .join("\n") || "- （还没有）"}

已登记的任务：

${project.tasks
  .map((task) => {
    const tree = project.worktrees.find((item) => item.id === task.worktreeId);
    return `- [[task-${task.slug}]] \`${tree?.branch || plannedBranch(task)}\` ${task.status} ${tree?.path || "还没检出"}`;
  })
  .join("\n") || "- (none)"}`,
    ),
  );

  for (const task of project.tasks) {
    const tree = project.worktrees.find((item) => item.id === task.worktreeId);
    writeAlways(
      join(wiki, "entities", `task-${task.slug}.md`),
      compiledEntity(
        `title: ${task.title}
type: entity
tags: task ${task.status}`,
        `# ${task.title}

- id: \`${task.id}\`
- slug: \`${task.slug}\`
- status: ${task.status}
- agent: ${task.agent}
- intent: ${task.intent || "feat"}
- branch: \`${tree?.branch || plannedBranch(task)}\`
- base: \`${tree?.baseBranch || task.baseBranch || project.baseBranch}\`
- worktree: \`${tree?.path || "(create from the forest)"}\`
- allowed: ${task.allowedPaths.join(", ") || "non-frozen"}
- forbidden: ${task.forbiddenPaths.join(", ") || "—"}
- frozen touch: ${task.allowFrozenTouch}
- escalation: ${formatEscalation(task)}
- handoff: \`.lattice/handoffs/${task.id}.md\`

See [[repo]] and [[worktrees]].`,
      ),
    );
  }

  writeHoldings(project, collectHoldings(project, live));
  refreshIndex(project, live);
  return live;
}

function refreshIndex(project: Project, map: RepoMap): void {
  const path = join(wikiRoot(project), "index.md");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const begin = "<!-- workzoon:index:entities -->";
  const end = "<!-- /workzoon:index:entities -->";
  const block = `${begin}
- [[holdings]] — 仓库、分支、检出和产物
- [[repo]] — ${map.lanes.length} 条分支 / ${map.worktrees.length} 棵检出
- [[artifacts]] — 磁盘上的产物
${project.tasks.map((task) => `- [[task-${task.slug}]] — ${task.title} (${task.status})`).join("\n")}
${end}`;
  if (existing.includes(begin) && existing.includes(end)) {
    writeAlways(path, existing.replace(new RegExp(`${begin}[\\s\\S]*?${end}`), block));
    return;
  }
  if (!existing.trim()) {
    writeAlways(path, `# ${project.name} wiki\n\n## Entities\n\n${block}\n`);
    return;
  }
  writeAlways(path, `${existing.trimEnd()}\n\n## Entities\n\n${block}\n`);
}

export function appendWikiLog(project: Project, kind: string, title: string, extra: string[] = []): void {
  const path = join(wikiRoot(project), "log.md");
  const stamp = nowIso().slice(0, 10);
  const lines = [`## [${stamp}] ${kind} | ${title}`, ...extra.map((item) => `- ${item}`), ""];
  if (!existsSync(path)) writeAlways(path, `# 百科日志\n\n${lines.join("\n")}`);
  else writeFileSync(path, `${readFileSync(path, "utf8").trimEnd()}\n\n${lines.join("\n")}\n`);
}

export function ingestRaw(
  project: Project,
  input: { title: string; body: string; topic?: string },
): { path: string } {
  seedWiki(project);
  const topic = (input.topic || "sources").replace(/[^\w-]+/g, "-");
  const slug = wikiSlug(input.title, "source");
  const dest = join(rawRoot(project), topic, `${nowIso().slice(0, 10)}-${slug}.md`);
  if (existsSync(dest)) throw new Error(wikiRawRejectReason(relative(project.rootPath, dest)));
  writeAlways(
    dest,
    `---
title: ${input.title}
collected: ${nowIso()}
published: Unknown
---

${input.body.trim()}
`,
  );
  recordRawManifest(project, dest);
  appendWikiLog(project, "ingest", input.title, [
    "处置：新建（只收原文，助手再整理进百科）",
    `Raw: ${relative(project.rootPath, dest)}`,
  ]);
  return { path: relative(project.rootPath, dest) };
}

export function ingestHandoffRaw(project: Project, task: Task, markdown: string): { path: string } {
  seedWiki(project);
  const stamp = nowIso().replace(/[:.]/g, "-");
  const dest = join(rawRoot(project), "handoffs", task.id, `${stamp}.md`);
  if (existsSync(dest)) throw new Error(wikiRawRejectReason(relative(project.rootPath, dest)));
  writeAlways(
    dest,
    `---
title: Handoff ${task.slug}
task: ${task.id}
collected: ${nowIso()}
---

${markdown.trim()}
`,
  );
  recordRawManifest(project, dest);
  appendWikiLog(project, "ingest", `handoff ${task.slug}`, [
    "处置：新建（交接原文副本，助手再整理进百科）",
    `Raw: ${relative(project.rootPath, dest)}`,
  ]);
  return { path: relative(project.rootPath, dest) };
}

function toPage(project: Project, abs: string, layer: WikiPage["layer"]): WikiPage {
  const raw = readFileSync(abs, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const title =
    (typeof data.title === "string" && data.title) ||
    body.match(/^#\s+(.+)$/m)?.[1] ||
    relative(wikiRoot(project), abs);
  const tags = Array.isArray(data.tags) ? data.tags : typeof data.tags === "string" ? [data.tags] : [];
  const links = [...body.matchAll(WIKI)].map((match) => match[1].trim());
  const summary = body.replace(/^#.*$/m, "").replace(/---[\s\S]*?---/, "").trim().split("\n").find((line) => line.trim()) || "";
  return {
    path: relative(project.rootPath, abs),
    title,
    type: String(data.type || (layer === "raw" ? "source" : "note")),
    tags,
    summary: summary.slice(0, 180),
    body,
    links,
    layer,
    compiled: raw.includes(COMPILED),
  };
}

export function listWikiPages(project: Project): WikiPage[] {
  const wiki = walkMarkdown(wikiRoot(project)).map((path) => toPage(project, path, "wiki"));
  const raw = walkMarkdown(rawRoot(project)).map((path) => toPage(project, path, "raw"));
  return [...wiki, ...raw];
}

export function readWikiPage(project: Project, relPath: string): WikiPage {
  const abs = join(project.rootPath, relPath);
  const wiki = wikiRoot(project);
  const raw = rawRoot(project);
  if (!abs.startsWith(wiki) && !abs.startsWith(raw)) {
    throw new Error(wikiPageRejectReason("outside"));
  }
  if (!existsSync(abs)) throw new Error(wikiPageRejectReason("missing"));
  return toPage(project, abs, abs.startsWith(raw) ? "raw" : "wiki");
}

const HIT_FIELDS: WikiHitField[] = ["title", "type", "tags", "path", "body"];

export function wikiSnippet(text: string, needle: string, width = 88): string {
  const hay = text.replace(/\s+/g, " ").trim();
  const q = needle.trim();
  const at = q ? hay.toLowerCase().indexOf(q.toLowerCase()) : 0;
  const start = Math.max(0, (at < 0 ? 0 : at) - 24);
  const chunk = hay.slice(start, start + width);
  return `${start > 0 ? "…" : ""}${chunk}${start + width < hay.length ? "…" : ""}`;
}

export function wikiMatch(page: WikiPage, query: string): WikiHit | null {
  const parts = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const fieldText: Record<WikiHitField, string> = {
    title: page.title,
    type: page.type,
    tags: page.tags.join(" "),
    path: page.path,
    body: page.body,
  };
  const hay = HIT_FIELDS.map((field) => fieldText[field]).join("\n").toLowerCase();
  if (!parts.every((part) => hay.includes(part))) return null;
  const first = parts[0];
  const field = HIT_FIELDS.find((name) => fieldText[name].toLowerCase().includes(first)) || "body";
  return { field, snippet: wikiSnippet(fieldText[field], first) };
}

export function wikiAutoOpen(
  visible: { path: string }[],
  currentPath: string | undefined,
  searching: boolean,
): string | null {
  if (searching) return null;
  if (!visible.length) return null;
  if (currentPath && visible.some((item) => item.path === currentPath)) return null;
  return null;
}

export function resolveWikiLink(pages: WikiPage[], link: string): WikiPage | undefined {
  const needle = link.trim().replace(/\\/g, "/").replace(/\.md$/, "").replace(/^\.lattice\//, "").toLowerCase();
  if (!needle) return undefined;
  const slug = needle.split("/").pop() || needle;
  return (
    pages.find((page) => {
      const path = page.path.replace(/\\/g, "/").replace(/\.md$/, "").replace(/^\.lattice\//, "").toLowerCase();
      return path === needle || path.endsWith(`/${needle}`) || path.endsWith(`/${slug}`);
    }) ||
    pages.find((page) => {
      const title = page.title.toLowerCase();
      return title === needle || title === slug;
    })
  );
}

export function searchWiki(project: Project, query: string): WikiPage[] {
  const q = query.trim();
  const pages = listWikiPages(project);
  if (!q) return pages.filter((page) => page.layer === "wiki");
  return pages.flatMap((page) => {
    const hit = wikiMatch(page, q);
    return hit ? [{ ...page, hit }] : [];
  });
}

export function writeWikiPage(
  project: Project,
  input: { bucket: WikiBucket; title: string; body: string },
  caller: Caller,
): { path: string } {
  if (!WIKI_BUCKETS.includes(input.bucket)) throw new Error(wikiPageRejectReason("bucket"));
  assertAgentWikiWrite(project.policy, caller, input.bucket);
  seedWiki(project);
  const slug = wikiSlug(input.title, input.bucket);
  const dest = join(wikiRoot(project), input.bucket, `${slug}.md`);
  const type = input.bucket === "concepts" ? "concept" : input.bucket === "sources" ? "source" : "synthesis";
  writeAlways(
    dest,
    `---
title: ${input.title}
type: ${type}
---

${input.body.trim()}
`,
  );
  appendWikiLog(project, "compile", input.title, [
    `Bucket: wiki/${input.bucket}`,
    `Page: ${relative(project.rootPath, dest)}`,
  ]);
  return { path: relative(project.rootPath, dest) };
}

export function lintWiki(project: Project, fix = false): WikiLint {
  seedWiki(project);
  const writes = mergePolicy(project.policy).wiki.agentWrites;
  const all = listWikiPages(project);
  const pages = all.filter((page) => page.layer === "wiki");
  const rawPages = all.filter((page) => page.layer === "raw");
  const issues: WikiLintIssue[] = [];
  const index = pages.find((page) => page.path.endsWith("/wiki/index.md") || page.path.endsWith("wiki/index.md"));
  const indexBody = index?.body || "";
  const names = new Set(
    pages
      .filter((page) => !page.path.endsWith("index.md") && !page.path.endsWith("log.md"))
      .map((page) => page.path.replace(/\.md$/, "").split("/").pop() || ""),
  );

  for (const page of pages) {
    const slug = page.path.replace(/\.md$/, "").split("/").pop() || "";
    if (slug !== "index" && slug !== "log" && !indexBody.includes(`[[${slug}]]`) && !indexBody.includes(slug)) {
      issues.push({
        kind: "index-missing",
        path: page.path,
        detail: `${slug} 还没写进目录`,
        fixable: true,
      });
    }
    for (const link of page.links) {
      const target = link.split("/").pop() || link;
      if (!names.has(target) && !["index", "log", "inbox"].includes(target)) {
        const exists = pages.some((item) => item.path.endsWith(`${target}.md`));
        if (!exists) {
          issues.push({
            kind: "broken-link",
            path: page.path,
            detail: `[[${link}]] 没有对应的百科页`,
            fixable: false,
          });
        }
      }
    }
    for (const match of page.body.matchAll(MD_LINK)) {
      const href = match[2];
      if (href.startsWith("http") || href.startsWith("#")) continue;
      const from = join(project.rootPath, page.path);
      const dest = join(dirname(from), href.split("#")[0]);
      if (!existsSync(dest)) {
        issues.push({
          kind: "broken-link",
          path: page.path,
          detail: `找不到文件 ${href}`,
          fixable: false,
        });
      }
    }
    if (page.path.includes("/wiki/entities/") && !page.compiled) {
      issues.push({
        kind: "entity-hand-edit",
        path: page.path,
        detail: "实体页还没盖上整理印",
        fixable: false,
      });
    }
    const bucket = wikiBucketOf(page.path);
    if (bucket && !writes[bucket] && !isSeedWikiPage(page.path)) {
      issues.push({
        kind: "write-forbidden",
        path: page.path,
        detail: `「${BUCKET_LABEL[bucket]}」这类现在不让写；人来决定留还是删`,
        fixable: false,
      });
    }
  }

  for (const page of pages) {
    const slug = page.path.replace(/\.md$/, "").split("/").pop() || "";
    if (slug === "index" || slug === "log" || page.path.includes("/wiki/entities/")) continue;
    const inIndex = indexBody.includes(`[[${slug}]]`);
    const linked = pages.some((other) => other.path !== page.path && other.links.includes(slug));
    if (!inIndex && !linked) {
      issues.push({
        kind: "orphan",
        path: page.path,
        detail: `${slug} 没有被目录或其他页链到`,
        fixable: false,
      });
    }
  }

  const wikiBodies = pages
    .filter((page) => !page.path.endsWith("log.md") && !page.path.endsWith("index.md"))
    .map((page) => page.body)
    .join("\n");
  const manifest = loadRawManifest(project);
  for (const raw of rawPages) {
    const abs = join(project.rootPath, raw.path);
    const relRaw = relative(rawRoot(project), abs).replace(/\\/g, "/");
    const expected = manifest[relRaw];
    if (expected && hashFile(abs) !== expected) {
      issues.push({
        kind: "raw-escape",
        path: raw.path,
        detail: "原文在收进来之后被改过",
        fixable: false,
      });
    }
    const name = raw.path.replace(/\\/g, "/").split("/").pop() || "";
    const compiled = wikiBodies.includes(raw.path) || wikiBodies.includes(relRaw) || wikiBodies.includes(name);
    if (!compiled && writes.sources) {
      issues.push({
        kind: "raw-uncompiled",
        path: raw.path,
        detail: `${name} 没有百科页指向这份原文`,
        fixable: false,
      });
    }
  }

  if (index) {
    for (const match of indexBody.matchAll(/\[\[([^\]|#]+)\]\]/g)) {
      const target = match[1].trim().split("/").pop() || "";
      if (!names.has(target) && !["index", "log", "inbox"].includes(target)) {
        issues.push({
          kind: "index-stale",
          path: index.path,
          detail: `目录写了 [[${target}]]，但页不在了`,
          fixable: false,
        });
      }
    }
  }

  if (fix) {
    const forbidden = new Set(issues.filter((item) => item.kind === "write-forbidden").map((item) => item.path));
    const missing = issues.filter((item) => item.kind === "index-missing" && !forbidden.has(item.path));
    if (missing.length && index) {
      const extra = missing.map((item) => `- [[${item.path.replace(/\.md$/, "").split("/").pop()}]] — (no summary)`).join("\n");
      writeAlways(join(project.rootPath, index.path), `${indexBody.trimEnd()}\n\n## Lint\n${extra}\n`);
    }
    appendWikiLog(project, "lint", `${issues.length} issues found, ${missing.length} auto-fixed`);
  }

  const byKind: Record<string, number> = {};
  for (const issue of issues) byKind[issue.kind] = (byKind[issue.kind] || 0) + 1;
  return { pages: pages.length, issues, ok: issues.length === 0, byKind };
}

