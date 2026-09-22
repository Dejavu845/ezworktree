import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { runGit } from "../src/git.ts";
import { createTask, deleteBranch, initProject, openWorktree, plantBranch, projectHoldings, projectMap } from "../src/service.ts";
import { TopologyError, topologyRejectReason } from "../src/topology.ts";

const HOME = mkdtempSync(join(tmpdir(), "topology-home-"));
process.env.LATTICE_HOME = HOME;
const HUMAN = { actor: "human" as const };
const AGENT = { actor: "agent" as const };
const repos: string[] = [];

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "topology-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "topology@test.local"]);
  runGit(root, ["config", "user.name", "Topology"]);
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

describe("undeclared topology lens", () => {
  it("marks a raw git branch undeclared and leaves base plus managed tasks clean", () => {
    const repo = makeRepo();
    initProject(repo, "Harbor", "studio");
    runGit(repo, ["branch", "rogue/hand"]);
    const { task } = createTask(repo, { title: "declared lane", allowedPaths: ["app/**"] }, HUMAN);
    openWorktree(repo, task.id, HUMAN);

    const map = projectMap(repo);
    const rogue = map.lanes.find((item) => item.branch === "rogue/hand");
    const main = map.lanes.find((item) => item.branch === "main");
    const managed = map.lanes.find((item) => item.branch === `feat/${task.slug}`);
    assert.ok(rogue);
    assert.equal(rogue.undeclared, true);
    assert.equal(main?.undeclared, false);
    assert.equal(managed?.undeclared, false);
    assert.equal(managed?.managed, true);

    const holdings = projectHoldings(repo).markdown;
    assert.match(holdings, /## 清单外/);
    assert.match(holdings, /`rogue\/hand`/);
    assert.match(holdings, /Do not plant or delete branches listed under 清单外/);
  });

  it("blocks an agent from planting or deleting an undeclared branch, and does not delete it", () => {
    const repo = makeRepo();
    initProject(repo, "Harbor", "studio");
    runGit(repo, ["branch", "rogue/hand"]);

    assert.equal(topologyRejectReason("plantBranch", "rogue/hand"), "「rogue/hand」不在清单里。请你来创建 worktree，不要让助手自己开。");
    assert.throws(() => plantBranch(repo, "rogue/hand", AGENT), (err: unknown) => {
      assert.ok(err instanceof TopologyError);
      assert.equal(err.action, "plantBranch");
      assert.equal(err.branch, "rogue/hand");
      assert.equal(err.message, topologyRejectReason("plantBranch", "rogue/hand"));
      assert.equal(err.message.includes("HOLDINGS"), false);
      return true;
    });
    assert.throws(() => deleteBranch(repo, "rogue/hand", false, AGENT), (err: unknown) => {
      assert.ok(err instanceof TopologyError);
      assert.equal(err.action, "deleteBranch");
      assert.equal(err.message, topologyRejectReason("deleteBranch", "rogue/hand"));
      return true;
    });
    const still = runGit(repo, ["branch", "--list", "rogue/hand"]);
    assert.match(still, /rogue\/hand/);

    const planted = plantBranch(repo, "rogue/hand", HUMAN);
    assert.equal(planted.planted, true);
    assert.equal(projectMap(repo).lanes.find((item) => item.branch === "rogue/hand")?.undeclared, true);
  });

  it("still lets a human delete an undeclared branch after typing its name", () => {
    const repo = makeRepo();
    initProject(repo, "Harbor", "studio");
    runGit(repo, ["branch", "rogue/gone"]);
    deleteBranch(repo, "rogue/gone", false, HUMAN, "rogue/gone");
    const list = runGit(repo, ["branch", "--list", "rogue/gone"]);
    assert.equal(list.trim(), "");
  });
});
