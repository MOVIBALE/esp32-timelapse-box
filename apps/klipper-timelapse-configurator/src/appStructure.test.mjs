import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "index.html"), "utf-8");

test("formal app exposes the required beginner workflow controls", () => {
  for (const id of [
    "connectButton",
    "uploadSafeButton",
    "enableDryRunButton",
    "softResetButton",
    "recoverButton",
    "copyReportButton",
    "copyLogButton"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("formal app exposes safe ESP32-S3 setup controls", () => {
  for (const id of [
    "provisionS3Button",
    "pairSonyButton",
    "connectSonyButton",
    "s3StatusButton",
    "disarmS3Button"
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("formal app exposes a dry-run observation readout", () => {
  for (const id of ["lastLayer", "totalLayer", "currentFile", "lastEventAt", "dryRunEvents"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("formal app places primary board actions before the settings form", () => {
  const actionsIndex = html.indexOf('<div class="actions">');
  const settingsIndex = html.indexOf('<form class="settings" id="settingsForm">');
  assert.ok(actionsIndex > -1, "expected primary action group");
  assert.ok(settingsIndex > -1, "expected settings form");
  assert.ok(actionsIndex < settingsIndex, "primary board actions should not be buried below settings");
});

test("formal app places tutorial checklist before the settings form", () => {
  const checklistIndex = html.indexOf('id="tutorialChecklist"');
  const settingsIndex = html.indexOf('<form class="settings" id="settingsForm">');
  assert.ok(checklistIndex > -1, "expected tutorial checklist");
  assert.ok(settingsIndex > -1, "expected settings form");
  assert.ok(checklistIndex < settingsIndex, "checklist should be visible before deep configuration fields");
});

test("formal app exposes a current-step cue before primary actions", () => {
  const cueIndex = html.indexOf('id="tutorialStepCue"');
  const actionsIndex = html.indexOf('<div class="actions">');
  assert.ok(cueIndex > -1, "expected current-step cue");
  assert.ok(actionsIndex > -1, "expected primary actions");
  assert.ok(cueIndex < actionsIndex, "current-step cue should appear before the action stack on mobile");
});

test("formal app chooses a hardware route before showing primary actions", () => {
  const routeIndex = html.indexOf('id="hardwareRouteSelector"');
  const actionsIndex = html.indexOf('<div class="actions">');

  assert.ok(routeIndex > -1, "expected hardware route selector");
  assert.ok(actionsIndex > -1, "expected primary actions");
  assert.ok(routeIndex < actionsIndex, "hardware route must be selected before actions");
  assert.match(html, /data-route="esp32-s3-sony-ble"/);
  assert.match(html, /data-route="esp32-c3-compatible"/);
});

test("formal app does not ship local Wi-Fi or printer defaults", () => {
  assert.doesNotMatch(html, /id="ssidInput"[^>]*\svalue="[^"]+"/i);
  assert.doesNotMatch(html, /"wifi_password"\s*:\s*"(?!\*{6}"|")/i);
  assert.doesNotMatch(html, /\b(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/);
  assert.doesNotMatch(html, /id="passwordInput"[^>]*value=/);
});

test("formal app exposes Moonraker browser preflight controls", () => {
  assert.match(html, /id="testMoonrakerButton"/);
  assert.match(html, /id="moonrakerStatus"/);
});

test("formal app exposes a recovery status readout", () => {
  assert.match(html, /id="recoveryStatus"/);
  assert.match(html, /class="recovery-strip"[^>]*>[\s\S]*id="recoveryStatus"[\s\S]*<details class="advanced"[^>]*>/);
});

test("formal app exposes a beginner tutorial checklist", () => {
  assert.match(html, /id="tutorialChecklist"/);
  for (const checkpoint of [
    "connect",
    "safe-upload",
    "dry-run",
    "layer-seen",
    "recover"
  ]) {
    assert.match(html, new RegExp(`data-checkpoint="${checkpoint}"`));
  }
});

test("formal app keeps armed behind an explicit phrase input", () => {
  assert.match(html, /id="armedPhraseInput"/);
  assert.match(html, /ARM DRY-RUN VERIFIED/);
  assert.match(html, /id="armButton"/);
});

test("formal app keeps raw REPL and probe actions behind explained advanced diagnostics", () => {
  const advanced = html.match(/<details class="advanced"[^>]*>[\s\S]*?<\/details>/)?.[0] ?? "";
  assert.match(advanced, /<summary data-i18n="advancedDebug">/);
  assert.match(advanced, /class="advanced-copy" data-i18n="advancedDebugCopy"/);

  for (const id of [
    "rawEnterButton",
    "rawExitButton",
    "probeButton",
    "removeProbeButton"
  ]) {
    assert.match(advanced, new RegExp(`id="${id}"`), `${id} should stay inside advanced diagnostics`);
  }
});

test("formal app loads no Electron entrypoint", () => {
  assert.doesNotMatch(html, /electron|preload|ipc/i);
});
