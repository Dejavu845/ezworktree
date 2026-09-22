import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { checkBlast } from "../src/blast.ts";
import { runGit } from "../src/git.ts";
import { isValidHandoff } from "../src/handoff.ts";
import {
  createTask,
  generateHandoff,
  initProject,
  markDone,
  openWorktree,
} from "../src/service.ts";
import { PolicyError } from "../src/policy.ts";
import type { Project, Task } from "../src/types.ts";

const HOME = mkdtempSync(join(tmpdir(), "lattice-home-"));
process.env.LATTICE_HOME = HOME;

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "lattice-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "lattice@test.local"]);
  runGit(root, ["config", "user.name", "Lattice"]);
  writeFileSync(join(root, "package.json"), "{}\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, ".env"), "SECRET=1\n");
  runGit(root, ["add", "package.json", "README.md", "app/page.tsx"]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

let repo = "";
let project: Project;

before(() => {
  repo = makeRepo();
  project = initProject(repo, "Harbor", "studio");
});

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

function taskWith(overrides: Partial<Task>, projectRef: Project): Task {
  return {
    id: "t",
    slug: "demo",
    title: "demo",
    status: "active",
    intent: "feat",
    baseBranch: "main",
    agent: "cursor",
    allowedPaths: [],
    forbiddenPaths: [],
    layerIds: [],
    allowFrozenTouch: false,
    notes: "",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("foundation invariants", () => {
  it("writes repo-local .lattice as source of truth", () => {
    assert.ok(project.rootPath === repo);
    assert.ok(project.charter.layers.some((layer) => layer.frozen));
  });

  it("blocks frozen layer edits unless explicitly allowed", () => {
    const task = taskWith({}, project);
    const blocked = checkBlast(project, task, ["package.json"]);
    assert.equal(blocked.verdict, "blocked");
    const allowed = checkBlast(project, taskWith({ allowFrozenTouch: true }, project), ["package.json"]);
    assert.equal(allowed.verdict, "ok");
    const scoped = checkBlast(project, taskWith({ layerIds: ["app"] }, project), ["package.json"]);
    assert.equal(scoped.verdict, "blocked");
  });

  it("blocks do-not-touch even when frozen touch is allowed", () => {
    const report = checkBlast(
      project,
      taskWith({ allowFrozenTouch: true }, project),
      [".env"],
    );
    assert.equal(report.verdict, "blocked");
    assert.ok(report.findings.some((item) => item.reason.includes("do-not-touch")));
  });

  it("treats allowedPaths as a closed set", () => {
    const report = checkBlast(
      project,
      taskWith({ allowedPaths: ["app/**"] }, project),
      ["lib/secret.ts"],
    );
    assert.equal(report.verdict, "blocked");
    const ok = checkBlast(project, taskWith({ allowedPaths: ["app/**"] }, project), ["app/page.tsx"]);
    assert.equal(ok.verdict, "ok");
  });

  it("warns on partial i18n triplets and lockfiles", () => {
    const report = checkBlast(
      project,
      taskWith({ allowedPaths: ["messages/**", "pnpm-lock.yaml"] }, project),
      ["messages/zh.json", "pnpm-lock.yaml"],
    );
    assert.equal(report.verdict, "warning");
  });

  it("creates one worktree per task under LATTICE_HOME, not /tmp vibe style", () => {
    const { task } = createTask(repo, { title: "Fix player", allowedPaths: ["app/**"] }, { actor: "human" });
    const { worktree } = openWorktree(repo, task.id, { actor: "human" });
    assert.ok(worktree.path.startsWith(HOME));
    assert.equal(worktree.branch, `feat/${task.slug}`);
    const again = openWorktree(repo, task.id, { actor: "human" });
    assert.equal(again.worktree.id, worktree.id);
  });

  it("refuses done without a valid handoff, then accepts after generate", () => {
    const { task } = createTask(repo, { title: "Scoped copy", allowedPaths: ["app/**"] }, { actor: "human" });
    assert.throws(() => markDone(repo, task.id, { actor: "human" }), /写完交接/);
    const { markdown } = generateHandoff(repo, task.id, {
      decisions: "Keep the player API.",
      nextAction: "Open the worktree and continue.",
    });
    assert.equal(isValidHandoff(markdown), true);
    const done = markDone(repo, task.id, { actor: "human" });
    assert.equal(done.tasks.find((item) => item.id === task.id)?.status, "done");
  });

  it("default caller (agent) cannot markDone under balanced", () => {
    const { task } = createTask(repo, { title: "Agent done", allowedPaths: ["app/**"] }, { actor: "human" });
    generateHandoff(repo, task.id, {
      decisions: "Keep the player API.",
      nextAction: "Ask a human to mark done.",
    });
    assert.throws(() => markDone(repo, task.id), (err: unknown) => {
      assert.ok(err instanceof PolicyError);
      assert.equal(err.code, "ask");
      assert.equal(err.action, "markDone");
      return true;
    });
  });
});
