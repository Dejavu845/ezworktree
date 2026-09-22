import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export class GitError extends Error {
  detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = "GitError";
    this.detail = detail;
  }
}

export function runGit(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.status !== 0) {
    const detail = `${result.stderr || result.stdout || ""}`.trim();
    throw new GitError(detail ? `git ${args.join(" ")} failed: ${detail}` : `git ${args.join(" ")} failed`, detail);
  }
  return (result.stdout || "").trim();
}

export function isGitRepo(root: string): boolean {
  try {
    runGit(root, ["rev-parse", "--is-inside-work-tree"]);
    return true;
  } catch {
    return false;
  }
}

export function currentBranch(root: string): string {
  return runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
}

export function defaultBranch(root: string): string {
  try {
    const ref = runGit(root, ["symbolic-ref", "refs/remotes/origin/HEAD"]);
    return ref.replace("refs/remotes/origin/", "");
  } catch {
    return currentBranch(root);
  }
}

export function listWorktrees(root: string): { path: string; branch: string }[] {
  return listLiveWorktrees(root).map((item) => ({ path: item.path, branch: item.branch }));
}

export function listLiveWorktrees(root: string): {
  path: string;
  branch: string;
  sha: string;
  detached: boolean;
  isPrimary: boolean;
}[] {
  const raw = runGit(root, ["worktree", "list", "--porcelain"]);
  const items: {
    path: string;
    branch: string;
    sha: string;
    detached: boolean;
    isPrimary: boolean;
  }[] = [];
  let current: { path: string; branch: string; sha: string; detached: boolean } | null = null;
  const flush = () => {
    if (!current?.path) return;
    items.push({
      ...current,
      isPrimary: items.length === 0,
    });
    current = null;
  };
  for (const line of raw.split("\n")) {
    if (line.startsWith("worktree ")) {
      flush();
      current = { path: line.slice("worktree ".length), branch: "", sha: "", detached: false };
    } else if (current && line.startsWith("HEAD ")) {
      current.sha = line.slice("HEAD ".length);
    } else if (current && line.startsWith("branch ")) {
      current.branch = line.replace(/^branch (refs\/heads\/)?/, "");
    } else if (current && line === "detached") {
      current.detached = true;
      current.branch = current.branch || "(detached)";
    }
  }
  flush();
  return items;
}

export function listBranches(root: string): {
  name: string;
  sha: string;
  isHead: boolean;
  isRemote: boolean;
  worktreePath: string;
  subject: string;
  updatedAt: string;
}[] {
  const format = "%(refname:short)%09%(objectname:short)%09%(HEAD)%09%(worktreepath)%09%(committerdate:iso-strict)%09%(subject)";
  const parse = (blob: string, isRemote: boolean) =>
    blob
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, sha, head, worktreePath, updatedAt, ...rest] = line.split("\t");
        return {
          name,
          sha: sha || "",
          isHead: head === "*",
          isRemote,
          worktreePath: worktreePath || "",
          subject: rest.join("\t") || "",
          updatedAt: updatedAt || "",
        };
      });

  try {
    const local = parse(runGit(root, ["for-each-ref", `--format=${format}`, "--sort=-committerdate", "refs/heads"]), false);
    let remote: ReturnType<typeof parse> = [];
    try {
      remote = parse(runGit(root, ["for-each-ref", `--format=${format}`, "--sort=-committerdate", "refs/remotes"]), true)
        .filter((item) => !item.name.endsWith("/HEAD"));
    } catch {
      remote = [];
    }
    const seen = new Set(local.map((item) => item.name));
    return [
      ...local,
      ...remote.filter((item) => {
        const short = item.name.replace(/^[^/]+\//, "");
        return !seen.has(short);
      }),
    ];
  } catch {
    return [];
  }
}

export function branchExists(root: string, branch: string): boolean {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: root });
  return result.status === 0;
}

export function addWorktree(root: string, dest: string, branch: string, base: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  const occupied = listLiveWorktrees(root).find((item) => item.branch === branch);
  if (occupied) {
    throw new GitError(
      `「${branch}」已经在别的目录检出了。先用那一棵，或换个任务名。`,
      occupied.path,
    );
  }
  if (branchExists(root, branch)) {
    runGit(root, ["worktree", "add", dest, branch]);
    return;
  }
  runGit(root, ["worktree", "add", "-b", branch, dest, base]);
}

export function removeWorktree(root: string, dest: string, force = false): void {
  const args = ["worktree", "remove", dest];
  if (force) args.push("--force");
  runGit(root, args);
}

export function isMerged(root: string, name: string, base: string): boolean {
  try {
    runGit(root, ["merge-base", "--is-ancestor", name, base]);
    return true;
  } catch {
    return false;
  }
}

