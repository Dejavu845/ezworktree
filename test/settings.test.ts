import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { defaultAppSettings, mergeAppSettings } from "../src/settings.ts";
import { updateAppSettings } from "../src/service.ts";

const HOME = mkdtempSync(join(tmpdir(), "settings-home-"));
process.env.LATTICE_HOME = HOME;

after(() => {
  rmSync(HOME, { recursive: true, force: true });
});

describe("app settings skin", () => {
  it("defaults to lean and only accepts forge as the other skin", () => {
    const base = defaultAppSettings();
    assert.equal(base.skin, "lean");
    assert.equal(base.forgeDecor, "off");
    assert.equal(mergeAppSettings({ skin: "forge" }).skin, "forge");
    assert.equal(mergeAppSettings({ skin: "neon" as never }).skin, "lean");
    assert.equal(mergeAppSettings({ forgeDecor: "on" }).forgeDecor, "on");
    assert.equal(mergeAppSettings({ forgeDecor: "sparkle" as never }).forgeDecor, "off");
    const saved = updateAppSettings({ skin: "forge" });
    assert.equal(saved.skin, "forge");
    assert.equal(saved.forgeDecor, "off");
    assert.equal(updateAppSettings({ skin: "lean" }).skin, "lean");
    assert.equal(updateAppSettings({ forgeDecor: "on" }).forgeDecor, "on");
  });
});
