import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { currentBranch, runGit } from "./git.ts";
import { nowIso } from "./ids.ts";
import type { Actor, Artifact, ArtifactVersion, ArtifactVersionView, Project } from "./types.ts";

const INVENTORY_CAP = 5000;

export function artifactsRoot(project: Project): string {
  return join(project.rootPath, ".lattice", "artifacts");
}

export function branchDir(branch: string): string {
  return branch.replace(/\//g, "-");
}

export function pinId(sha: string, name: string, contentHash: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "artifact";
  return `${sha.slice(0, 12)}-${safe}-${contentHash.slice(0, 8)}`;
}

export function inventory(
  abs: string,
  kind: "file" | "dir",
): { files: number; bytes: number; builtAt: string; contentHash: string; partial: boolean } {
  const rows: { rel: string; bytes: number; mtime: number }[] = [];
  let partial = false;
  const walk = (dir: string, prefix: string) => {
    if (rows.length >= INVENTORY_CAP) {
      partial = true;
      return;
    }
    if (!existsSync(dir)) return;
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (rows.length >= INVENTORY_CAP) {
        partial = true;
        return;
      }
      const full = join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
        continue;
      }
      try {
        const st = statSync(full);
        rows.push({ rel, bytes: st.size, mtime: st.mtimeMs });
      } catch {
        // unreadable
      }
    }
  };
  if (kind === "file") {
    const st = statSync(abs);
    rows.push({ rel: abs.split("/").pop() || "file", bytes: st.size, mtime: st.mtimeMs });
  } else {
    walk(abs, "");
  }
  rows.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const body = rows.map((row) => `${row.rel}\t${row.bytes}`).join("\n");
  const contentHash = createHash("sha256").update(body).digest("hex");
  const bytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  const builtAt = new Date(rows.reduce((max, row) => Math.max(max, row.mtime), 0) || Date.now()).toISOString();
  return { files: rows.length, bytes, builtAt, contentHash, partial };
}

function gitSha(checkout: string): string {
  return runGit(checkout, ["rev-parse", "HEAD"]);
}

function gitDirty(checkout: string): boolean {
  try {
    return Boolean(runGit(checkout, ["status", "--porcelain"]));
  } catch {
    return false;
  }
}

export function readPins(project: Project): ArtifactVersion[] {
  const root = artifactsRoot(project);
  if (!existsSync(root)) return [];
  const out: ArtifactVersion[] = [];
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const folder = join(root, dir.name);
    for (const file of readdirSync(folder)) {
      if (!file.endsWith(".json")) continue;
      try {
        out.push(JSON.parse(readFileSync(join(folder, file), "utf8")) as ArtifactVersion);
      } catch {
        // skip broken pin
      }
    }
  }
  return out.sort((a, b) => (a.pinnedAt < b.pinnedAt ? 1 : -1));
}

export function decorateVersion(project: Project, pin: ArtifactVersion): ArtifactVersionView {
  let state: ArtifactVersionView["state"] = "missing";
  if (existsSync(pin.path)) {
    const live = inventory(pin.path, pin.kind);
    state = live.contentHash === pin.contentHash ? "present" : "changed";
  }
  let onBranch = false;
  let behind = 0;
  try {
    runGit(project.rootPath, ["merge-base", "--is-ancestor", pin.sha, pin.branch]);
    onBranch = true;
    behind = Number(runGit(project.rootPath, ["rev-list", "--count", `${pin.sha}..${pin.branch}`]) || 0);
  } catch {
    onBranch = false;
  }
  return { ...pin, state, onBranch, behind };
}

export function listArtifactVersions(project: Project): ArtifactVersionView[] {
  return readPins(project).map((pin) => decorateVersion(project, pin));
}

export function pinMissingRejectReason(name: string): string {
  return `找不到「${name}」。换一个仓里已经有的文件或文件夹。`;
}

export function pinArtifact(
  project: Project,
  input: {
    name: string;
    checkout?: string;
    branch?: string;
    note?: string;
    taskId?: string;
    actor: Actor;
    agent?: string;
  },
): { version: ArtifactVersion; created: boolean } {
  const checkout = input.checkout || project.rootPath;
  const abs = join(checkout, input.name);
  if (!existsSync(abs)) throw new Error(pinMissingRejectReason(input.name));
  const kind = statSync(abs).isDirectory() ? "dir" : "file";
  const inv = inventory(abs, kind);
  const sha = gitSha(checkout);
  const branch = input.branch || currentBranch(checkout);
  const id = pinId(sha, input.name, inv.contentHash);
  const dest = join(artifactsRoot(project), branchDir(branch), `${id}.json`);
  if (existsSync(dest)) {
    return { version: JSON.parse(readFileSync(dest, "utf8")) as ArtifactVersion, created: false };
  }
  const note = input.note?.trim().replace(/\s+/g, " ").slice(0, 80) || undefined;
  const version: ArtifactVersion = {
    id,
    name: input.name,
    kind,
    path: abs,
    checkout,
    branch,
    sha,
    dirty: gitDirty(checkout),
    contentHash: inv.contentHash,
    files: inv.files,
    bytes: inv.bytes,
    builtAt: inv.builtAt,
    pinnedAt: nowIso(),
    pinnedBy: { actor: input.actor, ...(input.agent ? { agent: input.agent } : {}) },
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(note ? { note } : {}),
    ...(inv.partial ? { partial: true } : {}),
  };
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${JSON.stringify(version, null, 2)}\n`);
  return { version, created: true };
}

export function unpinArtifact(project: Project, id: string): ArtifactVersion | null {
  const pin = readPins(project).find((item) => item.id === id);
  if (!pin) return null;
  const dest = join(artifactsRoot(project), branchDir(pin.branch), `${pin.id}.json`);
  if (existsSync(dest)) rmSync(dest);
  return pin;
}

export function enrichArtifacts(project: Project, artifacts: Artifact[]): Artifact[] {
  const pins = readPins(project);
  return artifacts.map((item) => {
    let sha = "";
    let branch = "";
    try {
      sha = gitSha(item.checkout);
      branch = currentBranch(item.checkout);
    } catch {
      // checkout may not be a git dir
    }
    const live = existsSync(item.path) ? inventory(item.path, item.kind) : null;
    const match = pins.find(
      (pin) => pin.name === item.name && pin.sha === sha && pin.contentHash === live?.contentHash,
    );
    return { ...item, branch, sha, pinnedId: match?.id };
  });
}

export function pinRelPath(version: ArtifactVersion): string {
  return relative(
    process.cwd(),
    join(".lattice", "artifacts", branchDir(version.branch), `${version.id}.json`),
  ).replace(/\\/g, "/");
}
