import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const docs = {
  s3: "docs/quickstart-esp32-s3-sony-ble.md",
  c3: "docs/quickstart-compatible-esp32-c3.md",
  compatibility: "docs/compatibility.md",
  migration: "docs/migration-from-cyberbrick.md",
  validation: "docs/validation.md",
  protocol: "docs/protocol.md",
  troubleshooting: "docs/troubleshooting.md",
  release: "docs/release-v0.1.0.md",
  macro: "docs/klipper-smooth-timelapse-macro.md",
  configurator: "docs/klipper-timelapse-browser-configurator.md",
  video: "docs/video-tutorial-script-cn.md",
  history: "docs/history/sony-ble-research.md",
  snaporca: "docs/snaporca/esp32-timelapse-box-migration-prompt.md"
};

test("public guides cover both complete hardware routes", () => {
  const s3 = read(docs.s3);
  for (const pattern of [
    /## 中文/,
    /## English/,
    /platformio run -e esp32-s3-devkitc-1/,
    /factory\.bin/,
    /Web Serial/,
    /first-time Sony pairing|首次配对 Sony/,
    /no FF01|不写 FF01/i,
    /ready=true/,
    /dry-run/,
    /ARM DRY-RUN VERIFIED/,
    /锁定为 dry-run/,
    /ESP32_TIMELAPSE_SHOT/
  ]) assert.match(s3, pattern);

  const c3 = read(docs.c3);
  for (const pattern of [
    /## 中文/,
    /## English/,
    /MicroPython/,
    /raw REPL/,
    /HTTP polling|HTTP 轮询/,
    /WebSocket agent|WebSocket 代理/,
    /enabled=false/,
    /dry_run=true/,
    /main\.py/,
    /ESP32_TIMELAPSE_SHOT/
  ]) assert.match(c3, pattern);
});

test("compatibility and migration docs preserve every approved alias", () => {
  const compatibility = read(docs.compatibility);
  for (const token of [
    "ESP32_TIMELAPSE_SHOT",
    "CYBERBRICK_SHOT",
    "esp32_timelapse_trigger",
    "cyberbrick_shutter_trigger",
    "esp32_timelapse_fs.py",
    "cyberbrick_fs.py",
    "ESP32_TIMELAPSE_WIFI_PASS",
    "CYBERBRICK_WIFI_PASS"
  ]) assert.match(compatibility, new RegExp(token.replace(".", "\\.")));
  assert.match(compatibility, /not affiliated/i);
  assert.match(compatibility, /Bambu Lab/);

  const migration = read(docs.migration);
  assert.match(migration, /dry-run/i);
  assert.match(migration, /canonical first|规范名称优先/i);
  assert.match(migration, /rollback|回滚/i);
  assert.match(migration, /do not remove|不要删除/i);
});

test("protocol, macro, and validation docs lock the event contract", () => {
  const protocol = read(docs.protocol);
  assert.match(protocol, /one shared sequence|同一个共享序列/i);
  assert.match(protocol, /deduplicat|去重/i);
  assert.match(protocol, /canonical.*legacy/is);

  const macro = read(docs.macro);
  assert.match(macro, /ESP32_TIMELAPSE_SHOT/);
  assert.match(macro, /CYBERBRICK_SHOT/);
  assert.match(macro, /Traditional/);
  assert.match(macro, /Smooth/);
  assert.match(macro, /M400/);
  assert.match(macro, /final purge|最终 purge/i);

  const validation = read(docs.validation);
  assert.match(validation, /135\s*\/\s*135/);
  assert.match(validation, /Sony BLE/);
  assert.match(validation, /automated|自动化/i);
  assert.match(validation, /not yet|尚未/i);
});

test("beginner configurator, troubleshooting, history, and video docs are publication-safe", () => {
  const configurator = read(docs.configurator);
  assert.match(configurator, /ESP32-S3 \+ Sony BLE/);
  assert.match(configurator, /Compatible ESP32-C3|兼容型 ESP32-C3/);
  assert.match(configurator, /Chrome|Edge/);

  const troubleshooting = read(docs.troubleshooting);
  assert.match(troubleshooting, /Sony.*ready=false|ready=false.*Sony/is);
  assert.match(troubleshooting, /macro_source=legacy/);
  assert.match(troubleshooting, /Moonraker/);

  const history = read(docs.history);
  assert.match(history, /Historical research|历史研究/);
  assert.match(history, /not a beginner guide|不是新手教程/i);

  const video = read(docs.video);
  assert.match(video, /ESP32 延时摄影盒子/);
  assert.match(video, /S3/);
  assert.match(video, /C3/);
  assert.match(video, /dry-run/);

  const release = read(docs.release);
  assert.match(release, /engineering prerelease/i);
  assert.match(release, /after erasing its Bluetooth bond database/i);
  assert.match(release, /135 expected frames from 135 layers/i);
  assert.match(release, /SHA256SUMS\.txt/);

  const snaporca = read(docs.snaporca);
  for (const token of [
    "ESP32 Timelapse Box",
    "ESP32 延时摄影盒子",
    "ESP32_TIMELAPSE_SHOT",
    "supports_cyberbrick_timelapse",
    "supports_esp32_timelapse",
    "Traditional",
    "Smooth",
    "final purge",
    "Bambu"
  ]) assert.match(snaporca, new RegExp(token));

  for (const path of Object.values(docs)) {
    const text = read(path);
    assert.doesNotMatch(
      text,
      /"wifi_password"\s*:\s*"(?!\*{6}"|")/i,
      `${path} leaks a Wi-Fi password value`
    );
    assert.doesNotMatch(
      text,
      /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/,
      `${path} leaks a private network address`
    );
    assert.doesNotMatch(text, /\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/, `${path} leaks a device address`);
    assert.doesNotMatch(text, /\b[A-Za-z]:[\\/]/, `${path} leaks an absolute Windows path`);
  }
});

function read(path) {
  return readFileSync(resolve(root, path), "utf-8");
}