export function mergedBranches(root: string, base: string): Set<string> {
  try {
    return new Set(
      runGit(root, ["for-each-ref", `--merged=${base}`, "--format=%(refname:short)", "refs/heads"])
        .split("\n")
        .filter(Boolean),
    );
  } catch {
    return new Set();
  }
}

export function deleteBranch(root: string, name: string, force = false): void {
  runGit(root, ["branch", force ? "-D" : "-d", name]);
}

function parseNameStatus(blob: string): string[] {
  const paths: string[] = [];
  for (const line of blob.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split("\t");
    if (parts.length >= 3 && /^R\d*/.test(parts[0])) {
      paths.push(parts[1], parts[2]);
      continue;
    }
    if (parts.length >= 2) {
      paths.push(parts[parts.length - 1]);
      continue;
    }
    paths.push(trimmed.split(/\s+/).pop() || trimmed);
  }
  return paths;
}

export function stagedFiles(cwd: string): string[] {
  return [
    ...new Set(
      parseNameStatus(runGit(cwd, ["diff", "--name-status", "--cached"]))
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith(".lattice/artifacts/")),
    ),
  ];
}

export function gitToplevel(cwd: string): string {
  return runGit(cwd, ["rev-parse", "--show-toplevel"]);
}

export function gitCommonDir(cwd: string): string {
  const raw = runGit(cwd, ["rev-parse", "--git-common-dir"]);
  if (raw.startsWith("/")) return raw;
  return join(cwd, raw);
}

export const ENGINE_TASK_COMMIT = "workzoon:";

export function isEngineOwnedDiff(filePath: string): boolean {
  const path = filePath.replace(/\\/g, "/");
  return (
    path.startsWith(".lattice/artifacts/") ||
    path.startsWith(".lattice/tasks/") ||
    path.startsWith(".lattice/handoffs/")
  );
}

export function featureHead(cwd: string, ref = "HEAD"): string {
  try {
    const log = runGit(cwd, ["log", "-30", "--format=%H %s", ref]);
    for (const line of log.split("\n")) {
      const text = line.trim();
      if (!text) continue;
      const sha = text.slice(0, 40);
      const msg = text.slice(41);
      if (sha.length >= 7 && !msg.startsWith(ENGINE_TASK_COMMIT)) return sha;
    }
    return runGit(cwd, ["rev-parse", ref]);
  } catch {
    return "";
  }
}

export function changedFiles(worktreePath: string, base: string): string[] {
  const committed = parseNameStatus(runGit(worktreePath, ["diff", "--name-status", `${base}...HEAD`]));
  const unstaged = parseNameStatus(runGit(worktreePath, ["diff", "--name-status"]));
  const staged = parseNameStatus(runGit(worktreePath, ["diff", "--name-status", "--cached"]));
  const untracked = runGit(worktreePath, ["ls-files", "--others", "--exclude-standard"]);
  return [
    ...new Set(
      [...committed, ...unstaged, ...staged, ...untracked.split("\n")]
        .map((line) => line.trim())
        .filter((line) => line && !isEngineOwnedDiff(line)),
    ),
  ];
}

export function changedOnBranch(repo: string, base: string, branch: string): string[] {
  try {
    return parseNameStatus(runGit(repo, ["diff", "--name-status", `${base}...${branch}`])).filter(
      (line) => line && !isEngineOwnedDiff(line),
    );
  } catch {
    return [];
  }
}

export function listRemotes(root: string): { name: string; url: string }[] {
  try {
    const raw = runGit(root, ["remote", "-v"]);
    const seen = new Set<string>();
    const remotes: { name: string; url: string }[] = [];
    for (const line of raw.split("\n")) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
      if (!match || seen.has(match[1])) continue;
      seen.add(match[1]);
      remotes.push({ name: match[1], url: match[2] });
    }
    return remotes;
  } catch {
    return [];
  }
}

export function isIgnored(root: string, relPath: string): boolean {
  const result = spawnSync("git", ["check-ignore", "-q", "--", relPath], { cwd: root });
  return result.status === 0;
}

export function applyWorktreeInclude(mainRoot: string, worktreePath: string): string[] {
  const includeFile = join(mainRoot, ".worktreeinclude");
  if (!existsSync(includeFile)) return [];
  const patterns = readFileSync(includeFile, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const copied: string[] = [];
  for (const pattern of patterns) {
    const source = join(mainRoot, pattern);
    if (!existsSync(source)) continue;
    if (!isIgnored(mainRoot, pattern)) continue;
    const dest = join(worktreePath, pattern);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(source, dest);
    copied.push(pattern);
  }
  return copied;
}
