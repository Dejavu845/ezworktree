import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { checkBlast } from "../src/blast.ts";
import { runGit } from "../src/git.ts";
import { createTask, generateHandoff, initProject, openWorktree } from "../src/service.ts";

const HOME = mkdtempSync(join(tmpdir(), "branch-files-home-"));
process.env.LATTICE_HOME = HOME;
const HUMAN = { actor: "human" as const };
const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "branch-files-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "branch-files@test.local"]);
  runGit(root, ["config", "user.name", "BranchFiles"]);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

function fixture(name = "BranchFiles"): string {
  const repo = makeRepo();
  repos.push(repo);
  initProject(repo, name, "studio");
  return repo;
}

function tracked(cwd: string, file: string): boolean {
  try {
    const listed = runGit(cwd, ["ls-files", "--", file]);
    return listed.split("\n").includes(file);
  } catch {
    return false;
  }
}

describe("task files on the task branch", () => {
  it("keeps Current task off the main AGENTS.md and on the worktree copy", () => {
    const repo = fixture("AgentsSplit");
    const { task } = createTask(repo, { title: "split agents", allowedPaths: ["app/**"] }, HUMAN);
    const { worktree } = openWorktree(repo, task.id, HUMAN);
    const main = readFileSync(join(repo, "AGENTS.md"), "utf8");
    assert.doesNotMatch(main, /Current task:/);
    assert.match(main, /main checkout/);
    assert.match(main, /listed worktree/);
    const tree = readFileSync(join(worktree.path, "AGENTS.md"), "utf8");
    assert.match(tree, /Current task: split agents/);
    assert.match(tree, new RegExp(`Allowed paths: app/\\*\\*`));
  });

  it("force-adds the task card on the planted branch and leaves a card-only task untracked", () => {
    const repo = fixture("CardTrack");
    const planted = createTask(repo, { title: "on branch", allowedPaths: ["app/**"] }, HUMAN);
    const { worktree } = openWorktree(repo, planted.task.id, HUMAN);
    const card = `.lattice/tasks/${planted.task.id}.md`;
    assert.equal(tracked(worktree.path, card), true);
    assert.equal(tracked(repo, card), false);
    assert.match(runGit(worktree.path, ["log", "-1", "--format=%s"]), /workzoon: task files/);
    const cardOnly = createTask(repo, { title: "card only", allowedPaths: ["app/**"] }, HUMAN);
    const lone = `.lattice/tasks/${cardOnly.task.id}.md`;
    assert.equal(existsSync(join(repo, lone)), true);
    assert.equal(tracked(repo, lone), false);
  });

  it("tracks the handoff on the task branch after generateHandoff", () => {
    const repo = fixture("HandoffTrack");
    const { task } = createTask(repo, { title: "handoff track", allowedPaths: ["app/**"] }, HUMAN);
    const { worktree } = openWorktree(repo, task.id, HUMAN);
    generateHandoff(repo, task.id, { decisions: "Keep the split.", nextAction: "Read the branch file." });
    const rel = `.lattice/handoffs/${task.id}.md`;
    assert.equal(tracked(worktree.path, rel), true);
    assert.match(readFileSync(join(worktree.path, rel), "utf8"), /agent-handoff v1/);
    assert.equal(tracked(repo, rel), false);
  });

  it("does not let blast block engine-owned task files outside allowedPaths", () => {
    const repo = fixture("BlastExempt");
    const { project, task } = createTask(repo, { title: "blast exempt", allowedPaths: ["app/**"] }, HUMAN);
    const card = `.lattice/tasks/${task.id}.md`;
    const handoff = `.lattice/handoffs/${task.id}.md`;
    const report = checkBlast(project, task, [card, handoff, "app/page.tsx"]);
    assert.equal(report.verdict, "ok");
    assert.ok(report.findings.some((item) => item.path === card && item.reason.includes("engine-owned")));
    assert.ok(report.findings.some((item) => item.path === handoff && item.reason.includes("engine-owned")));
  });
});
