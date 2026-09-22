import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { plannedBranch, taskRejectReason } from "../src/lane.ts";
import { createTask, initProject, openWorktree, projectMap } from "../src/service.ts";

const HOME = mkdtempSync(join(tmpdir(), "intent-home-"));
process.env.LATTICE_HOME = HOME;

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "intent-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "intent@test.local"]);
  runGit(root, ["config", "user.name", "Intent"]);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

const HUMAN = { actor: "human" as const };
const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

describe("task intent and stacked base", () => {
  it("defaults to feat/<slug> off main and does not plant a tree", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "IntentDefault", "studio");
    const { task } = createTask(repo, { title: "player bar", allowedPaths: ["app/**"] }, HUMAN);
    assert.equal(task.intent, "feat");
    assert.equal(task.baseBranch, "main");
    assert.equal(task.status, "backlog");
    assert.equal(task.worktreeId, undefined);
    assert.equal(plannedBranch(task), `feat/${task.slug}`);
    const lane = projectMap(repo).lanes.find((item) => item.taskId === task.id);
    assert.equal(lane?.branch, `feat/${task.slug}`);
    assert.equal(lane?.worktreePath, "");
    assert.equal(lane?.baseBranch, undefined);
  });

  it("opens spike and hotfix prefixes from the chosen base", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "IntentKinds", "studio");
    const spike = createTask(repo, { title: "try player", intent: "spike", allowedPaths: ["app/**"] }, HUMAN).task;
    const hot = createTask(repo, { title: "fix cdn", intent: "hotfix", allowedPaths: ["app/**"] }, HUMAN).task;
    const spiked = openWorktree(repo, spike.id, HUMAN).worktree;
    const fixed = openWorktree(repo, hot.id, HUMAN).worktree;
    assert.equal(spiked.branch, `spike/${spike.slug}`);
    assert.equal(fixed.branch, `hotfix/${hot.slug}`);
    assert.equal(spiked.baseBranch, "main");
    assert.ok(existsSync(spiked.path));
  });

  it("rejects invented intents", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "IntentClosed", "studio");
    assert.throws(
      () => createTask(repo, { title: "ui drawer", intent: "ui", allowedPaths: ["app/**"] }, HUMAN),
      (err: unknown) => {
        assert.equal((err as Error).message, taskRejectReason("intent"));
        return true;
      },
    );
    assert.throws(
      () => createTask(repo, { title: "later pile", intent: "later", allowedPaths: ["app/**"] }, HUMAN),
      (err: unknown) => {
        assert.equal((err as Error).message, taskRejectReason("intent"));
        return true;
      },
    );
  });

  it("rejects using its own planned branch as base", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "IntentSelfBase", "studio");
    runGit(repo, ["branch", "feat/ghost"]);
    assert.throws(
      () =>
        createTask(
          repo,
          { title: "ghost", slug: "ghost", baseBranch: "feat/ghost", allowedPaths: ["app/**"] },
          HUMAN,
        ),
      (err: unknown) => {
        assert.equal((err as Error).message, taskRejectReason("own-base"));
        assert.equal((err as Error).message.includes("own branch"), false);
        return true;
      },
    );
  });

  it("fills missing intent and base on old cards", () => {
    const repo = makeRepo();
    repos.push(repo);
    const project = initProject(repo, "IntentLegacy", "studio");
    const raw = JSON.parse(readFileSync(join(repo, ".lattice", "project.json"), "utf8"));
    raw.tasks = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        slug: "legacy",
        title: "legacy",
        status: "backlog",
        agent: "cursor",
        allowedPaths: ["app/**"],
        forbiddenPaths: [],
        layerIds: [],
        allowFrozenTouch: false,
        notes: "",
        createdAt: project.updatedAt,
        updatedAt: project.updatedAt,
      },
    ];
    writeFileSync(join(repo, ".lattice", "project.json"), `${JSON.stringify(raw, null, 2)}\n`);
    const { task } = createTask(repo, { title: "after load", allowedPaths: ["app/**"] }, HUMAN);
    assert.equal(task.intent, "feat");
    const loaded = JSON.parse(readFileSync(join(repo, ".lattice", "project.json"), "utf8"));
    const legacy = loaded.tasks.find((item: { slug: string }) => item.slug === "legacy");
    assert.equal(legacy.intent, "feat");
    assert.equal(legacy.baseBranch, "main");
  });

  it("stacks a follow-up on a live task branch", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "IntentStack", "studio");
    const first = createTask(repo, { title: "pay flow", allowedPaths: ["app/**"] }, HUMAN).task;
    const planted = openWorktree(repo, first.id, HUMAN).worktree;
    const follow = createTask(
      repo,
      { title: "pay receipt", intent: "feat", baseBranch: planted.branch, allowedPaths: ["app/**"] },
      HUMAN,
    ).task;
    assert.equal(follow.baseBranch, planted.branch);
    const tree = openWorktree(repo, follow.id, HUMAN).worktree;
    assert.equal(tree.branch, `feat/${follow.slug}`);
    assert.equal(tree.baseBranch, planted.branch);
    const lane = projectMap(repo).lanes.find((item) => item.taskId === follow.id);
    assert.equal(lane?.baseBranch, planted.branch);
  });

  it("rejects a missing base", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "IntentBase", "studio");
    assert.throws(
      () => createTask(repo, { title: "ghost", baseBranch: "feat/missing", allowedPaths: ["app/**"] }, HUMAN),
      (err: unknown) => {
        assert.equal((err as Error).message, taskRejectReason("base-missing", { name: "feat/missing" }));
        assert.equal((err as Error).message.includes("not found"), false);
        return true;
      },
    );
    assert.throws(
      () => createTask(repo, { title: "blank base", baseBranch: "   ", allowedPaths: ["app/**"] }, HUMAN),
      (err: unknown) => {
        assert.equal((err as Error).message, taskRejectReason("base-empty"));
        return true;
      },
    );
  });
});
