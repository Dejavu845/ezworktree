import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSelection } from "../src/select.ts";

const tasks = [
  { id: "player" },
  { id: "copy" },
];
const lanes = [
  { id: "task:copy", taskId: "copy", branch: "feat/修提示文案" },
  { id: "task:player", taskId: "player", branch: "lattice/修播放器" },
  { id: "ref:main", branch: "main" },
];

describe("resolveSelection", () => {
  it("on lanes follows taskId even when the forest lane is another task", () => {
    const picked = resolveSelection({
      view: "lanes",
      lanes,
      tasks,
      laneId: "task:copy",
      taskId: "player",
    });
    assert.equal(picked.task?.id, "player");
    assert.equal(picked.lane?.id, "task:player");
  });

  it("on forest binds the task only from the selected lane, not a leftover taskId", () => {
    const main = resolveSelection({
      view: "forest",
      lanes,
      tasks,
      laneId: "ref:main",
      taskId: "player",
    });
    assert.equal(main.lane?.id, "ref:main");
    assert.equal(main.task, null);

    const player = resolveSelection({
      view: "forest",
      lanes,
      tasks,
      laneId: "task:player",
      taskId: "copy",
    });
    assert.equal(player.task?.id, "player");
    assert.equal(player.lane?.branch, "lattice/修播放器");
  });
});
