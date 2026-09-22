import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { laneHygiene } from "../src/map.ts";
import { defaultPolicy } from "../src/policy.ts";
import { createTask, generateHandoff, initProject, openWorktree, projectMap } from "../src/service.ts";
import type { Project, RepoLane, Task, Worktree } from "../src/types.ts";

const HOME = mkdtempSync(join(tmpdir(), "hygiene-home-"));
process.env.LATTICE_HOME = HOME;

const OLD = "2020-01-01T00:00:00Z";

function withCommitterDate(date: string, fn: () => void): void {
  const prevC = process.env.GIT_COMMITTER_DATE;
  const prevA = process.env.GIT_AUTHOR_DATE;
  process.env.GIT_COMMITTER_DATE = date;
  process.env.GIT_AUTHOR_DATE = date;
  try {
    fn();
  } finally {
    if (prevC === undefined) delete process.env.GIT_COMMITTER_DATE;
    else process.env.GIT_COMMITTER_DATE = prevC;
    if (prevA === undefined) delete process.env.GIT_AUTHOR_DATE;
    else process.env.GIT_AUTHOR_DATE = prevA;
  }
}

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "hygiene-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "hygiene@test.local"]);
  runGit(root, ["config", "user.name", "Hygiene"]);
  writeFileSync(join(root, "README.md"), "# demo\n");
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  runGit(root, ["add", "."]);
  withCommitterDate(OLD, () => runGit(root, ["commit", "-m", "init"]));

  runGit(root, ["checkout", "-b", "old-feature"]);
  writeFileSync(join(root, "old.txt"), "old\n");
  runGit(root, ["add", "old.txt"]);
  withCommitterDate(OLD, () => runGit(root, ["commit", "-m", "old feature"]));
  runGit(root, ["checkout", "main"]);

  runGit(root, ["checkout", "-b", "landed"]);
  writeFileSync(join(root, "landed.txt"), "ok\n");
  runGit(root, ["add", "landed.txt"]);
  withCommitterDate(OLD, () => runGit(root, ["commit", "-m", "landed"]));
  runGit(root, ["checkout", "main"]);
  runGit(root, ["merge", "--ff-only", "landed"]);

  runGit(root, ["update-ref", "refs/remotes/origin/ghost", runGit(root, ["rev-parse", "HEAD"])]);
  return root;
}

function lane(map: ReturnType<typeof projectMap>, branch: string): RepoLane {
  const found = map.lanes.find((item) => item.branch === branch);
  assert.ok(found, `missing lane ${branch}`);
  return found;
}

let repo = "";

before(() => {
  repo = makeRepo();
  initProject(repo, "Harbor", "studio");
});

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

describe("hygiene lens", () => {
  it("marks ff-merged landed, leaves old-feature unmerged, and exempts main", () => {
    const map = projectMap(repo);
    const landed = lane(map, "landed");
    const feature = lane(map, "old-feature");
    const main = lane(map, "main");
    assert.equal(landed.merged, true);
    assert.ok(landed.hygiene.includes("merged"));
    assert.equal(feature.merged, false);
    assert.ok(!feature.hygiene.includes("merged"));
    assert.deepEqual(main.hygiene, []);
    assert.equal(main.merged, false);
  });

  it("marks old-feature stale from 2020 committerdate and exempts old main", () => {
    const map = projectMap(repo);
    const feature = lane(map, "old-feature");
    const main = lane(map, "main");
    assert.ok(feature.hygiene.includes("stale"));
    assert.match(feature.updatedAt, /^2020-01-01/);
    assert.deepEqual(main.hygiene, []);
  });

  it("tags a new managed worktree as no-handoff until generateHandoff", () => {
    const { task } = createTask(repo, { title: "hygiene-handoff", allowedPaths: ["app/**"] }, { actor: "human" });
    openWorktree(repo, task.id, { actor: "human" });
    const before = lane(projectMap(repo), `feat/${task.slug}`);
    assert.ok(!before.hygiene.includes("stale"));
    assert.ok(!before.hygiene.includes("merged"));
    assert.ok(before.hygiene.includes("no-handoff"));
    generateHandoff(repo, task.id, { decisions: "Keep going.", nextAction: "Write the handoff." });
    const after = lane(projectMap(repo), `feat/${task.slug}`);
    assert.deepEqual(after.hygiene, []);
    const holdings = readFileSync(join(repo, ".lattice", "HOLDINGS.md"), "utf8");
    assert.match(holdings, /## 卫生/);
  });

  it("treats refs/remotes/origin/ghost as remote with empty hygiene", () => {
    const map = projectMap(repo);
    const ghost = map.lanes.find((item) => item.branch === "origin/ghost" || item.branch.endsWith("/ghost"));
    assert.ok(ghost, "missing origin/ghost lane");
    assert.equal(ghost.isRemote, true);
    assert.deepEqual(ghost.hygiene, []);
  });

  it("laneHygiene returns merged, stale, and no-handoff in order", () => {
    const root = mkdtempSync(join(tmpdir(), "hygiene-direct-"));
    const task: Task = {
      id: "t1",
      slug: "old",
      title: "old",
      status: "active",
      intent: "feat",
      baseBranch: "main",
      agent: "cursor",
      allowedPaths: [],
      forbiddenPaths: [],
      layerIds: [],
      allowFrozenTouch: false,
      notes: "",
      createdAt: OLD,
      updatedAt: OLD,
      worktreeId: "w1",
    };
    const tree: Worktree = {
      id: "w1",
      taskId: "t1",
      path: join(root, "tree"),
      branch: "lattice/old",
      baseBranch: "main",
      status: "active",
      createdAt: OLD,
    };
    const project: Project = {
      id: "p",
      name: "p",
      rootPath: root,
      baseBranch: "main",
      charter: { version: 1, purpose: "", architecture: "", conventions: [], doNotTouch: [], layers: [] },
      policy: defaultPolicy("balanced"),
      tasks: [task],
      worktrees: [tree],
      handoffs: [],
      updatedAt: OLD,
    };
    const sample: RepoLane = {
      id: "task:t1",
      branch: "lattice/old",
      sha: "deadbeef",
      isHead: false,
      isRemote: false,
      worktreePath: tree.path,
      subject: "old",
      managed: true,
      taskId: "t1",
      taskTitle: "old",
      taskStatus: "active",
      updatedAt: OLD,
      merged: false,
      hygiene: [],
      undeclared: false,
    };
    const result = laneHygiene(sample, {
      now: Date.parse("2026-09-13T00:00:00Z"),
      baseBranch: "main",
      baseSha: "cafebabe",
      mergedSet: new Set(["lattice/old"]),
      project,
    });
    assert.deepEqual(result.hygiene, ["merged", "stale", "no-handoff"]);
    assert.equal(result.merged, true);
    rmSync(root, { recursive: true, force: true });
  });
});
