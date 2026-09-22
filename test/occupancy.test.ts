import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { plannedBranch } from "../src/lane.ts";
import { repoMap } from "../src/map.ts";
import { occupancyForTask, occupancyForProject, onDutySatellites } from "../src/occupancy.ts";
import type { Occupancy } from "../src/types.ts";
import {
  createTask,
  generateHandoff,
  initProject,
  openWorktree,
  plantBranch,
  snapshotWithMaps,
  updatePolicy,
} from "../src/service.ts";
import { loadProject } from "../src/store.ts";

const HOME = mkdtempSync(join(tmpdir(), "occupancy-home-"));
process.env.LATTICE_HOME = HOME;

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "occupancy-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "occupancy@test.local"]);
  runGit(root, ["config", "user.name", "Occupancy"]);
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

function fixture(name = "Board"): string {
  const repo = makeRepo();
  repos.push(repo);
  initProject(repo, name, "studio");
  return repo;
}

function cell(row: ReturnType<typeof occupancyForTask>, id: string) {
  return row.evidence.find((item) => item.id === id);
}

describe("derived occupancy board", () => {
  it("gives a backlog card doing copy and 0/6 evidence without planting a tree", () => {
    const repo = fixture("OccCard");
    const { task } = createTask(repo, { title: "player bar", allowedPaths: ["app/**"] }, HUMAN);
    const row = occupancyForTask(
      loadProject(repo)!,
      task,
    );
    assert.equal(row.doing, "待办，尚未开树");
    assert.equal(row.branch, `feat/${task.slug}`);
    assert.equal(row.lit, 0);
    assert.equal(row.denom, 6);
    assert.equal(cell(row, "tree")?.lit, false);
    assert.equal(cell(row, "diff")?.lit, false);
    assert.equal(cell(row, "blast")?.lit, false);
    assert.match(row.doing, /./);
    assert.doesNotMatch(row.doing, /%/);
  });

  it("lights the tree cell after openWorktree and still has derived doing", () => {
    const repo = fixture("OccTree");
    const { task } = createTask(repo, { title: "open tree", allowedPaths: ["app/**"] }, HUMAN);
    openWorktree(repo, task.id, HUMAN);
    const project = loadProject(repo)!;
    const live = project.tasks[0];
    const row = occupancyForTask(project, live);
    assert.equal(cell(row, "tree")?.lit, true);
    assert.equal(cell(row, "diff")?.lit, false);
    assert.equal(cell(row, "blast")?.lit, false);
    assert.equal(row.doing, "init");
    assert.ok(row.denom === 6);
    assert.ok(row.lit >= 1);
    const brief = readFileSync(join(project.worktrees[0].path, "WORKZOON.md"), "utf8");
    assert.doesNotMatch(brief, /%/);
    assert.doesNotMatch(brief, /完成度/);
    assert.doesNotMatch(brief, /证据/);
  });

  it("lights the tree cell from a live checkout when worktreeId is missing", () => {
    const repo = fixture("OccPlant");
    const { task } = createTask(repo, { title: "live plant", allowedPaths: ["app/**"] }, HUMAN);
    const planted = plantBranch(repo, plannedBranch(task), HUMAN);
    assert.equal(planted.planted, true);
    const project = loadProject(repo)!;
    const live = project.tasks.find((item) => item.id === task.id) || task;
    assert.equal(live.worktreeId, undefined);
    const row = occupancyForTask(project, live, { map: repoMap(project) });
    assert.equal(cell(row, "tree")?.lit, true);
    assert.ok(row.denom === 6);
    assert.ok(row.lit >= 1);
  });

  it("lights the tree cell when worktreeId is stale but an active tree still belongs to the task", () => {
    const repo = fixture("OccStaleId");
    const { task } = createTask(repo, { title: "stale id", allowedPaths: ["app/**"] }, HUMAN);
    openWorktree(repo, task.id, HUMAN);
    const project = loadProject(repo)!;
    const live = project.tasks.find((item) => item.id === task.id)!;
    assert.ok(live.worktreeId);
    live.worktreeId = "missing-worktree-id";
    const row = occupancyForTask(project, live, { map: repoMap(project) });
    assert.equal(cell(row, "tree")?.lit, true);
  });

  it("uses dirty paths as doing and lights diff + blast when the edit is in scope", () => {
    const repo = fixture("OccDirty");
    const { task } = createTask(repo, { title: "dirty player", allowedPaths: ["app/**"] }, HUMAN);
    const { worktree } = openWorktree(repo, task.id, HUMAN);
    writeFileSync(join(worktree.path, "app", "page.tsx"), "export default function Page() { return 1 }\n");
    const project = loadProject(repo)!;
    const row = occupancyForTask(project, project.tasks[0]);
    assert.match(row.doing, /app\/page\.tsx/);
    assert.equal(cell(row, "tree")?.lit, true);
    assert.equal(cell(row, "diff")?.lit, true);
    assert.equal(cell(row, "blast")?.lit, true);
    assert.equal(row.blast, "ok");
  });

  it("does not light blast when the only diff is blocked", () => {
    const repo = fixture("OccBlast");
    const { task } = createTask(repo, { title: "touch lock", allowedPaths: ["app/**"] }, HUMAN);
    const { worktree } = openWorktree(repo, task.id, HUMAN);
    writeFileSync(join(worktree.path, "package.json"), "{}\n");
    const project = loadProject(repo)!;
    const row = occupancyForTask(project, project.tasks[0]);
    assert.equal(cell(row, "diff")?.lit, true);
    assert.equal(cell(row, "blast")?.lit, false);
    assert.equal(row.blast, "blocked");
  });

  it("lights handoff but not filled on a generated placeholder", () => {
    const repo = fixture("OccHandoff");
    const { task } = createTask(repo, { title: "handoff empty", allowedPaths: ["app/**"] }, HUMAN);
    openWorktree(repo, task.id, HUMAN);
    generateHandoff(repo, task.id);
    const project = loadProject(repo)!;
    const row = occupancyForTask(project, project.tasks[0]);
    assert.equal(cell(row, "handoff")?.lit, true);
    assert.equal(cell(row, "filled")?.lit, false);
  });

  it("lights filled when decisions and next action are written", () => {
    const repo = fixture("OccFilled");
    const { task } = createTask(repo, { title: "handoff filled", allowedPaths: ["app/**"] }, HUMAN);
    openWorktree(repo, task.id, HUMAN);
    generateHandoff(repo, task.id, { decisions: "Keep the player bar.", nextAction: "Open the inspector." });
    const project = loadProject(repo)!;
    const row = occupancyForTask(project, project.tasks[0]);
    assert.equal(cell(row, "handoff")?.lit, true);
    assert.equal(cell(row, "filled")?.lit, true);
  });

  it("skips the wiki cell when gate is off so the denominator drops", () => {
    const repo = fixture("OccWiki");
    updatePolicy(repo, { wiki: { gate: "off" } } as never, HUMAN);
    const { task } = createTask(repo, { title: "wiki off", allowedPaths: ["app/**"] }, HUMAN);
    const project = loadProject(repo)!;
    const row = occupancyForTask(project, project.tasks.find((item: { id: string }) => item.id === task.id) || task);
    assert.equal(cell(row, "wiki")?.skipped, true);
    assert.equal(cell(row, "wiki")?.lit, false);
    assert.equal(row.denom, 5);
  });

  it("puts occupancy on the snapshot and writes no pulse files", () => {
    const repo = fixture("OccSnap");
    const { task } = createTask(repo, { title: "snap row", allowedPaths: ["app/**"] }, HUMAN);
    const snap = snapshotWithMaps();
    const board = snap.occupancy.find((item) => item.rootPath === repo);
    assert.ok(board);
    const row = board?.rows.find((item) => item.taskId === task.id);
    assert.equal(row?.doing, "待办，尚未开树");
    assert.equal(row?.denom, 6);
    assert.equal(existsSync(join(repo, ".lattice", "pulses")), false);
    const rows = occupancyForProject(
      loadProject(repo)!,
    );
    assert.equal(rows.length, 1);
  });
});

describe("on-duty satellite", () => {
  it("keeps at most 5 live pulses and skips derived rows", () => {
    const rows = Array.from({ length: 7 }, (_, index) => ({
      taskId: `t${index}`,
      doing: `work ${index}`,
      doingFrom: index === 0 ? "derived" : "pulse",
      pulse:
        index === 0
          ? undefined
          : { writtenAt: `2026-09-13T10:0${index}:00.000Z`, cite: { kind: "sha" as const, value: "abc" } },
    })) as Occupancy[];
    const duty = onDutySatellites(rows);
    assert.equal(duty.length, 5);
    assert.equal(duty[0]?.taskId, "t6");
    assert.equal(duty.every((row) => row.doingFrom === "pulse"), true);
  });
});
