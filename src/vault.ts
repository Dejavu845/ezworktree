import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { Project, Task, VaultNote } from "./types.ts";
import { listWikiPages } from "./wiki.ts";

const WIKI = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

function parseFrontmatter(raw: string): { data: Record<string, string | string[]>; body: string } {
  if (!raw.startsWith("---\n")) return { data: {}, body: raw };
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) return { data: {}, body: raw };
  const block = raw.slice(4, end);
  const body = raw.slice(end + 5);
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
    if (entry.name.startsWith(".") && entry.name !== ".foam") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, acc);
    else if (entry.name.endsWith(".md")) acc.push(full);
  }
  return acc;
}

export function vaultDir(project: Project): string {
  return join(project.rootPath, ".lattice", "vault");
}

export function seedVault(project: Project): void {
  const root = vaultDir(project);
  mkdirSync(join(root, "decisions"), { recursive: true });
  mkdirSync(join(root, "conventions"), { recursive: true });
  mkdirSync(join(root, "handoffs"), { recursive: true });
  mkdirSync(join(root, ".foam", "templates"), { recursive: true });

  const files: Record<string, string> = {
    "index.md": `---
title: 目录
type: index
tags: lattice
---

# ${project.name} 笔记

- [[charter]]
- [[inbox]]
- 从这里开始。用 \`[[链接]]\` 把笔记串起来。
`,
    "inbox.md": `---
title: 收件
type: inbox
tags: capture
---

# 收件

- 先记下来，以后再归档。
`,
    "charter.md": `---
title: 宪章
type: charter
tags: law
---

# 宪章

完整条文在 \`.lattice/charter.md\`。冻结层不能随便改。
`,
    "conventions/agent-handoff.md": `---
title: 交接
type: convention
tags: handoff
---

# 交接

完成之前先写 \`.lattice/handoffs/<taskId>.md\`。
不要覆盖别人的交接。
`,
    ".foam/templates/decision.md": `---
title: "$FOAM_TITLE"
type: decision
tags: decision
---

# $FOAM_TITLE

## 背景
## 决定
## 否决
`,
  };

  for (const [rel, body] of Object.entries(files)) {
    const path = join(root, rel);
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, body);
    }
  }
}

export function listNotes(project: Project): VaultNote[] {
  const wikiNotes: VaultNote[] = listWikiPages(project).map((page) => ({
    path: page.path,
    title: page.title,
    type: page.type,
    tags: page.tags,
    body: page.body,
    links: page.links,
    layer: page.layer,
  }));
  const root = vaultDir(project);
  const vaultNotes = walkMarkdown(root).map((path) => {
    const raw = readFileSync(path, "utf8");
    const { data, body } = parseFrontmatter(raw);
    const links = [...body.matchAll(WIKI)].map((match) => match[1].trim());
    const title =
      (typeof data.title === "string" && data.title) ||
      body.match(/^#\s+(.+)$/m)?.[1] ||
      relative(root, path);
    const tags = Array.isArray(data.tags) ? data.tags : typeof data.tags === "string" ? [data.tags] : [];
    return {
      path: relative(project.rootPath, path),
      title,
      type: String(data.type || "note"),
      tags,
      body,
      links,
      layer: "vault" as const,
    };
  });
  const seen = new Set(wikiNotes.map((note) => note.path));
  return [...wikiNotes, ...vaultNotes.filter((note) => !seen.has(note.path))];
}

export function searchNotes(project: Project, query: string): VaultNote[] {
  const q = query.trim().toLowerCase();
  if (!q) return listNotes(project);
  return listNotes(project).filter((note) => {
    const hay = `${note.title} ${note.type} ${note.tags.join(" ")} ${note.body}`.toLowerCase();
    return q.split(/\s+/).every((part) => hay.includes(part));
  });
}

export function injectContext(project: Project, task: Task, limit = 8): string[] {
  const layerTags = project.charter.layers
    .filter((layer) => task.layerIds.length === 0 || task.layerIds.includes(layer.id))
    .flatMap((layer) => [layer.id, layer.name.toLowerCase()]);
  const notes = listNotes(project).filter((note) => {
    if (note.path.includes(".foam/templates")) return false;
    if (!["charter", "decision", "convention", "concept", "entity"].includes(note.type)) return false;
    if (!task.layerIds.length) return true;
    return note.tags.some((tag) => layerTags.includes(String(tag).toLowerCase()));
  });
  const destDir = join(project.rootPath, ".lattice", "context");
  mkdirSync(destDir, { recursive: true });
  for (const entry of existsSync(destDir) ? readdirSync(destDir) : []) {
    rmSync(join(destDir, entry), { force: true, recursive: true });
  }
  const chosen = notes.slice(0, limit);
  const written: string[] = [];
  for (const note of chosen) {
    const name =
      note.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) ||
      note.path.split("/").pop()?.replace(/\.md$/, "") ||
      "note";
    const dest = join(destDir, `${name}.md`);
    const excerpt = note.body.slice(0, 2000);
    writeFileSync(
      dest,
      `---\nsource: ${note.path}\ntask: ${task.id}\n---\n\n${excerpt}\n`,
    );
    written.push(dest);
  }
  return written;
}
