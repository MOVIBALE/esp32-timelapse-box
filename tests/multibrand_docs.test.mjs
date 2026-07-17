import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("bilingual guides cover flash, one-shot evidence, reconnect, privacy, and stable recovery", () => {
  for (const path of [
    "docs/multibrand-community-testing.md",
    "docs/multibrand-community-testing.zh-CN.md"
  ]) {
    const guide = read(path);
    assert.match(guide, /erase-flash/);
    assert.match(guide, /write-flash 0x0/);
    assert.match(guide, /dispatched=true/);
    assert.match(guide, /ready=true/);
    assert.match(guide, /XX:XX:XX:XX:XX:XX/);
    assert.match(guide, /esp32-timelapse-box-s3-factory-v0\.1\.0\.bin/);
  }
});

test("research and release notes do not claim untested camera compatibility", () => {
  const research = read("docs/experimental-multibrand-camera-ble.md");
  const notes = read("docs/release-multibrand-probe-alpha.1.md");
  assert.match(research, /not a camera\s+compatibility claim/i);
  assert.match(research, /vendors the required Furble camera core/);
  assert.doesNotMatch(research, /combined NimBLE multi-camera firmware/);
  assert.match(notes, /not included[\s\S]*compatibility promise/i);
  assert.match(notes, /not included[\s\S]*Klipper or Moonraker/i);
});

test("community report form requires physical capture and privacy evidence", () => {
  const form = read(".github/ISSUE_TEMPLATE/multibrand-camera-test.yml");
  for (const id of ["probe_version", "camera", "camera_firmware", "paired", "captured", "reconnect", "log", "privacy"]) {
    assert.match(form, new RegExp(`id: ${id}`));
  }
  assert.match(form, /dispatched=true.*not camera confirmation/);
});

test("relative Markdown links in the new guides resolve locally", () => {
  const paths = [
    "firmware/esp32-s3-multibrand-nimble-experimental/README.md",
    "firmware/esp32-s3-multibrand-nimble-experimental/README.zh-CN.md",
    "docs/multibrand-community-testing.md",
    "docs/multibrand-community-testing.zh-CN.md",
    "README.md"
  ];
  for (const path of paths) {
    const directory = dirname(resolve(root, path));
    for (const match of read(path).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(?:https?:|#)/.test(target)) continue;
      assert.equal(existsSync(resolve(directory, target)), true, `${path} has broken link: ${target}`);
    }
  }
});
