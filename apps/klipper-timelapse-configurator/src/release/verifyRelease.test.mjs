import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workspaceRoot = resolve(appRoot, "../..");
const verifyModulePath = resolve(appRoot, "src/release/verifyRelease.js");
const verifyScriptPath = resolve(appRoot, "scripts/verifyRelease.mjs");
const packageJson = JSON.parse(readFileSync(resolve(appRoot, "package.json"), "utf-8"));

test("package exposes a one-command safe release verifier", () => {
  assert.equal(packageJson.scripts["verify:release"], "node scripts/verifyRelease.mjs");
  assert.equal(existsSync(verifyModulePath), true, "expected verifyRelease module");
  assert.equal(existsSync(verifyScriptPath), true, "expected verifyRelease script");
});

test("release verifier covers all non-hardware gates without serial or armed operations", async () => {
  const { buildReleaseVerificationSteps } = await importVerifyRelease();
  const steps = buildReleaseVerificationSteps({ appRoot, workspaceRoot, platform: "win32" });
  const names = steps.map((step) => step.name);
  const combinedCommands = steps.flatMap((step) => step.command).join(" ");

  for (const required of [
    "formal app tests",
    "public Node contract tests",
    "compatible ESP32-C3 Python tests",
    "ESP32-S3 ESP-IDF firmware build",
    "release package check",
    "release zip build",
    "public release asset build",
    "Windows PowerShell fallback smoke",
    "simulated Web Serial workflow smoke",
    "screenshot smoke"
  ]) {
    assert.ok(names.includes(required), `${required} should be verified`);
  }

  assert.ok(
    names.indexOf("release package check") < names.indexOf("release zip build"),
    "release zip build should run after release package check"
  );
  assert.ok(
    names.indexOf("release zip build") < names.indexOf("public release asset build"),
    "public assets should be built after the checked configurator zip"
  );

  assert.doesNotMatch(combinedCommands, /--port\s+COM6/i);
  assert.doesNotMatch(combinedCommands, /--upload-port/i);
  assert.doesNotMatch(combinedCommands, /ARM DRY-RUN VERIFIED/i);
  assert.doesNotMatch(combinedCommands, /--trigger/i);
  assert.doesNotMatch(combinedCommands, /web-serial-com6-check/i);
  assert.doesNotMatch(combinedCommands, /sony_ble_protocol\.test/i);
  assert.match(combinedCommands, /public_release_builder\.test\.mjs/i);
});

test("release verifier skips the Windows fallback on non-Windows platforms", async () => {
  const { buildReleaseVerificationSteps } = await importVerifyRelease();
  const steps = buildReleaseVerificationSteps({ appRoot, workspaceRoot, platform: "darwin" });

  assert.equal(steps.some((step) => step.name === "Windows PowerShell fallback smoke"), false);
  assert.equal(steps.some((step) => step.name === "simulated Web Serial workflow smoke"), true);
});

async function importVerifyRelease() {
  assert.equal(existsSync(verifyModulePath), true, "expected src/release/verifyRelease.js");
  return import(`${pathToFileURL(verifyModulePath).href}?t=${Date.now()}`);
}
