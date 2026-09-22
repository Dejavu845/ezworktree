import { existsSync, realpathSync } from "node:fs";
import { listArtifactVersions } from "./artifacts.ts";
import { listBranches, listLiveWorktrees } from "./git.ts";
import { plannedBranch } from "./lane.ts";
import type { GraphEdge, GraphEdgeKind, GraphNode, GraphNodeKind, ProcessGraph, ProcessStripView, Project } from "./types.ts";

export const GRAPH_NODE_KINDS: GraphNodeKind[] = ["repo", "branch", "worktree", "artifact", "task"];
export const GRAPH_EDGE_KINDS: GraphEdgeKind[] = ["ref", "checkout", "open", "build", "pin"];

function samePath(a: string, b: string): boolean {
  try {
    if (existsSync(a) && existsSync(b)) return realpathSync(a) === realpathSync(b);
  } catch {
    // compare raw
  }
  return a.replace(/\/$/, "") === b.replace(/\/$/, "");
}

function edge(kind: GraphEdgeKind, from: string, to: string, extra: Partial<GraphEdge> = {}): GraphEdge {
  return { id: `${kind}:${from}->${to}`, kind, from, to, ...extra };
}

/** Strip / gauge bays are planted checkouts. The primary repo root stays a graph node for pin/build edges. */
export function liveStripTrees(graph: ProcessGraph): GraphNode[] {
  return graph.nodes.filter(
    (node) => node.kind === "worktree" && Boolean(node.path) && !samePath(node.path || "", graph.rootPath),
  );
}

export function buildProcessGraph(project: Project): ProcessGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const repoId = `repo:${project.id}`;
  nodes.push({
    id: repoId,
    kind: "repo",
    label: project.name,
    path: project.rootPath,
  });

  const local = listBranches(project.rootPath).filter((item) => !item.isRemote);
  const branchIds = new Map<string, string>();
  for (const ref of local) {
    const id = `branch:${ref.name}`;
    branchIds.set(ref.name, id);
    nodes.push({
      id,
      kind: "branch",
      label: ref.name,
      branch: ref.name,
      sha12: ref.sha.slice(0, 12),
    });
    edges.push(edge("ref", repoId, id, { sha12: ref.sha.slice(0, 12) }));
  }

  const trees = listLiveWorktrees(project.rootPath);
  const treeIds: { id: string; path: string; branch: string }[] = [];
  for (const tree of trees) {
    const id = `worktree:${tree.path}`;
    treeIds.push({ id, path: tree.path, branch: tree.branch });
    nodes.push({
      id,
      kind: "worktree",
      label: tree.isPrimary ? "主树" : tree.branch || tree.path,
      path: tree.path,
      branch: tree.branch || undefined,
      sha12: tree.sha.slice(0, 12),
    });
    const branchId = tree.branch && tree.branch !== "(detached)" ? branchIds.get(tree.branch) : undefined;
    if (branchId) {
      edges.push(edge("checkout", branchId, id, { sha12: tree.sha.slice(0, 12) }));
    }
  }

  for (const task of project.tasks) {
    const id = `task:${task.id}`;
    const managed = project.worktrees.find((item) => item.id === task.worktreeId);
    const branch = managed?.branch || plannedBranch(task);
    nodes.push({
      id,
      kind: "task",
      label: task.title,
      branch,
      taskId: task.id,
    });
    const branchId = branchIds.get(branch);
    if (branchId) edges.push(edge("open", id, branchId));
  }

  const versions = listArtifactVersions(project);
  for (const version of versions) {
    const id = `artifact:${version.id}`;
    nodes.push({
      id,
      kind: "artifact",
      label: version.name,
      branch: version.branch,
      path: version.path,
      sha12: version.sha.slice(0, 12),
      artifactId: version.id,
    });
    const branchId = branchIds.get(version.branch);
    if (branchId) {
      edges.push(
        edge("pin", branchId, id, {
          sha12: version.sha.slice(0, 12),
          offBranch: !version.onBranch,
          behind: version.behind || undefined,
        }),
      );
    }
    const built = treeIds.find((tree) => samePath(tree.path, version.checkout));
    if (built) {
      edges.push(edge("build", built.id, id, { sha12: version.sha.slice(0, 12) }));
    }
  }

  return { rootPath: project.rootPath, nodes, edges };
}

export function processStripView(
  graph: ProcessGraph,
  selected: { branch?: string; worktreePath?: string } = {},
): ProcessStripView {
  const repo = graph.nodes.find((node) => node.kind === "repo");
  const branches = graph.nodes.filter((node) => node.kind === "branch");
  const trees = liveStripTrees(graph);
  const arts = graph.nodes.filter((node) => node.kind === "artifact");
  const branch = selected.branch ? branches.find((node) => node.branch === selected.branch) : undefined;
  const tree = selected.worktreePath
    ? trees.find((node) => node.path === selected.worktreePath)
    : selected.branch
      ? trees.find((node) => node.branch === selected.branch)
      : undefined;
  const pins = selected.branch ? arts.filter((node) => node.branch === selected.branch) : arts;
  const treeName = tree?.label || (selected.branch && !tree ? "未检出" : "");
  return {
    repoLabel: repo?.label || "仓",
    branchLabel: branch ? `${branches.length} · ${branch.label}` : String(branches.length),
    treeLabel: treeName ? `${trees.length} · ${treeName}` : String(trees.length),
    buildLabel: `×${pins.length}`,
    branches: branches.length,
    worktrees: trees.length,
    artifacts: arts.length,
  };
}
