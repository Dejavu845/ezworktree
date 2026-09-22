import type { GraphNode, Occupancy, ProcessGraph, ProcessStep } from "./api";

export type ProcessStripView = {
  repoLabel: string;
  branchLabel: string;
  treeLabel: string;
  buildLabel: string;
  branches: number;
  worktrees: number;
  artifacts: number;
};

export const PROCESS_STEPS: { id: ProcessStep; kicker: string }[] = [
  { id: "repo", kicker: "来源" },
  { id: "branch", kicker: "分支" },
  { id: "worktree", kicker: "检出" },
  { id: "artifact", kicker: "构建" },
];

function samePath(a: string, b: string): boolean {
  return a.replace(/\/$/, "") === b.replace(/\/$/, "");
}

/** Strip / gauge bays are planted checkouts. The primary repo root stays a graph node for pin/build edges. */
export function liveStripTrees(graph: ProcessGraph): GraphNode[] {
  return graph.nodes.filter(
    (node) => node.kind === "worktree" && Boolean(node.path) && !samePath(node.path || "", graph.rootPath),
  );
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

export function stripLabel(view: ProcessStripView, step: ProcessStep): string {
  if (step === "repo") return view.repoLabel;
  if (step === "branch") return view.branchLabel;
  if (step === "worktree") return view.treeLabel;
  return view.buildLabel;
}

export function onDutySatellites(rows: Occupancy[], cap = 5): Occupancy[] {
  return rows
    .filter((row) => row.doingFrom === "pulse" && row.pulse)
    .sort((a, b) => (b.pulse?.writtenAt || "").localeCompare(a.pulse?.writtenAt || ""))
    .slice(0, cap);
}
