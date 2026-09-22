import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { GRAPH_EDGE_KINDS, GRAPH_NODE_KINDS, processStripView } from "../src/graph.ts";
import { runGit } from "../src/git.ts";
import {
  createTask,
  initProject,
  openWorktree,
  pinProjectArtifact,
  projectGraph,
} from "../src/service.ts";

const HOME = mkdtempSync(join(tmpdir(), "graph-home-"));
process.env.LATTICE_HOME = HOME;
const HUMAN = { actor: "human" as const };
const repos: string[] = [];

after(() => {
  rmSync(HOME, { recursive: true, force: true });
  for (const repo of repos) rmSync(repo, { recursive: true, force: true });
});

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "graph-repo-"));
  runGit(root, ["init", "-b", "main"]);
  runGit(root, ["config", "user.email", "graph@test.local"]);
  runGit(root, ["config", "user.name", "Graph"]);
  mkdirSync(join(root, "app"), { recursive: true });
  writeFileSync(join(root, "app", "page.tsx"), "export default function Page() { return null }\n");
  writeFileSync(join(root, "README.md"), "# demo\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "-m", "init"]);
  return root;
}

describe("process graph", () => {
  it("reads repo, main, and the primary checkout with ref and checkout edges", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "GraphBase", "studio");
    runGit(repo, ["remote", "add", "origin", "https://example.com/demo.git"]);
    const graph = projectGraph(repo);
    const kinds = new Set(graph.nodes.map((node) => node.kind));
    const edgeKinds = new Set(graph.edges.map((item) => item.kind));
    assert.ok(kinds.has("repo"));
    assert.ok(kinds.has("branch"));
    assert.ok(kinds.has("worktree"));
    assert.equal(kinds.has("artifact"), false);
    assert.ok([...kinds].every((kind) => GRAPH_NODE_KINDS.includes(kind)));
    assert.ok([...edgeKinds].every((kind) => GRAPH_EDGE_KINDS.includes(kind)));
    assert.equal(graph.nodes.some((node) => node.kind === "repo" && node.label === "GraphBase"), true);
    assert.equal(graph.nodes.some((node) => node.kind === "branch" && node.label === "main"), true);
    assert.equal(graph.edges.some((item) => item.kind === "ref"), true);
    assert.equal(graph.edges.some((item) => item.kind === "checkout"), true);
    assert.equal(graph.nodes.some((node) => /agent|roster|human|remote|commit/i.test(node.kind + node.id + node.label)), false);
    assert.equal(graph.nodes.some((node) => node.label === "origin" || node.id.includes("remote")), false);
  });

  it("adds a task node and only opens the branch after the tree exists", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "GraphTask", "studio");
    const { task } = createTask(repo, { title: "graph card", allowedPaths: ["app/**"] }, HUMAN);
    const before = projectGraph(repo);
    assert.equal(before.nodes.some((node) => node.kind === "task" && node.taskId === task.id), true);
    assert.equal(before.nodes.some((node) => node.kind === "branch" && node.branch === `feat/${task.slug}`), false);
    assert.equal(before.edges.some((item) => item.kind === "open" && item.from === `task:${task.id}`), false);
    openWorktree(repo, task.id, HUMAN);
    const after = projectGraph(repo);
    const branchId = `branch:feat/${task.slug}`;
    assert.equal(after.nodes.some((node) => node.id === branchId), true);
    assert.equal(after.edges.some((item) => item.kind === "open" && item.from === `task:${task.id}` && item.to === branchId), true);
    assert.equal(after.edges.some((item) => item.kind === "checkout" && item.from === branchId), true);
  });

  it("pins an artifact as a node with pin and build edges and does not write extra files", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "GraphPin", "studio");
    mkdirSync(join(repo, "out"), { recursive: true });
    writeFileSync(join(repo, "out", "index.html"), "<html></html>\n");
    const pinned = pinProjectArtifact(repo, { name: "out" }, HUMAN);
    const graph = projectGraph(repo);
    const art = graph.nodes.find((node) => node.kind === "artifact");
    assert.ok(art);
    assert.equal(art?.artifactId, pinned.version.id);
    const pin = graph.edges.find((item) => item.kind === "pin" && item.to === `artifact:${pinned.version.id}`);
    assert.ok(pin);
    assert.equal(pin?.offBranch, false);
    assert.equal(graph.edges.some((item) => item.kind === "build" && item.to === `artifact:${pinned.version.id}`), true);
    assert.equal(existsSync(join(repo, ".lattice", "graph.json")), false);
    const kinds = new Set(graph.nodes.map((node) => node.kind));
    assert.deepEqual([...kinds].sort(), ["artifact", "branch", "repo", "worktree"].sort());
    const strip = processStripView(graph, { branch: "main", worktreePath: repo });
    assert.equal(strip.repoLabel, "GraphPin");
    assert.equal(strip.branchLabel, "1 · main");
    assert.equal(strip.treeLabel, "0 · 未检出");
    assert.equal(strip.worktrees, 0);
    assert.equal(strip.buildLabel, "×1");
    assert.equal(strip.artifacts, 1);
  });

  it("counts only planted checkouts on the process strip, not the primary", () => {
    const repo = makeRepo();
    repos.push(repo);
    initProject(repo, "GraphStrip", "studio");
    const empty = processStripView(projectGraph(repo), { branch: "main", worktreePath: repo });
    assert.equal(empty.worktrees, 0);
    assert.equal(empty.treeLabel, "0 · 未检出");
    assert.equal(empty.treeLabel.includes("主树"), false);
    const { task } = createTask(repo, { title: "strip bay", allowedPaths: ["app/**"] }, HUMAN);
    openWorktree(repo, task.id, HUMAN);
    const planted = projectGraph(repo);
    const bay = planted.nodes.find((node) => node.kind === "worktree" && node.path && node.path !== repo);
    assert.ok(bay?.path);
    const onBay = processStripView(planted, { branch: `feat/${task.slug}`, worktreePath: bay?.path });
    assert.equal(onBay.worktrees, 1);
    assert.match(onBay.treeLabel, /^1 · /);
    assert.equal(onBay.treeLabel.includes("主树"), false);
    const onMain = processStripView(planted, { branch: "main", worktreePath: repo });
    assert.equal(onMain.worktrees, 1);
    assert.equal(onMain.treeLabel, "1 · 未检出");
  });
});
