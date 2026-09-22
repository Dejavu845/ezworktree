import type { RepoLane } from "./api";
import { isDeckBay, shorten } from "./lanes";

function WorktreeBay({
  lane,
  selected,
  nextHand,
  onSelect,
  onCopyPath,
}: {
  lane: RepoLane;
  selected: boolean;
  nextHand?: string | null;
  onSelect: () => void;
  onCopyPath: (path: string) => void;
}) {
  const path = lane.worktreePath || "";
  return (
    <button type="button" className={selected ? "wt-bay on" : "wt-bay"} onClick={onSelect}>
      <i className="wt-die" aria-hidden />
      <strong className="wt-title">{lane.taskTitle || "还没有任务卡"}</strong>
      <em className="wt-branch">{lane.branch}</em>
      <span
        className="wt-path"
        title={path ? "点击复制路径" : "创建后才会有独立目录"}
        onClick={(event) => {
          if (!path) return;
          event.stopPropagation();
          onCopyPath(path);
        }}
      >
        {path ? shorten(path) : "还没有自己的目录"}
      </span>
      {nextHand ? <span className="wt-next">{nextHand}</span> : null}
    </button>
  );
}

export function WorktreeDeck({
  lanes,
  rootPath,
  nextOf,
  selectedId,
  onSelect,
  onCopyPath,
}: {
  lanes: RepoLane[];
  rootPath: string;
  pinOf?: (branch: string) => number;
  nextOf?: (lane: RepoLane) => string | null;
  selectedId?: string | null;
  motionOn?: boolean;
  onSelect: (lane: RepoLane) => void;
  onCopyPath?: (path: string) => void;
}) {
  const bays = lanes.filter((lane) => isDeckBay(lane, rootPath));
  return (
    <section className="wt-deck" aria-label="工位">
      <p className="eyebrow">工位 · {bays.length} 棵检出</p>
      {bays.length === 0 ? (
        <p className="hint">还没有检出。森林里点分支，对照里创建 worktree。</p>
      ) : (
        <ol className="wt-bays">
          {bays.map((lane) => (
            <li key={lane.id}>
              <WorktreeBay
                lane={lane}
                selected={lane.id === selectedId}
                nextHand={nextOf?.(lane)}
                onSelect={() => onSelect(lane)}
                onCopyPath={(path) => onCopyPath?.(path)}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
