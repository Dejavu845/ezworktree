import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { plannedBranch } from "../src/lane.ts";
import { bayPath, isDeckBay, liveBayCount, repoMap } from "../src/map.ts";
import { archiveWorktree, createTask, initProject, openWorktree, plantBranch, projectMap } from "../src/service.ts";
import { loadProject } from "../src/store.ts";

const HOME = mkdtempSync(join(tmpdir(), "deck-home-"));
process.env.LATTICE_HOME = HOME;

const HUMAN = { actor: "human" as const };
const repos: string[] = [];

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "deck-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "deck@test.local"]);
  runGit(root, ["config", "user.name", "Deck"]);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  repos.push(root);
  return root;
}

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

describe("deck bays", () => {
  it("keeps the primary checkout off the deck and drops archived leftover paths", () => {
    const repo = makeRepo();
    initProject(repo, "DeckArchive", "studio");
    const { task } = createTask(repo, { title: "player bar", allowedPaths: ["app/**"] }, HUMAN);
    const planted = openWorktree(repo, task.id, HUMAN);
    const before = projectMap(repo);
    const live = before.lanes.find((lane) => lane.taskId === task.id);
    const main = before.lanes.find((lane) => lane.branch === "main");
    assert.equal(live?.worktreePath, planted.worktree.path);
    assert.equal(isDeckBay(live || {}, repo), true);
    assert.equal(bayPath(live?.worktreePath, repo), planted.worktree.path);
    assert.equal(main?.worktreePath, repo);
    assert.equal(isDeckBay(main || {}, repo), false);
    assert.equal(bayPath(main?.worktreePath, repo), "");
    assert.equal(bayPath(repo, repo), "");

    archiveWorktree(repo, task.id, false, HUMAN, planted.worktree.branch);
    const project = loadProject(repo)!;
    const leftover = project.worktrees.find((item) => item.id === planted.worktree.id);
    assert.equal(leftover?.status, "archived");
    assert.ok(leftover?.path);
    assert.equal(existsSync(leftover.path), false);

    const after = repoMap(project);
    const archived = after.lanes.find((lane) => lane.taskId === task.id);
    assert.equal(archived?.worktreePath, "");
    assert.equal(isDeckBay(archived || {}, repo), false);
    assert.equal(bayPath(archived?.worktreePath, repo), "");
    assert.equal(liveBayCount(before.lanes, repo), 1);
    assert.equal(liveBayCount(after.lanes, repo), 0);
  });

  it("still seats a live plant that was never bound to worktreeId", () => {
    const repo = makeRepo();
    initProject(repo, "DeckPlant", "studio");
    const { task } = createTask(repo, { title: "live plant", allowedPaths: ["app/**"] }, HUMAN);
    const planted = plantBranch(repo, plannedBranch(task), HUMAN);
    assert.equal(planted.planted, true);
    const project = loadProject(repo)!;
    assert.equal(project.tasks.find((item) => item.id === task.id)?.worktreeId, undefined);
    const map = repoMap(project);
    const lane = map.lanes.find((item) => item.taskId === task.id);
    assert.ok(lane?.worktreePath);
    assert.notEqual(lane?.worktreePath, repo);
    assert.equal(isDeckBay(lane || {}, repo), true);
    assert.equal(liveBayCount(map.lanes, repo), 1);
  });
});
