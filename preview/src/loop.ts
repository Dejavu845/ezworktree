export const LOOP_STEPS = ["card", "tree", "pulse", "handoff", "done"] as const;
export type LoopStep = (typeof LOOP_STEPS)[number];

export type LoopInput = {
  status: "backlog" | "active" | "review" | "done" | "blocked";
  planted: boolean;
  pulse: boolean;
  handoff: boolean;
  filled?: boolean;
  wikiBlocked?: boolean;
};

export type LoopView = {
  current: LoopStep;
  next: LoopStep | null;
  verb: string;
  hint: string;
  lit: Record<LoopStep, boolean>;
};

export const LOOP_LABEL: Record<LoopStep, string> = {
  card: "卡",
  tree: "树",
  pulse: "心跳",
  handoff: "交接",
  done: "完成",
};

const VERB: Record<LoopStep, string> = {
  card: "已建卡",
  tree: "创建 worktree",
  pulse: "登记心跳",
  handoff: "写交接",
  done: "标记完成",
};

const HINT: Record<LoopStep, string> = {
  card: "卡在任务车道里。",
  tree: "对照里创建独立工作区。只给打开办法，不替你开软件。",
  pulse: "写正在做。点源码文件可标改了哪；没有改动就标现在的版本。",
  handoff: "写决定和下一步，生成交接文件。",
  done: "写完交接才能完成。百科还拦着就先把原文写进百科。",
};

export function taskLoop(input: LoopInput): LoopView {
  const lit: Record<LoopStep, boolean> = {
    card: true,
    tree: input.planted,
    pulse: input.pulse,
    handoff: input.handoff,
    done: input.status === "done",
  };
  if (lit.done) {
    return { current: "done", next: null, verb: "已完成", hint: "这条任务已经完成。", lit };
  }
  if (!lit.tree) {
    if (input.status !== "review") {
      return { current: "tree", next: "tree", verb: VERB.tree, hint: HINT.tree, lit };
    }
    if (!lit.handoff) {
      return {
        current: "handoff",
        next: "handoff",
        verb: VERB.handoff,
        hint: "树已归档或不在。写决定和下一步，生成交接。",
        lit,
      };
    }
  }
  if (!lit.pulse && !lit.handoff) {
    return { current: "pulse", next: "pulse", verb: VERB.pulse, hint: HINT.pulse, lit };
  }
  if (!lit.handoff || input.filled === false) {
    return {
      current: "handoff",
      next: "handoff",
      verb: VERB.handoff,
      hint: input.filled === false ? "交接还是空的。写上决定和下一步。" : HINT.handoff,
      lit,
    };
  }
  if (input.wikiBlocked) {
    return { current: "done", next: "done", verb: "写进百科", hint: "百科还拦着。先把交接原文写进百科，再标记完成。", lit };
  }
  return { current: "done", next: "done", verb: VERB.done, hint: HINT.done, lit };
}

export function loopFromOccupancy(
  status: LoopInput["status"],
  occupancy?: {
    evidence: { id: string; lit: boolean; skipped?: boolean }[];
    pulse?: unknown;
    wikiBlocked?: boolean;
  },
  planted = false,
): LoopView {
  const handoff = Boolean(occupancy?.evidence.find((cell) => cell.id === "handoff")?.lit);
  const filledCell = occupancy?.evidence.find((cell) => cell.id === "filled");
  const tree = planted || Boolean(occupancy?.evidence.find((cell) => cell.id === "tree")?.lit);
  return taskLoop({
    status,
    planted: tree,
    pulse: Boolean(occupancy?.pulse),
    handoff,
    filled: filledCell ? Boolean(filledCell.lit) : undefined,
    wikiBlocked: Boolean(occupancy?.wikiBlocked),
  });
}

export type NextHandIntent = "tree" | "pulse" | "handoff" | "done" | "wiki";

export function nextHandIntent(loop: LoopView | null): NextHandIntent | null {
  if (!loop?.next) return null;
  if (loop.next === "tree") return "tree";
  if (loop.next === "pulse") return "pulse";
  if (loop.next === "handoff") return "handoff";
  if (loop.next === "done") return loop.verb === "写进百科" ? "wiki" : "done";
  return null;
}

export function loopForLane(
  lane: { taskId?: string; worktreePath?: string },
  task: { id: string; status: LoopInput["status"] } | undefined,
  occupancy?: Parameters<typeof loopFromOccupancy>[1],
  rootPath?: string,
): LoopView | null {
  if (!task || !lane.taskId || task.id !== lane.taskId) return null;
  const planted = Boolean(
    occupancy?.evidence.find((cell) => cell.id === "tree")?.lit ||
      (lane.worktreePath && lane.worktreePath !== rootPath),
  );
  return loopFromOccupancy(task.status, occupancy, planted);
}
