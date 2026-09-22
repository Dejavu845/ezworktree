import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { openRecipe } from "../src/settings.ts";

describe("openIn copy recipe", () => {
  it("builds a command for each target and never implies a spawn", () => {
    assert.deepEqual(openRecipe("cursor", "/tmp/harbor/feat/pay"), {
      openIn: "cursor",
      label: "复制打开命令，不会自动打开",
      command: "cursor /tmp/harbor/feat/pay",
    });
    assert.equal(openRecipe("vscode", "/tmp/app").command, "code /tmp/app");
    assert.equal(openRecipe("finder", "/tmp/app").command, "open /tmp/app");
    assert.equal(openRecipe("terminal", "/tmp/app").command, "cd /tmp/app");
    assert.equal(openRecipe("none", "/tmp/app").command, "/tmp/app");
    assert.equal(openRecipe("cursor", "/tmp/my tree").command, 'cursor "/tmp/my tree"');
    assert.equal(openRecipe(undefined, "/tmp/app").openIn, "cursor");
  });
});
