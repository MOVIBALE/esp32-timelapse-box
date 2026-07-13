import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8"));
const scriptPath = resolve(root, "scripts", "smokeWorkflow.mjs");
const screenshotScriptPath = resolve(root, "scripts", "captureScreenshots.mjs");

test("package exposes a safe simulated Web Serial workflow smoke command", () => {
  assert.equal(packageJson.scripts["smoke:workflow"], "node scripts/smokeWorkflow.mjs");
});

test("workflow smoke script uses fake Web Serial and does not arm", () => {
  assert.ok(existsSync(scriptPath), "expected scripts/smokeWorkflow.mjs");
  const source = readFileSync(scriptPath, "utf-8");

  assert.match(source, /buildFakeSerialInjection/);
  assert.match(source, /workflowSmokeSteps/);
  assert.match(source, /s3WorkflowSmokeSteps/);
  assert.match(source, /copyLogSmokeSteps/);
  assert.match(source, /copyReportSmokeSteps/);
  assert.match(source, /recoverySmokeSteps/);
  assert.match(source, /clipboardText/);
  assert.match(source, /reportText/);
  assert.match(source, /recoveryStatus/);
  assert.match(source, /os\.remove/);
  assert.match(source, /__esp32TimelapseSerialWrites/);
  assert.match(source, /startStaticSmokeServer/);
  assert.doesNotMatch(source, /armButton[^;\n]{0,80}\.click\(/);
  assert.doesNotMatch(source, /ARM DRY-RUN VERIFIED/);
});

test("browser smoke scripts start their own local static server by default", () => {
  assert.ok(existsSync(screenshotScriptPath), "expected scripts/captureScreenshots.mjs");
  const workflowSource = readFileSync(scriptPath, "utf-8");
  const screenshotSource = readFileSync(screenshotScriptPath, "utf-8");

  assert.match(workflowSource, /startStaticSmokeServer/);
  assert.match(screenshotSource, /startStaticSmokeServer/);
  assert.doesNotMatch(screenshotSource, /spawnSync/);
});
