import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { viewDirection } from "../preview/src/verbs.ts";

describe("motion view direction", () => {
  it("orders 掌控 → 全部分支 → 任务车道", () => {
    assert.equal(viewDirection("holdings", "forest"), 1);
    assert.equal(viewDirection("forest", "lanes"), 1);
    assert.equal(viewDirection("lanes", "holdings"), -1);
    assert.equal(viewDirection("holdings", "holdings"), 0);
    assert.equal(viewDirection("nope", "forest"), 0);
  });
});
