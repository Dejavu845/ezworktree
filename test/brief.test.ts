import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { changedFiles, runGit } from "../src/git.ts";
import { excludeGovernance, syncGovernanceToWorktree } from "../src/inject.ts";
import { createTask, generateHandoff, initProject, openWorktree, plantBranch } from "../src/service.ts";

const HOME = mkdtempSync(join(tmpdir(), "brief-home-"));
process.env.LATTICE_HOME = HOME;

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "brief-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "brief@test.local"]);
  runGit(root, ["config", "user.name", "Brief"]);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  writeFileSync(join(root, "package.json"), "{}\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

function fixture(): string {
  const repo = makeRepo();
  repos.push(repo);
  initProject(repo, "Harbor", "studio");
  return repo;
}

function ignored(cwd: string, file: string): boolean {
  try {
    runGit(cwd, ["check-ignore", "-q", "--", file]);
    return true;
  } catch {
    return false;
  }
}

function excludePath(cwd: string): string {
  const rel = runGit(cwd, ["rev-parse", "--git-path", "info/exclude"]);
  return rel.startsWith("/") ? rel : join(cwd, rel);
}

describe("WORKZOON.md worktree brief", () => {
  it("renders task fields and puts WORKZOON.md in the resume prompt", () => {
    const repo = fixture();
    const { task } = createTask(repo, { title: "brief-open", allowedPaths: ["app/**"] });
    const { worktree } = openWorktree(repo, task.id);
    const dest = join(worktree.path, "WORKZOON.md");
    assert.ok(existsSync(dest));
    const body = readFileSync(dest, "utf8");
    assert.match(body, new RegExp(`<!-- workzoon-brief v1 · task: ${task.id}`));
    assert.match(body, /Task: brief-open \(`brief-open`\)/);
    assert.match(body, new RegExp(`Branch: feat/${task.slug}`));
    assert.ok(body.includes(`Worktree: ${worktree.path}`));
    assert.ok(body.includes(`Repo: ${repo}`));
    assert.match(body, /Allowed: app\/\*\*/);
    assert.match(body, new RegExp(`\\.lattice/handoffs/${task.id}\\.md`));
    const { prompt } = generateHandoff(repo, task.id);
    assert.match(prompt, /WORKZOON\.md/);
  });

  it("includes the cloud fallback sentence with handoff and branch", () => {
    const repo = fixture();
    const { task } = createTask(repo, { title: "brief-cloud", allowedPaths: ["app/**"] });
    const { worktree } = openWorktree(repo, task.id);
    const body = readFileSync(join(worktree.path, "WORKZOON.md"), "utf8");
    assert.match(body, /cannot see untracked files/);
    const line = body.split("\n").find((item) => item.includes("cannot see untracked files")) || "";
    assert.ok(line.includes(`.lattice/handoffs/${task.id}.md`));
    assert.ok(line.includes(`feat/${task.slug}`));
  });

  it("excludes the brief from git and blast lists", () => {
    const repo = fixture();
    const { task } = createTask(repo, { title: "brief-ignore", allowedPaths: ["app/**"] });
    const { worktree } = openWorktree(repo, task.id);
    assert.equal(ignored(worktree.path, "WORKZOON.md"), true);
    assert.equal(ignored(worktree.path, "AGENTS.md"), true);
    assert.equal(ignored(worktree.path, ".lattice/charter.md"), true);
    const files = changedFiles(worktree.path, "main");
    assert.ok(!files.includes("WORKZOON.md"));
    assert.ok(!files.some((item) => item.startsWith(".lattice/")));
  });

  it("writes exclude on the shared common dir and does not duplicate lines", () => {
    const repo = fixture();
    const { task } = createTask(repo, { title: "brief-dup", allowedPaths: ["app/**"] });
    const { worktree } = openWorktree(repo, task.id);
    assert.equal(realpathSync(excludePath(worktree.path)), realpathSync(join(repo, ".git", "info", "exclude")));
    openWorktree(repo, task.id);
    const text = readFileSync(excludePath(worktree.path), "utf8");
    assert.equal(text.split("\n").filter((line) => line.trim() === "WORKZOON.md").length, 1);
    assert.equal(text.split("\n").filter((line) => line.trim() === ".lattice/").length, 1);
  });

  it("overwrites a hand-edited brief on generateHandoff", () => {
    const repo = fixture();
    const { task } = createTask(repo, { title: "brief-overwrite", allowedPaths: ["app/**"] });
    const { worktree } = openWorktree(repo, task.id);
    const dest = join(worktree.path, "WORKZOON.md");
    writeFileSync(dest, "# mine\n");
    generateHandoff(repo, task.id);
    const body = readFileSync(dest, "utf8");
    assert.doesNotMatch(body, /^# mine$/m);
    assert.match(body, /workzoon-brief v1/);
  });

  it("plants a branch with a no-task brief", () => {
    const repo = fixture();
    runGit(repo, ["branch", "feature/hold"]);
    const planted = plantBranch(repo, "feature/hold", { actor: "human" });
    const body = readFileSync(join(planted.path, "WORKZOON.md"), "utf8");
    assert.match(body, /Task: none/);
    assert.match(body, /Branch: feature\/hold/);
    assert.doesNotMatch(body, /handoffs\/[0-9a-f-]{36}\.md/);
    assert.doesNotMatch(body, /Frozen touch/);
  });

  it("writes Frozen touch YES with the escalation reason", () => {
    const repo = fixture();
    const { task } = createTask(
      repo,
      { title: "brief-esc", allowedPaths: ["app/**"], allowFrozenTouch: true, escalationReason: "need lockfile bump" },
      { actor: "human" },
    );
    const { worktree } = openWorktree(repo, task.id, { actor: "human" });
    const body = readFileSync(join(worktree.path, "WORKZOON.md"), "utf8");
    assert.match(body, /Frozen touch: YES/);
    assert.match(body, /need lockfile bump/);
    const plain = createTask(repo, { title: "brief-plain", allowedPaths: ["app/**"] });
    const opened = openWorktree(repo, plain.task.id);
    assert.match(readFileSync(join(opened.worktree.path, "WORKZOON.md"), "utf8"), /Frozen touch: NO/);
  });

  it("stays silent on bad dest and never invents paths or LATTICE.md", () => {
    const repo = fixture();
    assert.doesNotThrow(() => excludeGovernance("/nonexistent"));
    const loose = mkdtempSync(join(tmpdir(), "brief-loose-"));
    repos.push(loose);
    const project = initProject(repo, "Harbor", "studio");
    assert.doesNotThrow(() => syncGovernanceToWorktree(project, loose));
    const body = readFileSync(join(loose, "WORKZOON.md"), "utf8");
    assert.doesNotMatch(body, /LATTICE\.md/);
    assert.doesNotMatch(body, /%/);
    const abs = body.match(/`?(\/(?:tmp|workspace|home|Users)[^`\s]*)`?/g) || [];
    for (const token of abs) {
      const path = token.replace(/`/g, "");
      assert.ok(path.startsWith(repo) || path.startsWith(loose), path);
    }
  });
});
