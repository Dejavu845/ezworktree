import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loopForLane, nextHandIntent, taskLoop } from "../src/loop.ts";
import { taskLoop as previewLoop } from "../preview/src/loop.ts";

describe("task loop next hand", () => {
  it("starts at planting a tree", () => {
    const view = taskLoop({ status: "backlog", planted: false, pulse: false, handoff: false });
    assert.equal(view.next, "tree");
    assert.equal(view.verb, "创建 worktree");
    assert.equal(view.lit.card, true);
    assert.equal(view.lit.tree, false);
  });

  it("asks for a pulse after the tree, and skips pulse once a handoff exists", () => {
    const pulse = taskLoop({ status: "active", planted: true, pulse: false, handoff: false });
    assert.equal(pulse.next, "pulse");
    assert.equal(pulse.verb, "登记心跳");
    const skip = taskLoop({ status: "active", planted: true, pulse: false, handoff: true });
    assert.equal(skip.next, "done");
    assert.equal(skip.verb, "标记完成");
    const empty = taskLoop({ status: "active", planted: true, pulse: true, handoff: true, filled: false });
    assert.equal(empty.next, "handoff");
    assert.equal(empty.verb, "写交接");
  });

  it("sends wiki-blocked work to compile, and done stays terminal", () => {
    const blocked = taskLoop({
      status: "review",
      planted: true,
      pulse: true,
      handoff: true,
      wikiBlocked: true,
    });
    assert.equal(blocked.verb, "写进百科");
    const done = taskLoop({ status: "done", planted: true, pulse: true, handoff: true });
    assert.equal(done.next, null);
    assert.equal(done.verb, "已完成");
    assert.equal(done.lit.done, true);
  });

  it("reads the next hand for a planted bay and stays silent without a task", () => {
    const planted = loopForLane(
      { taskId: "t1", worktreePath: "/tmp/tree" },
      { id: "t1", status: "active" },
      { evidence: [{ id: "tree", lit: true }, { id: "handoff", lit: false }] },
      "/tmp/repo",
    );
    assert.equal(planted?.verb, "登记心跳");
    const orphan = loopForLane({ worktreePath: "/tmp/tree" }, { id: "t1", status: "active" });
    assert.equal(orphan, null);
    const mismatch = loopForLane({ taskId: "t2", worktreePath: "/tmp/tree" }, { id: "t1", status: "active" });
    assert.equal(mismatch, null);
    const leftover = loopForLane(
      { taskId: "t1", worktreePath: "" },
      { id: "t1", status: "review" },
      { evidence: [{ id: "tree", lit: false }, { id: "handoff", lit: false }] },
      "/tmp/repo",
    );
    assert.equal(leftover?.verb, "写交接");
    assert.equal(leftover?.next, "handoff");
    const reviewDone = taskLoop({ status: "review", planted: false, pulse: false, handoff: true });
    assert.equal(reviewDone.verb, "标记完成");
    assert.equal(reviewDone.next, "done");
    const primary = loopForLane(
      { taskId: "t1", worktreePath: "/tmp/repo" },
      { id: "t1", status: "active" },
      { evidence: [{ id: "tree", lit: false }, { id: "handoff", lit: false }] },
      "/tmp/repo",
    );
    assert.equal(primary?.verb, "创建 worktree");
  });

  it("maps the next hand to a key action without using j/k", () => {
    assert.equal(nextHandIntent(taskLoop({ status: "backlog", planted: false, pulse: false, handoff: false })), "tree");
    assert.equal(nextHandIntent(taskLoop({ status: "review", planted: false, pulse: false, handoff: false })), "handoff");
    assert.equal(nextHandIntent(taskLoop({ status: "active", planted: true, pulse: false, handoff: false })), "pulse");
    assert.equal(nextHandIntent(taskLoop({ status: "active", planted: true, pulse: false, handoff: true })), "done");
    assert.equal(
      nextHandIntent(
        taskLoop({ status: "review", planted: true, pulse: true, handoff: true, wikiBlocked: true }),
      ),
      "wiki",
    );
    assert.equal(nextHandIntent(taskLoop({ status: "done", planted: true, pulse: true, handoff: true })), null);
  });

  it("keeps the preview next-hand copy in step with the engine", () => {
    const samples = [
      { status: "backlog" as const, planted: false, pulse: false, handoff: false },
      { status: "active" as const, planted: true, pulse: true, handoff: true, filled: false },
      { status: "active" as const, planted: true, pulse: true, handoff: true, wikiBlocked: true },
      { status: "done" as const, planted: true, pulse: true, handoff: true },
    ];
    for (const sample of samples) {
      assert.deepEqual(previewLoop(sample), taskLoop(sample));
    }
  });
});
