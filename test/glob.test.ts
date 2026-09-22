import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchesGlob } from "../src/glob.ts";

describe("glob", () => {
  it("matches ** and directory prefixes", () => {
    assert.equal(matchesGlob("app/page.tsx", "app/**"), true);
    assert.equal(matchesGlob("app/page.tsx", "lib/**"), false);
    assert.equal(matchesGlob("messages/zh.json", "messages/**"), true);
    assert.equal(matchesGlob("package.json", "package.json"), true);
    assert.equal(matchesGlob(".env.local", ".env.*"), true);
    assert.equal(matchesGlob("out/index.html", "out/**"), true);
  });
});
