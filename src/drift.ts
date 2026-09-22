import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Drift, Project } from "./types.ts";

export const END = "<!-- lattice:end -->";
// 非 g 标志。group1 = 旧/新 BEGIN 里的 hash（可空），group2 = 正文
export const BLOCK_RE = /<!-- lattice:begin(?: sha256=([0-9a-f]{12}))? -->([\s\S]*?)<!-- lattice:end -->/;

export function blockHash(body: string): string {
  return createHash("sha256").update(body.replace(/\r\n/g, "\n").trim()).digest("hex").slice(0, 12);
}

export function beginMarker(body: string): string {
  return `<!-- lattice:begin sha256=${blockHash(body)} -->`;
}

export function driftOf(text: string | null): Drift | null {
  if (text == null) return { file: "AGENTS.md", kind: "missing" };
  const match = text.match(BLOCK_RE);
  if (!match) return { file: "AGENTS.md", kind: "missing" };
  const recorded = match[1];
  if (!recorded) return { file: "AGENTS.md", kind: "stale" };
  const actual = blockHash(match[2]);
  if (recorded !== actual) return { file: "AGENTS.md", kind: "edited", recorded, actual };
  return null;
}

export function detectDrift(project: Project): Drift[] {
  const path = join(project.rootPath, "AGENTS.md");
  const text = existsSync(path) ? readFileSync(path, "utf8") : null;
  const item = driftOf(text);
  return item ? [item] : [];
}
