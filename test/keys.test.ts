import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTypingTarget, shortcutFor } from "../src/keys.ts";

describe("keyboard shortcuts", () => {
  it("sends / to wiki search and 2 to handoff, and does not steal j/k", () => {
    assert.deepEqual(shortcutFor("/", false), { kind: "wiki-search" });
    assert.deepEqual(shortcutFor("2", false), { kind: "tab", tab: "handoff" });
    assert.deepEqual(shortcutFor("n", false), { kind: "next-hand" });
    assert.equal(shortcutFor("j", false), null);
    assert.equal(shortcutFor("k", false), null);
    assert.equal(shortcutFor("ArrowDown", false), null);
  });

  it("stays quiet while typing, including in a select", () => {
    assert.equal(shortcutFor("2", true), null);
    assert.equal(shortcutFor("n", true), null);
    assert.equal(shortcutFor("/", true), null);
    assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
    assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
    assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
    assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
    assert.equal(isTypingTarget(null), false);
  });
});
