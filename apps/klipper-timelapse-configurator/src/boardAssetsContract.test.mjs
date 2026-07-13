import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const assetRoot = resolve(root, "board-assets");

function readAsset(name) {
  return readFileSync(resolve(assetRoot, name), "utf-8");
}

test("bundled board assets do not contain local Wi-Fi credentials or printer IP", () => {
  const bundledText = [
    readAsset("board_listener_config.json"),
    readAsset("board_listener.py"),
    readAsset("board_main.py")
  ].join("\n");

  assert.doesNotMatch(bundledText, /"wifi_password"\s*:\s*"(?!\*{6}"|")/i);
  assert.doesNotMatch(bundledText, /"wifi_ssid"\s*:\s*"(?!")/i);
  assert.doesNotMatch(bundledText, /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/);
});

test("bundled board listener config is disabled dry-run and shareable", () => {
  const config = JSON.parse(readAsset("board_listener_config.json"));

  assert.equal(config.enabled, false);
  assert.equal(config.dry_run, true);
  assert.equal(config.wifi_ssid, "");
  assert.equal(config.wifi_password, "");
  assert.equal(config.u1_host, "printer.local");
});
