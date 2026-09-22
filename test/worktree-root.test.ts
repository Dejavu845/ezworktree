import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { collapseWorktreesRoot, defaultWorktreesRoot, expandWorktreesRoot } from "../src/settings.ts";
import { slugify } from "../src/ids.ts";
import { createTask, initProject, openWorktree, plantBranch, plantNameRejectReason, plantRejectReason, updateAppSettings } from "../src/service.ts";
import { worktreeProjectFolder, worktreeRoot } from "../src/store.ts";

const HOME = mkdtempSync(join(tmpdir(), "wt-root-home-"));
process.env.LATTICE_HOME = HOME;
const HUMAN = { actor: "human" as const };
const repos: string[] = [];

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "wt-root-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "wtroot@test.local"]);
  runGit(root, ["config", "user.name", "WtRoot"]);
  writeFileSync(join(root, "README.md"), "# demo\n");
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  repos.push(root);
  return root;
}

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

describe("human-readable worktree root", () => {
  it("defaults to ~/Workzoon/worktrees when LATTICE_HOME is unset, else stays under the fixture home", () => {
    const prev = process.env.LATTICE_HOME;
    delete process.env.LATTICE_HOME;
    try {
      assert.equal(defaultWorktreesRoot(), join(homedir(), "Workzoon", "worktrees"));
      assert.equal(collapseWorktreesRoot(defaultWorktreesRoot()), "~/Workzoon/worktrees");
      assert.equal(expandWorktreesRoot("~/Workzoon/worktrees"), join(homedir(), "Workzoon", "worktrees"));
    } finally {
      process.env.LATTICE_HOME = prev;
    }
    assert.equal(defaultWorktreesRoot(), join(HOME, "worktrees"));
  });

  it("puts new trees under the project name, not the project id", () => {
    const repo = makeRepo();
    const project = initProject(repo, "Harbor", "studio");
    assert.equal(worktreeProjectFolder(project), "harbor");
    const { task } = createTask(repo, { title: "pay receipt", allowedPaths: ["app/**"] }, HUMAN);
    const { worktree } = openWorktree(repo, task.id, HUMAN);
    assert.ok(worktree.path.includes(`${join("harbor", task.slug)}`));
    assert.ok(!worktree.path.includes(project.id));
    assert.equal(worktree.path, worktreeRoot(project, task.slug));
  });

  it("does not move an existing worktree when the root setting changes", () => {
    const repo = makeRepo();
    initProject(repo, "Harbor", "studio");
    const { task } = createTask(repo, { title: "stay put", allowedPaths: ["app/**"] }, HUMAN);
    const first = openWorktree(repo, task.id, HUMAN);
    const original = first.worktree.path;
    assert.ok(existsSync(original));

    const nextRoot = join(HOME, "elsewhere");
    updateAppSettings({ worktreesRoot: nextRoot });
    const again = openWorktree(repo, task.id, HUMAN);
    assert.equal(again.worktree.path, original);
    assert.ok(existsSync(original));
    assert.ok(!existsSync(join(nextRoot, "harbor", task.slug)));
  });

  it("speaks Chinese when the dest directory already exists", () => {
    const repo = makeRepo();
    const project = initProject(repo, "Harbor", "studio");
    const { task } = createTask(repo, { title: "leftover dest", allowedPaths: ["app/**"] }, HUMAN);
    const dest = worktreeRoot(project, task.slug);
    mkdirSync(dest, { recursive: true });
    assert.match(plantRejectReason(dest), /已经有目录了/);
    assert.throws(() => openWorktree(repo, task.id, HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, plantRejectReason(dest));
      assert.equal((err as Error).message.includes("already exists"), false);
      return true;
    });

    const leftover = worktreeRoot(project, `plant-${slugify("feat/hold".replace(/\//g, "-"))}`);
    mkdirSync(leftover, { recursive: true });
    assert.throws(() => plantBranch(repo, "feat/hold", HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, plantRejectReason(leftover));
      assert.equal((err as Error).message.includes("already exists"), false);
      return true;
    });

    assert.equal(plantNameRejectReason(), "还没写要开出来的分支。");
    assert.throws(() => plantBranch(repo, "   ", HUMAN), (err: unknown) => {
      assert.equal((err as Error).message, plantNameRejectReason());
      assert.equal((err as Error).message.includes("Branch is required"), false);
      return true;
    });
  });
});
