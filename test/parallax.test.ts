import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FORGE_SCROLL_TRAVEL, forgeScrollUnit } from "../preview/src/parallax.ts";

describe("forge scroll travel", () => {
  it("maps the first 420px to 0…1 and clamps", () => {
    assert.equal(forgeScrollUnit(0), 0);
    assert.equal(forgeScrollUnit(210), 0.5);
    assert.equal(forgeScrollUnit(FORGE_SCROLL_TRAVEL), 1);
    assert.equal(forgeScrollUnit(800), 1);
    assert.equal(forgeScrollUnit(-40), 0);
    assert.equal(forgeScrollUnit(100, 0), 0);
  });
});
